"""Real SQL sports-money proofs. Only disposable Unix-socket PostgreSQL is reachable."""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest

from server.predictions.pools import Stake, plan_settlement

pytestmark = pytest.mark.skipif(
    os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in disposable PostgreSQL checks"
)
ROOT = Path(__file__).resolve().parents[4]
MIGRATION = ROOT / "supabase/migrations/20261106180000_sports_desk.sql"


def seed(database, count=1):
    database.execute("reset role")
    players = [uuid4() for _ in range(count)]
    for player in players:
        database.execute("insert into auth.users(id) values (%s)", (player,))
        database.execute(
            "select public.apply_wallet_transaction(%s, 1000, 'kit_grant', 'sports-fixture')",
            (player,),
        )
    database.execute("set local role service_role")
    return players


def fixture_id():
    return f"fd-{100000 + uuid4().int % 900000000}"


def stake(database, fixture, player, *, pick="home", amount=50, uid=None, **changes):
    kickoff = datetime.now(UTC) + timedelta(days=1)
    day = database.execute(
        "select date_trunc('day', clock_timestamp() at time zone 'Europe/Lisbon') "
        "at time zone 'Europe/Lisbon'"
    ).fetchone()[0]
    params = {
        "fixture_id": fixture,
        "player_id": player,
        "pick": pick,
        "amount": amount,
        "stake_id": uid or f"stake-{uuid4().hex}",
        "provider": "football-data.org",
        "provider_match_id": int(fixture.split("-")[1]),
        "sport": "football",
        "competition": "Test league",
        "home": "Test home",
        "away": "Test away",
        "kickoff": kickoff,
        "closes_at": kickoff - timedelta(hours=1),
        "max_stake": 50,
        "daily_cap": 200,
        "day_start": day,
    } | changes
    placeholders = ",".join("%s" for _ in params)
    return database.execute(
        f"select public.sports_place_stake({placeholders})", list(params.values())
    ).fetchone()[0]


def past(database, fixture):
    database.execute("reset role")
    database.execute(
        "update public.fixtures set kickoff = now() - interval '1 hour', "
        "closes_at = now() - interval '2 hours' where fixture_id = %s",
        (fixture,),
    )
    database.execute("set local role service_role")


def settlement_arguments(database, fixture, *, outcome="home", status="finished"):
    rows = database.execute(
        "select id, player_id, pick, amount from public.sports_stakes "
        "where fixture_id = %s order by id",
        (fixture,),
    ).fetchall()
    plan = plan_settlement([Stake(row[0], str(row[1]), row[2], row[3]) for row in rows], outcome, 5)
    scores = {"home": (2, 1), "away": (1, 2), "draw": (1, 1), "void": (None, None)}[outcome]
    return [
        fixture,
        outcome,
        "football-data.org",
        int(fixture.split("-")[1]),
        *scores,
        status,
        [row[0] for row in rows],
        [
            {"row_id": item.row_id, "player_id": item.player_id, "coins": item.coins}
            for item in plan.payouts
        ],
        5,
    ]


def settle(database, fixture, *, outcome="home", status="finished", arguments=None):
    from psycopg.types.json import Jsonb

    arguments = arguments or settlement_arguments(database, fixture, outcome=outcome, status=status)
    copied = [*arguments]
    copied[8] = Jsonb(copied[8])
    return database.execute(
        "select public.sports_settle_fixture(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        copied,
    ).fetchone()[0]


def test_full_chain_and_sports_file_reapply_without_creating_games_or_money(database):
    before = tuple(
        database.execute(f"select count(*) from public.{table}").fetchone()[0]
        for table in ("fixtures", "sports_stakes", "wallet_transactions")
    )
    database.execute(MIGRATION.read_text())
    database.execute(MIGRATION.read_text())
    assert (
        tuple(
            database.execute(f"select count(*) from public.{table}").fetchone()[0]
            for table in ("fixtures", "sports_stakes", "wallet_transactions")
        )
        == before
    )


def test_stake_is_atomic_once_per_fixture_and_durable_uid(database):
    (player,) = seed(database)
    fixture = fixture_id()
    first = stake(database, fixture, player, uid="same-action-001")
    repeated = stake(database, fixture, player, uid="same-action-001")
    assert first["status"] == "done" and repeated["status"] == "repeat"
    assert first["id"] == repeated["id"] and repeated["coins"] == 950
    assert stake(database, fixture, player)["reason"] == "already_staked"
    assert (
        stake(database, fixture_id(), player, uid="same-action-001")["reason"]
        == "stake_id_conflict"
    )
    assert (
        stake(database, fixture, player, pick="away", uid="same-action-001")["reason"]
        == "stake_id_conflict"
    )
    assert database.execute(
        "select count(*) from public.wallet_transactions where player_id = %s "
        "and reason = 'prediction_stake' and ref like 'sports:stake:%%'",
        (player,),
    ).fetchone() == (1,)


@pytest.mark.parametrize(
    "changes",
    [
        {"amount": 0},
        {"amount": 51},
        {"max_stake": 51},
        {"daily_cap": 201},
        {"provider": "untrusted"},
        {"sport": "basketball"},
        {"stake_id": "short"},
        {"day_start": datetime(2000, 1, 1, tzinfo=UTC)},
    ],
)
def test_invalid_stakes_cannot_move_money(database, changes):
    import psycopg

    (player,) = seed(database)
    with pytest.raises(psycopg.errors.RaiseException), database.transaction():
        stake(database, fixture_id(), player, **changes)
    assert database.execute(
        "select balance from public.wallets where player_id = %s", (player,)
    ).fetchone() == (1000,)


def test_cutoff_is_one_hour_and_can_never_reopen(database):
    first, second = seed(database, 2)
    fixture = fixture_id()
    assert stake(database, fixture, first)["status"] == "done"
    old = datetime.now(UTC) - timedelta(seconds=1)
    answer = stake(database, fixture, second, kickoff=old + timedelta(hours=1), closes_at=old)
    assert answer["reason"] == "fixture_closed"
    assert stake(database, fixture, second)["reason"] == "fixture_closed"


@pytest.mark.parametrize(
    "outcome,picks,status,expected",
    [
        ("home", ("home", "away", "draw"), "finished", "winners"),
        ("away", ("home", "draw", "home"), "finished", "refund_no_winners"),
        ("draw", ("draw", "draw", "draw"), "finished", "refund_one_sided"),
        ("void", ("home", "away", "draw"), "postponed", "refund_void"),
        ("void", ("home", "away", "draw"), "cancelled", "refund_void"),
        ("void", ("home", "away", "draw"), "suspended", "refund_void"),
    ],
)
def test_verified_result_pays_shared_pool_plan_once_and_conserves_money(
    database, outcome, picks, status, expected
):
    players = seed(database, len(picks))
    fixture = fixture_id()
    for player, pick in zip(players, picks, strict=True):
        stake(database, fixture, player, pick=pick)
    if outcome != "void":
        past(database, fixture)
    result = settle(database, fixture, outcome=outcome, status=status)
    assert result["status"] == "done" and result["settlement"] == expected
    assert result["paidCoins"] + result["cutCoins"] == 150
    assert settle(database, fixture, outcome=outcome, status=status)["status"] == "repeat"
    assert (
        database.execute(
            "select sum(payout) from public.sports_stakes where fixture_id = %s",
            (fixture,),
        ).fetchone()[0]
        == result["paidCoins"]
    )
    assert (
        database.execute(
            "select sum(delta) from public.wallet_transactions where ref = %s",
            (f"sports:pool:{fixture}",),
        ).fetchone()[0]
        == result["paidCoins"]
    )


def test_remainders_match_the_exact_shared_plan_and_tampering_rolls_back(database):
    import psycopg

    players = seed(database, 4)
    fixture = fixture_id()
    for player, pick, amount in zip(
        players, ("home", "home", "home", "away"), (1, 2, 3, 41), strict=True
    ):
        stake(database, fixture, player, pick=pick, amount=amount)
    past(database, fixture)
    arguments = settlement_arguments(database, fixture)
    bad = [*arguments]
    bad[8] = [dict(item) for item in arguments[8]]
    bad[8][0]["coins"] += 1
    with pytest.raises(psycopg.errors.RaiseException), database.transaction():
        settle(database, fixture, arguments=bad)
    assert database.execute(
        "select status from public.fixtures where fixture_id = %s", (fixture,)
    ).fetchone() == ("open",)
    result = settle(database, fixture, arguments=arguments)
    assert result["paidCoins"] == 45 and result["cutCoins"] == 2


@pytest.mark.parametrize(
    "mutator",
    [
        lambda a: a.__setitem__(6, "playing"),
        lambda a: a.__setitem__(1, "away"),
        lambda a: a.__setitem__(2, "untrusted"),
        lambda a: a.__setitem__(4, None),
    ],
)
def test_nonfinal_mismatched_or_incomplete_provider_results_never_pay(database, mutator):
    import psycopg

    (player,) = seed(database)
    fixture = fixture_id()
    stake(database, fixture, player)
    past(database, fixture)
    arguments = settlement_arguments(database, fixture)
    mutator(arguments)
    with pytest.raises(psycopg.errors.RaiseException), database.transaction():
        settle(database, fixture, arguments=arguments)
    assert database.execute(
        "select payout from public.sports_stakes where fixture_id = %s", (fixture,)
    ).fetchone() == (None,)


def test_final_result_before_kickoff_is_refused_and_stale_stakes_retry(database):
    import psycopg

    (player,) = seed(database)
    fixture = fixture_id()
    stake(database, fixture, player)
    with pytest.raises(psycopg.errors.RaiseException), database.transaction():
        settle(database, fixture)
    past(database, fixture)
    arguments = settlement_arguments(database, fixture)
    arguments[7] = []
    assert settle(database, fixture, arguments=arguments) == {
        "status": "refused",
        "reason": "stakes_changed",
    }


def test_settled_pool_is_immutable_and_browser_roles_have_no_access(database):
    import psycopg

    (player,) = seed(database)
    fixture = fixture_id()
    stake(database, fixture, player)
    settle(database, fixture, outcome="void", status="cancelled")
    with pytest.raises(psycopg.errors.RaiseException), database.transaction():
        database.execute(
            "update public.fixtures set status = 'open' where fixture_id = %s", (fixture,)
        )
    for role in ("anon", "authenticated"):
        for table in ("fixtures", "sports_stakes"):
            assert not database.execute(
                "select has_table_privilege(%s,%s,'select,insert,update,delete')",
                (role, f"public.{table}"),
            ).fetchone()[0]
        assert database.execute(
            "select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace "
            "and p.proname like 'sports_%%' and has_function_privilege(%s,p.oid,'execute')",
            (role,),
        ).fetchone() == (0,)
    assert database.execute(
        "select count(*) from pg_class "
        "where relname in ('fixtures','sports_stakes') and relrowsecurity"
    ).fetchone() == (2,)


def run_parallel(server, jobs):
    import psycopg

    barrier = Barrier(len(jobs))

    def run(job):
        with psycopg.connect(server.get_uri()) as database:
            database.execute("set local role service_role")
            barrier.wait(timeout=10)
            return job(database)

    with ThreadPoolExecutor(max_workers=len(jobs)) as executor:
        return list(executor.map(run, jobs))


def test_concurrent_same_stake_uid_debits_once(scratch_server):
    import psycopg

    with psycopg.connect(scratch_server.get_uri()) as setup:
        (player,) = seed(setup)
    fixture = fixture_id()
    jobs = [lambda db: stake(db, fixture, player, uid="concurrent-uid-001") for _ in range(2)]
    answers = run_parallel(scratch_server, jobs)
    assert sorted(answer["status"] for answer in answers) == ["done", "repeat"]
    with psycopg.connect(scratch_server.get_uri()) as database:
        assert database.execute(
            "select balance from public.wallets where player_id = %s",
            (player,),
        ).fetchone() == (950,)
        database.execute("delete from auth.users where id = %s", (player,))


def test_two_fixture_locks_cannot_race_past_the_daily_cap(scratch_server):
    import psycopg

    with psycopg.connect(scratch_server.get_uri()) as setup:
        (player,) = seed(setup)
        for _ in range(3):
            stake(setup, fixture_id(), player)
    first, second = fixture_id(), fixture_id()
    answers = run_parallel(
        scratch_server,
        [
            lambda db: stake(db, first, player),
            lambda db: stake(db, second, player),
        ],
    )
    assert sorted(answer["status"] for answer in answers) == ["done", "refused"]
    assert (
        next(answer["reason"] for answer in answers if answer["status"] == "refused") == "daily_cap"
    )
    with psycopg.connect(scratch_server.get_uri()) as database:
        assert database.execute(
            "select sum(amount) from public.sports_stakes where player_id = %s",
            (player,),
        ).fetchone() == (200,)
        assert database.execute(
            "select balance from public.wallets where player_id = %s",
            (player,),
        ).fetchone() == (800,)
        database.execute("delete from auth.users where id = %s", (player,))


def test_two_settlements_pay_the_same_fixture_once(scratch_server):
    import psycopg

    fixture = fixture_id()
    with psycopg.connect(scratch_server.get_uri()) as setup:
        players = seed(setup, 2)
        for player, pick in zip(players, ("home", "away"), strict=True):
            stake(setup, fixture, player, pick=pick)
        past(setup, fixture)
        arguments = settlement_arguments(setup, fixture)
    answers = run_parallel(
        scratch_server,
        [
            lambda db: settle(db, fixture, arguments=arguments),
            lambda db: settle(db, fixture, arguments=arguments),
        ],
    )
    assert sorted(answer["status"] for answer in answers) == ["done", "repeat"]
    with psycopg.connect(scratch_server.get_uri()) as database:
        assert database.execute(
            "select count(*), sum(delta) from public.wallet_transactions where ref = %s",
            (f"sports:pool:{fixture}",),
        ).fetchone() == (1, 98)
        for player in players:
            database.execute("delete from auth.users where id = %s", (player,))


def test_a_stake_racing_a_refund_is_refused_or_forces_a_fresh_snapshot(scratch_server):
    import psycopg

    fixture = fixture_id()
    with psycopg.connect(scratch_server.get_uri()) as setup:
        first, second = seed(setup, 2)
        stake(setup, fixture, first)
        arguments = settlement_arguments(setup, fixture, outcome="void", status="cancelled")
    stake_answer, settle_answer = run_parallel(
        scratch_server,
        [
            lambda db: stake(db, fixture, second),
            lambda db: settle(db, fixture, arguments=arguments),
        ],
    )
    with psycopg.connect(scratch_server.get_uri()) as database:
        database.execute("set local role service_role")
        if stake_answer["status"] == "done":
            assert settle_answer == {"status": "refused", "reason": "stakes_changed"}
            assert settle(database, fixture, outcome="void", status="cancelled")["status"] == "done"
        else:
            assert stake_answer["reason"] == "fixture_closed" and settle_answer["status"] == "done"
        assert database.execute(
            "select sum(balance) from public.wallets where player_id in (%s,%s)",
            (first, second),
        ).fetchone() == (2000,)
        database.execute("reset role")
        for player in (first, second):
            database.execute("delete from auth.users where id = %s", (player,))


def test_two_fixtures_settling_shared_players_lock_wallets_in_the_same_order(scratch_server):
    import psycopg

    first, second = fixture_id(), fixture_id()
    with psycopg.connect(scratch_server.get_uri()) as setup:
        players = seed(setup, 3)
        for fixture in (first, second):
            for player in reversed(players):
                stake(setup, fixture, player)
        first_args = settlement_arguments(setup, first, outcome="void", status="postponed")
        second_args = settlement_arguments(setup, second, outcome="void", status="postponed")
    answers = run_parallel(
        scratch_server,
        [
            lambda db: settle(db, first, arguments=first_args),
            lambda db: settle(db, second, arguments=second_args),
        ],
    )
    assert all(answer["status"] == "done" for answer in answers)
    with psycopg.connect(scratch_server.get_uri()) as database:
        for player in players:
            assert database.execute(
                "select balance from public.wallets where player_id = %s",
                (player,),
            ).fetchone() == (1000,)
            database.execute("delete from auth.users where id = %s", (player,))


def test_insufficient_funds_rolls_back_the_stake_and_wallet_ledger(database):
    import psycopg

    (player,) = seed(database)
    database.execute("reset role")
    database.execute("update public.wallets set balance = 10 where player_id = %s", (player,))
    database.execute("set local role service_role")
    fixture = fixture_id()
    with pytest.raises(psycopg.errors.RaiseException), database.transaction():
        stake(database, fixture, player, amount=50)
    assert database.execute(
        "select count(*) from public.sports_stakes where fixture_id = %s",
        (fixture,),
    ).fetchone() == (0,)
    assert database.execute(
        "select balance from public.wallets where player_id = %s",
        (player,),
    ).fetchone() == (10,)


def test_basketball_identity_accepts_home_or_away_and_never_a_draw(database):
    import psycopg

    (player,) = seed(database)
    fixture = fixture_id().replace("fd-", "bdl-")
    with pytest.raises(psycopg.errors.RaiseException), database.transaction():
        stake(database, fixture, player, pick="draw", provider="balldontlie", sport="basketball")
    assert (
        stake(database, fixture, player, pick="home", provider="balldontlie", sport="basketball")[
            "status"
        ]
        == "done"
    )
    past(database, fixture)
    arguments = settlement_arguments(database, fixture, outcome="draw")
    arguments[2] = "balldontlie"
    with pytest.raises(psycopg.errors.RaiseException), database.transaction():
        settle(database, fixture, arguments=arguments)


@pytest.mark.parametrize(
    "kind", ["duplicate", "missing", "wrong-player", "fractional", "nonobject"]
)
def test_payout_json_must_match_every_exact_recipient_and_coin(database, kind):
    import psycopg

    (player,) = seed(database)
    fixture = fixture_id()
    stake(database, fixture, player)
    arguments = settlement_arguments(database, fixture, outcome="void", status="cancelled")
    if kind == "duplicate":
        arguments[8].append(dict(arguments[8][0]))
    elif kind == "missing":
        arguments[8] = []
    elif kind == "wrong-player":
        arguments[8][0]["player_id"] = str(uuid4())
    elif kind == "fractional":
        arguments[8][0]["coins"] = 50.5
    else:
        arguments[8] = [None]
    with pytest.raises(psycopg.errors.RaiseException), database.transaction():
        settle(database, fixture, arguments=arguments)
    assert database.execute(
        "select balance from public.wallets where player_id = %s",
        (player,),
    ).fetchone() == (950,)


def test_reapplying_repairs_rls_and_grants_without_new_browser_rights(database):
    database.execute("alter table public.fixtures disable row level security")
    database.execute("grant all on public.fixtures, public.sports_stakes to anon")
    database.execute("revoke update on public.fixtures from service_role")
    database.execute(MIGRATION.read_text())
    assert database.execute(
        "select relrowsecurity from pg_class where oid = 'public.fixtures'::regclass"
    ).fetchone() == (True,)
    assert not database.execute(
        "select has_table_privilege('anon','public.fixtures','select')"
    ).fetchone()[0]
    assert database.execute(
        "select has_table_privilege('service_role','public.fixtures','update')"
    ).fetchone()[0]
    assert database.execute(
        "select count(*) from pg_proc where pronamespace='public'::regnamespace "
        "and proname like 'sports_%' and (prosecdef or proconfig <> array['search_path=\"\"'])"
    ).fetchone() == (0,)


def test_sports_migration_parses_as_postgres_without_browser_policies():
    pglast = pytest.importorskip("pglast")
    sql = MIGRATION.read_text()
    assert pglast.parse_sql(sql)
    assert "create policy" not in sql.lower()
