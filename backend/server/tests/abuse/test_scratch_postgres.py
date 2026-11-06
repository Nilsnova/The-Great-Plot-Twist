"""Attack the real migrations on disposable Postgres, never a configured database.

Run: uv run --frozen --with pgserver --with 'psycopg[binary]' pytest -q
     server/tests/abuse/test_scratch_postgres.py
Ordinary pytest explicitly skips these tests if the two test-only extras are absent.
"""

import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from threading import Barrier

import pytest

from server.crews.codes import MAX_WRONG_CODES, WRONG_CODE_WINDOW_SECONDS
from server.market.trade_rules import (
    DAILY_BUY_CAP_COINS,
    FEE_BASIS_POINTS,
    MAX_TRADE_COINS,
    MIN_HOLD_SECONDS,
    buy_amounts,
    sell_amounts,
)

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
                connection.execute("""
                    create role anon;
                    create role authenticated;
                    create role service_role bypassrls;
                    create schema auth;
                    create table auth.users(id uuid primary key);
                    create function auth.uid() returns uuid language sql stable as $$
                      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
                    $$;
                    grant usage on schema auth to authenticated, service_role;
                """)
                files = sorted(MIGRATIONS.glob("*.sql"))
                assert len(files) >= 5
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

    def trade(self, player, side, ref, units=5, price=100, **overrides):
        from decimal import Decimal

        amounts = (buy_amounts if side == "buy" else sell_amounts)(units, Decimal(price))
        arguments = dict(
            player=player,
            company="scratch-co",
            side=side,
            units=units,
            price=price,
            gross=amounts.gross,
            fee=amounts.fee,
            ref=ref,
            hold=MIN_HOLD_SECONDS,
            cap=DAILY_BUY_CAP_COINS,
            day=datetime.now(UTC).replace(hour=0, minute=0, second=0),
            basis=FEE_BASIS_POINTS,
            maximum=MAX_TRADE_COINS,
        )
        arguments.update(overrides)
        return self.rpc("market_trade", *arguments.values())

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
    database.execute("truncate public.market_bases cascade")
    assert (
        database.rpc(
            "market_set_base", "scratch-co", 100, 100, datetime.now(UTC), "replay", None, None, 0
        )
        == 1
    )
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
    # Evidence of a policy gap, not a public-player exploit. Sales have no SQL upper cap.
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


def test_market_replayed_buy_and_replayed_sale_never_duplicate(db):
    player = db.player(5000)
    assert db.trade(player, "buy", "market:buy-one")["status"] == "done"
    assert db.trade(player, "buy", "market:buy-one")["sqlstate"] == "23505"
    age_position(db, player)
    assert db.trade(player, "sell", "market:sell-one")["status"] == "done"
    assert db.trade(player, "sell", "market:sell-one")["sqlstate"] == "23505"
    assert db.trade(player, "buy", "market:buy-one")["sqlstate"] == "23505"
    assert db.execute("select balance from wallets where player_id=%s", (player,)) == [(4980,)]


def age_position(db, player):
    db.execute(
        "update market_positions set last_buy_at=now()-interval '11 minutes' where player_id=%s",
        (player,),
    )


def test_two_simultaneous_buys_with_one_uid_mutate_once(db):
    player = db.player(5000)

    def buy():
        return db.trade(player, "buy", "market:same-uid")

    replies = race(buy, buy)
    assert sum(r.get("status") == "done" for r in replies) == 1
    assert sum(r.get("sqlstate") == "23505" for r in replies) == 1
    assert db.execute("select units from market_positions where player_id=%s", (player,)) == [(5,)]


def test_daily_cap_is_atomic_across_concurrent_buys(db):
    player = db.player(5000)
    for i in range(3):
        assert db.trade(player, "buy", f"market:first-{i}")["status"] == "done"
    replies = race(
        lambda: db.trade(player, "buy", "market:device-a"),
        lambda: db.trade(player, "buy", "market:device-b"),
    )
    assert sum(r.get("status") == "done" for r in replies) == 1
    assert sum(r.get("reason") == "daily_cap" for r in replies) == 1
    assert db.execute("select sum(gross) from market_trades where side='buy'") == [(2000,)]


def test_two_closes_with_different_uids_pay_only_once(db):
    player = db.player(1000)
    assert db.trade(player, "buy", "market:open")["status"] == "done"
    age_position(db, player)
    replies = race(
        lambda: db.trade(player, "sell", "market:close-a"),
        lambda: db.trade(player, "sell", "market:close-b"),
    )
    assert sum(r.get("status") == "done" for r in replies) == 1
    assert sum(r.get("reason") == "not_enough_units" for r in replies) == 1
    assert db.execute("select balance from wallets where player_id=%s", (player,)) == [(980,)]


def test_concurrent_and_two_day_old_sale_uid_replay_pay_once(db):
    player = db.player(1000)
    assert db.trade(player, "buy", "market:open")["status"] == "done"
    age_position(db, player)

    def close():
        return db.trade(player, "sell", "market:same-close")

    replies = race(close, close)
    assert sum(r.get("status") == "done" for r in replies) == 1
    assert sum(r.get("sqlstate") == "23505" for r in replies) == 1
    db.execute(
        "update market_trades set created_at=now()-interval '2 days' where player_id=%s", (player,)
    )
    assert close()["sqlstate"] == "23505"


def test_nonmember_cannot_start_somebody_elses_crew(db):
    owner, other = db.player(), db.player()
    crew = db.rpc("crew_create", owner, "K7QF2M", "witness")["crewId"]
    reply = db.rpc("crew_start", crew, other, db.psycopg.types.json.Jsonb([]), 1)
    assert reply["reason"] == "not_in_crew"
    assert db.execute("select status from crews where id=%s", (crew,)) == [("forming",)]


def test_market_size_hold_unknown_and_forged_gross_guards(db):
    player = db.player(5000)
    for changes in (
        {"units": 6},
        {"units": -1},
        {"units": 10**15},
        {"gross": 1},
        {"fee": 0},
        {"company": "unknown"},
    ):
        assert "sqlstate" in db.trade(player, "buy", "market:bad", **changes)
    assert db.trade(player, "buy", "market:valid")["status"] == "done"
    assert db.trade(player, "sell", "market:early")["reason"] == "holding_time"


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
    assert db.trade(player, "buy", "market:own")["status"] == "done"
    assert db.trade(other, "buy", "market:other")["status"] == "done"
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
        connection.execute("select set_config('request.jwt.claim.sub',%s,false)", (str(player),))
        for table in (
            "wallets",
            "saves",
            "market_positions",
            "wallet_transactions",
            "market_trades",
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
        connection.execute("reset role")
        connection.execute("set role anon")
        with pytest.raises(db.psycopg.errors.InsufficientPrivilege):
            connection.execute("select * from wallets")
