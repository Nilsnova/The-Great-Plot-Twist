"""Attack the real migrations on disposable Postgres, never a configured database.

Run: uv run --frozen --with pgserver --with 'psycopg[binary]' pytest -q
     server/tests/abuse/test_scratch_postgres.py
Ordinary pytest explicitly skips these tests if the two test-only extras are absent.
"""

import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from threading import Barrier

import pytest

from server.crews.codes import MAX_WRONG_CODES, WRONG_CODE_WINDOW_SECONDS
from server.market.game_day import game_day_start
from server.market.positions import (
    DAILY_STAKE_CAP_COINS,
    FEE_BASIS_POINTS,
    MAX_OPEN_POSITIONS,
    MAX_STAKE_COINS,
    MIN_STAKE_COINS,
    closing_amounts,
    fee_for,
)
from server.market.states import SweepPrice
from server.market.store_calls import close_arguments, open_arguments, sweep_arguments

MIGRATIONS = Path(__file__).resolve().parents[4] / "supabase/migrations"


@pytest.fixture(scope="module")
def scratch_uri():
    pgserver = pytest.importorskip("pgserver", reason="scratch SQL requires --with pgserver")
    psycopg = pytest.importorskip("psycopg", reason="scratch SQL requires --with psycopg[binary]")
    with tempfile.TemporaryDirectory(prefix="g12-") as directory:
        server = pgserver.get_server(Path(directory) / "db", cleanup_mode="stop")
        try:
            uri = server.get_uri()
            with psycopg.connect(uri, autocommit=True) as connection:
                assert connection.info.host.startswith("/"), "Only scratch Unix sockets allowed"
                stub = Path(__file__).parents[1] / "group3_sql/stub.sql"
                connection.execute(stub.read_text())
                files = sorted(MIGRATIONS.glob("*.sql"))
                assert any(path.name == "20261106090000_exchange_leverage.sql" for path in files)
                for path in files:
                    connection.execute(path.read_text())
            yield uri
        finally:
            server.cleanup()


class Scratch:
    """Always creates connections from the fixture's private Unix-socket URI."""

    def __init__(self, uri):
        import psycopg

        self.uri, self.psycopg = uri, psycopg

    def execute(self, query, values=(), role=None):
        with self.psycopg.connect(self.uri, autocommit=True) as connection:
            connection.execute("set statement_timeout = '8s'")
            connection.execute("set lock_timeout = '5s'")
            if role:
                assert role in ("service_role", "authenticated", "anon")
                connection.execute(f"set role {role}")
            result = connection.execute(query, values)
            return result.fetchall() if result.description else []

    def rpc(self, name, *args):
        assert name.replace("_", "").isalpha()
        placeholders = ",".join(["%s"] * len(args))
        try:
            return self.execute(f"select public.{name}({placeholders})", args, role="service_role")[
                0
            ][0]
        except self.psycopg.Error as error:
            return {"sqlstate": error.sqlstate, "message": error.diag.message_primary}

    def player(self, coins=0):
        player = uuid.uuid4()
        self.execute("insert into auth.users(id) values (%s)", (player,))
        if coins:
            assert (
                self.rpc("apply_wallet_transaction", player, coins, "admin_adjust", "seed") == coins
            )
        return player

    def open(self, player, ref, stake=MAX_STAKE_COINS, side="rising", mode="replay", **overrides):
        arguments = open_arguments(
            str(player),
            "scratch-co",
            side,
            mode,
            Decimal(100),
            stake,
            fee_for(stake, FEE_BASIS_POINTS),
            FEE_BASIS_POINTS,
            ref,
            game_day_start(datetime.now(UTC)),
        )
        arguments.update(overrides)
        return self.rpc("exchange_open_position", *arguments.values())

    def close(self, player, position, ref, price=100, mode="replay", **overrides):
        side, stake, entry = self.execute(
            "select side,stake,entry_price from public.exchange_positions where id=%s", (position,)
        )[0]
        closing = closing_amounts(side, stake, entry, Decimal(price), FEE_BASIS_POINTS)
        arguments = close_arguments(
            str(player), str(position), mode, Decimal(price), closing, FEE_BASIS_POINTS, ref
        )
        arguments.update(overrides)
        return self.rpc("exchange_close_position", *arguments.values())

    def sweep(self, player=None, price=90, mode="replay", quoted_at=None):
        quote = SweepPrice("scratch-co", Decimal(price), quoted_at or datetime.now(UTC), mode)
        arguments = sweep_arguments([quote], None if player is None else str(player))
        return self.rpc(
            "exchange_close_used_up",
            self.psycopg.types.json.Jsonb(arguments["p_prices"]),
            arguments["p_player_id"],
        )

    def invariant(self):
        mismatches = self.execute("""
            select w.player_id from public.wallets w
            left join public.wallet_transactions t on t.player_id=w.player_id
            group by w.player_id,w.balance
            having w.balance <> coalesce(sum(t.delta),0) or w.balance < 0
        """)
        assert mismatches == []


@pytest.fixture
def db(scratch_uri):
    database = Scratch(scratch_uri)
    database.execute("truncate auth.users cascade")
    yield database
    database.invariant()  # runs after every SQL attack, including rejected transactions


def race(*operations):
    """Separate connections reach the start barrier together; errors never get discarded."""
    barrier = Barrier(len(operations))

    def run(operation):
        barrier.wait(timeout=5)
        return operation()

    with ThreadPoolExecutor(max_workers=len(operations)) as pool:
        futures = [pool.submit(run, operation) for operation in operations]
        return [future.result(timeout=15) for future in futures]


def test_wallet_replays_concurrently_and_after_intervening_transaction(db):
    player = db.player()

    def grant():
        return db.rpc("apply_wallet_transaction", player, 100, "event_reward", "one-action")

    replies = race(grant, grant)
    assert sum(reply == 100 for reply in replies) == 1
    assert sum(isinstance(r, dict) and r.get("sqlstate") == "23505" for r in replies) == 1
    assert db.rpc("apply_wallet_transaction", player, 20, "event_reward", "later-action") == 120
    db.execute(
        "update wallet_transactions set created_at=now()-interval '2 days' where player_id=%s",
        (player,),
    )  # simulate an old request after daily rollover
    assert grant()["sqlstate"] == "23505"
    assert db.execute("select balance from wallets where player_id=%s", (player,)) == [(120,)]


def test_two_spends_cannot_overdraw_wallet(db):
    player = db.player(100)
    replies = race(
        *[
            lambda ref=ref: db.rpc("apply_wallet_transaction", player, -80, "clue_purchase", ref)
            for ref in ("device-one", "device-two")
        ]
    )
    assert 20 in replies
    assert any(isinstance(r, dict) and r.get("message") == "insufficient_funds" for r in replies)
    assert db.execute("select balance from wallets where player_id=%s", (player,)) == [(20,)]


@pytest.mark.parametrize(
    "delta,reason,ref",
    [
        (0, "event_reward", "zero"),
        (-1, "event_reward", "negative"),
        (1, "clue_purchase", "wrong-sign"),
        (1, "unknown", "unknown"),
        (1, "event_reward", "x" * 121),
    ],
)
def test_wallet_rejects_invalid_mutations_atomically(db, delta, reason, ref):
    player = db.player()
    assert "sqlstate" in db.rpc("apply_wallet_transaction", player, delta, reason, ref)
    assert db.execute("select count(*) from wallet_transactions") == [(0,)]


def test_privileged_sql_delta_cap_differs_from_python_policy(db):
    # The privileged wallet helper has no Python MAX_DELTA cap; product callers apply theirs.
    from server.wallet import MAX_DELTA, InvalidTransaction, validate_transaction

    player = db.player()
    with pytest.raises(InvalidTransaction):
        validate_transaction(MAX_DELTA + 1, "event_reward", "huge")
    assert (
        db.rpc("apply_wallet_transaction", player, MAX_DELTA + 1, "event_reward", "huge")
        == MAX_DELTA + 1
    )


def test_postgres_jsonb_cannot_store_a_nul_character(db):
    player = db.player()
    assert save(db, player, 1, {"x": "\x00"})["sqlstate"] == "22P05"
    assert db.execute("select version from saves where player_id=%s", (player,)) == [(1,)]


def test_kit_retry_concurrent_and_after_save_pays_once(db):
    player = db.player()

    def grant():
        return db.rpc(
            "grant_entry_kit",
            player,
            "ending_trapped",
            "none",
            False,
            "stranger",
            "saltreach_harbor",
            1600,
            10,
            "a" * 64,
        )

    replies = race(grant, grant)
    assert sorted(r["status"] for r in replies) == ["granted", "stored"]
    assert sum(r["paid"] for r in replies) == 1600
    save(db, player, 1, {"later": True})
    assert grant()["paid"] == 0
    assert db.execute("select count(*) from wallet_transactions where reason='kit_grant'") == [(1,)]


def save(db, player, version, data):
    return db.rpc("save_progress", player, version, db.psycopg.types.json.Jsonb(data))


def test_two_devices_save_and_delayed_retry_do_not_overwrite(db):
    player = db.player()
    replies = race(
        lambda: save(db, player, 1, {"device": 1}), lambda: save(db, player, 1, {"device": 2})
    )
    assert sorted(r["status"] for r in replies) == ["saved", "stale"]
    assert save(db, player, 1, {"old": True})["status"] == "stale"
    assert db.execute("select version from saves where player_id=%s", (player,)) == [(2,)]


def test_name_reroll_concurrent_and_delayed_uid_replays(db):
    player = db.player()
    placeholder = "Captain-" + str(player)[:6]
    assert db.rpc("assign_captain_name", player, placeholder, "Quiet Gull")["status"] == "named"

    def reroll():
        return db.rpc("reroll_captain_name", player, placeholder, "Bright Gull", "reroll-1")

    replies = race(reroll, reroll)
    assert sorted(r["status"] for r in replies) == ["named", "refused"]
    assert reroll()["reason"] == "already_applied"
    assert (
        db.rpc("reroll_captain_name", player, placeholder, "Other Gull", "reroll-2")["reason"]
        == "no_rerolls_left"
    )


def test_exchange_open_and_close_replays_never_duplicate(db):
    player = db.player(5000)
    opened = db.open(player, "market:open:one")
    assert opened["status"] == "done"
    assert db.open(player, "market:open:one")["sqlstate"] == "23505"
    position = opened["positionId"]
    # Exchange v2 has no holding time: closing at the entry price only loses the two fees.
    assert db.close(player, position, "market:close:one")["status"] == "done"
    assert db.close(player, position, "market:close:one")["sqlstate"] == "23505"
    assert db.open(player, "market:open:one")["sqlstate"] == "23505"
    assert db.execute("select balance from wallets where player_id=%s", (player,)) == [(4980,)]


def test_two_simultaneous_opens_with_one_uid_mutate_once(db):
    player = db.player(5000)

    def opening():
        return db.open(player, "market:open:same-uid")

    replies = race(opening, opening)
    assert sum(r.get("status") == "done" for r in replies) == 1
    assert sum(r.get("sqlstate") == "23505" for r in replies) == 1
    assert db.execute("select stake from exchange_positions where player_id=%s", (player,)) == [
        (MAX_STAKE_COINS,)
    ]
    assert db.execute("select count(*) from exchange_events") == [(1,)]


def test_daily_cap_is_atomic_across_concurrent_opens(db):
    player = db.player(5000)
    for i in range(3):
        assert db.open(player, f"market:open:first-{i}")["status"] == "done"
    replies = race(
        lambda: db.open(player, "market:open:device-a"),
        lambda: db.open(player, "market:open:device-b"),
    )
    assert sum(r.get("status") == "done" for r in replies) == 1
    assert sum(r.get("reason") == "daily_cap" for r in replies) == 1
    assert db.execute("select sum(stake) from exchange_events where kind='open'") == [
        (DAILY_STAKE_CAP_COINS,)
    ]


def test_open_position_limit_is_atomic_across_devices(db):
    player = db.player(5000)
    for i in range(MAX_OPEN_POSITIONS - 1):
        assert db.open(player, f"market:open:first-{i}", stake=MIN_STAKE_COINS)["status"] == "done"
    replies = race(
        lambda: db.open(player, "market:open:device-a", stake=MIN_STAKE_COINS),
        lambda: db.open(player, "market:open:device-b", stake=MIN_STAKE_COINS),
    )
    assert sum(r.get("status") == "done" for r in replies) == 1
    assert sum(r.get("reason") == "too_many_positions" for r in replies) == 1
    assert db.execute("select count(*) from exchange_positions where status='open'") == [
        (MAX_OPEN_POSITIONS,)
    ]


def test_opening_fee_failure_rolls_back_stake_position_and_event(db):
    player = db.player(MAX_STAKE_COINS)
    assert db.open(player, "market:open:fee-short")["message"] == "insufficient_funds"
    assert db.execute("select balance from wallets where player_id=%s", (player,)) == [
        (MAX_STAKE_COINS,)
    ]
    assert db.execute("select count(*) from exchange_positions") == [(0,)]
    assert db.execute("select count(*) from exchange_events") == [(0,)]
    assert db.execute("select count(*) from wallet_transactions where reason<>'admin_adjust'") == [
        (0,)
    ]


def test_two_closes_with_different_uids_pay_only_once(db):
    player = db.player(1000)
    position = db.open(player, "market:open:one")["positionId"]
    replies = race(
        lambda: db.close(player, position, "market:close:a"),
        lambda: db.close(player, position, "market:close:b"),
    )
    assert sum(r.get("status") == "done" for r in replies) == 1
    assert sum(r.get("reason") == "position_closed" for r in replies) == 1
    assert db.execute("select balance from wallets where player_id=%s", (player,)) == [(980,)]
    assert db.execute("select count(*) from exchange_events where kind='close'") == [(1,)]


def test_concurrent_and_two_day_old_close_uid_replay_pay_once(db):
    player = db.player(1000)
    position = db.open(player, "market:open:one")["positionId"]

    def close():
        return db.close(player, position, "market:close:same")

    replies = race(close, close)
    assert sum(r.get("status") == "done" for r in replies) == 1
    assert sum(r.get("sqlstate") == "23505" for r in replies) == 1
    db.execute(
        "update exchange_events set created_at=now()-interval '2 days' where player_id=%s",
        (player,),
    )
    assert close()["sqlstate"] == "23505"


def test_closing_does_not_free_daily_stake_and_day_rollover_does_not_free_refs(db):
    player = db.player(5000)
    positions = [db.open(player, f"market:open:first-{i}")["positionId"] for i in range(4)]
    assert db.close(player, positions[0], "market:close:one")["status"] == "done"
    assert db.open(player, "market:open:over-cap")["reason"] == "daily_cap"
    db.execute("update exchange_positions set opened_at=now()-interval '2 days'")
    assert db.open(player, "market:open:next-day")["status"] == "done"
    assert db.open(player, "market:open:first-0")["sqlstate"] == "23505"


def test_concurrent_sweeps_zero_positions_once_without_moving_wallets(db):
    player = db.player(1000)
    position = db.open(player, "market:open:one")["positionId"]
    balance = db.execute("select balance from wallets where player_id=%s", (player,))
    replies = race(lambda: db.sweep(player), lambda: db.sweep(player))
    assert sum(reply["closed"] for reply in replies) == 1
    assert db.execute("select balance from wallets where player_id=%s", (player,)) == balance
    assert db.execute("select status,close_value,close_fee from exchange_positions") == [
        ("zeroed", 0, 0)
    ]
    assert db.execute("select count(*) from exchange_events where kind='zero'") == [(1,)]
    assert (
        db.close(player, position, "market:close:after-recovery", price=110)["reason"]
        == "position_closed"
    )


def test_close_racing_sweep_cannot_revive_or_double_log_a_used_up_position(db):
    player = db.player(1000)
    position = db.open(player, "market:open:one")["positionId"]
    replies = race(
        lambda: db.close(player, position, "market:close:zero", price=90),
        lambda: db.sweep(player),
    )
    assert any(reply.get("status") == "done" or reply.get("closed") == 1 for reply in replies)
    assert db.execute("select count(*) from exchange_events where kind='zero'") == [(1,)]
    assert db.execute("select balance from wallets where player_id=%s", (player,)) == [(490,)]


def test_sweep_ignores_older_prices_other_modes_and_other_players(db):
    player, other = db.player(1000), db.player(1000)
    db.open(player, "market:open:one")
    db.open(other, "market:open:other")
    assert db.sweep(player, quoted_at=datetime.now(UTC) - timedelta(days=1))["closed"] == 0
    assert db.sweep(player, mode="live")["closed"] == 0
    assert db.sweep(player)["closed"] == 1
    assert db.execute("select player_id from exchange_positions where status='open'") == [(other,)]


def test_nonmember_cannot_start_somebody_elses_crew(db):
    owner, other = db.player(), db.player()
    crew = db.rpc("crew_create", owner, "K7QF2M", "witness")["crewId"]
    reply = db.rpc("crew_start", crew, other, db.psycopg.types.json.Jsonb([]), 1)
    assert reply["reason"] == "not_in_crew"
    assert db.execute("select status from crews where id=%s", (crew,)) == [("forming",)]


@pytest.mark.parametrize(
    "changes",
    [
        {"p_stake": 9},
        {"p_stake": 501},
        {"p_stake": -1},
        {"p_stake": 10**15},
        {"p_fee": 0},
        {"p_company_id": "not a company"},
        {"p_side": "buy"},
        {"p_price_mode": "simulated"},
        {"p_entry_price": 0},
        {"p_entry_price": "0.000000001"},
        {"p_leverage": 11},
        {"p_ref": "x" * 121},
    ],
)
def test_exchange_open_rejects_forged_numbers_atomically(db, changes):
    player = db.player(5000)
    assert db.open(player, "market:open:bad", **changes)["message"] == "bad_trade"
    assert db.execute("select balance from wallets where player_id=%s", (player,)) == [(5000,)]
    assert db.execute("select count(*) from exchange_positions") == [(0,)]
    assert db.execute("select count(*) from exchange_events") == [(0,)]


def test_exchange_close_recomputes_value_and_fee_and_hides_foreign_positions(db):
    player, other = db.player(1000), db.player(1000)
    position = db.open(player, "market:open:one")["positionId"]
    assert db.close(player, position, "market:close:forged", p_value=5000)["message"] == "bad_trade"
    assert db.close(player, position, "market:close:no-fee", p_fee=0)["message"] == "bad_trade"
    assert (
        db.close(player, position, "market:close:mode", mode="live")["reason"] == "wrong_price_mode"
    )
    assert db.close(other, position, "market:close:stolen")["reason"] == "no_such_position"
    assert db.execute("select status from exchange_positions") == [("open",)]
    assert db.execute("select count(*) from exchange_events") == [(1,)]


def test_friends_race_for_same_seat_then_retry(db):
    owner, friend, other = [db.player() for _ in range(3)]
    crew = db.rpc("crew_create", owner, "K7QF2M", "witness")["crewId"]

    def join(player):
        return db.rpc("crew_take_seat", crew, player, 2, "stranger", 1)

    replies = race(lambda: join(friend), lambda: join(other))
    assert sum(r.get("status") == "joined" for r in replies) == 1
    assert sum(r.get("status") == "refused" for r in replies) == 1
    assert db.execute(
        "select count(*) from crew_seats where crew_id=%s and seat_no=2", (crew,)
    ) == [(1,)]
    assert join(friend)["status"] == "refused"


def test_crew_creation_and_muster_natural_replays(db):
    player = db.player()

    def create():
        return db.rpc("crew_create", player, "K7QF2M", "witness")

    replies = race(create, create)
    assert len({r["crewId"] for r in replies}) == 1
    crew = replies[0]["crewId"]
    assert create()["status"] == "existing"
    partners = db.psycopg.types.json.Jsonb(
        [
            {"seatNo": n, "npcId": npc, "kit": "stranger"}
            for n, npc in ((2, "deckhand"), (3, "bosun"), (4, "cook"))
        ]
    )

    def start():
        return db.rpc("crew_start", crew, player, partners, 1)

    replies = race(start, start)
    assert sum(r.get("status") == "started" for r in replies) == 1
    assert start()["status"] == "refused"


def test_wrong_crew_code_limit_is_atomic_and_player_scoped(db):
    player, other = db.player(), db.player()

    def attempt():
        return db.rpc(
            "crew_find_by_code", player, "ZZZZZZ", MAX_WRONG_CODES, WRONG_CODE_WINDOW_SECONDS
        )

    replies = race(*[attempt for _ in range(MAX_WRONG_CODES + 3)])
    assert sum(r.get("reason") == "wrong_code" for r in replies) == MAX_WRONG_CODES
    assert sum(r.get("reason") == "too_many_attempts" for r in replies) == 3
    assert (
        db.rpc("crew_find_by_code", other, "ZZZZZZ", MAX_WRONG_CODES, WRONG_CODE_WINDOW_SECONDS)[
            "reason"
        ]
        == "wrong_code"
    )


def test_rls_blocks_other_players_and_privileged_money_calls(db):
    player, other = db.player(1000), db.player(2000)
    assert db.open(player, "market:open:own")["status"] == "done"
    assert db.open(other, "market:open:other")["status"] == "done"
    own_crew = db.rpc("crew_create", player, "K7QF2M", "witness")["crewId"]
    db.rpc("crew_create", other, "P7RF3N", "witness")
    for person in (player, other):
        assert (
            db.rpc(
                "grant_entry_kit",
                person,
                "ending_trapped",
                "none",
                False,
                "stranger",
                "saltreach_harbor",
                1600,
                10,
                "a" * 64,
            )["status"]
            == "granted"
        )
        placeholder = "Captain-" + str(person)[:6]
        db.rpc("assign_captain_name", person, placeholder, "Quiet Gull")
        db.rpc("reroll_captain_name", person, placeholder, "Bright Gull", "reroll-001")
    with db.psycopg.connect(db.uri, autocommit=True) as connection:
        connection.execute("set role authenticated")
        connection.execute(
            "select set_config('request.jwt.claims',%s,false)",
            (f'{{"sub":"{player}"}}',),
        )
        for table in (
            "wallets",
            "saves",
            "exchange_positions",
            "wallet_transactions",
            "exchange_events",
            "entry_profiles",
            "captain_name_rerolls",
            "crew_seats",
        ):
            rows = connection.execute(f"select distinct player_id from public.{table}").fetchall()
            assert rows == [(player,)]
        crew_ids = connection.execute("select id from public.crews").fetchall()
        assert [str(row[0]) for row in crew_ids] == [own_crew]
        with pytest.raises(db.psycopg.errors.InsufficientPrivilege):
            connection.execute(
                "select apply_wallet_transaction(%s,100,'event_reward','forged')", (other,)
            )
        with pytest.raises(db.psycopg.errors.InsufficientPrivilege):
            connection.execute("update wallets set balance=999999 where player_id=%s", (player,))
        for function in (
            "exchange_open_position",
            "exchange_close_position",
            "exchange_close_used_up",
        ):
            assert connection.execute(
                "select has_function_privilege('authenticated',p.oid,'execute') from pg_proc p "
                "where p.pronamespace='public'::regnamespace and p.proname=%s",
                (function,),
            ).fetchone() == (False,)
        connection.execute("reset role")
        connection.execute("set role anon")
        with pytest.raises(db.psycopg.errors.InsufficientPrivilege):
            connection.execute("select * from wallets")
