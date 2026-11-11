"""Real SQL checks for 20261111010000_market_calls.sql: up-or-down market calls.

Opt-in, on a disposable local PostgreSQL that the case_sql fixture builds (all migrations, applied
twice). Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/market_calls_sql

Each test is one transaction, rolled back at the end, so now() stays the same moment: a test moves
a call's opened_at and settle_at back instead of waiting.
"""

from uuid import UUID, uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

PLAYER = UUID(int=931)
OTHER = UUID(int=932)


def call(database, sql, *arguments):
    return database.execute(sql, arguments).fetchone()[0]


def as_server(database):
    database.execute("set local role service_role")


def as_owner(database):
    database.execute("reset role")


def player_with(database, player, coins):
    as_owner(database)
    database.execute("insert into auth.users (id) values (%s) on conflict do nothing", (player,))
    as_server(database)
    if coins:
        call(
            database,
            "select public.apply_wallet_transaction(%s, %s, 'kit_grant', 'kit')",
            player,
            coins,
        )


def open_call(
    database,
    uid="call-0001",
    asset="harbor-trust",
    direction="up",
    stake=10,
    price="100",
    player=PLAYER,
):
    as_server(database)
    return call(
        database,
        "select public.market_call_open(%s, %s, %s, %s, %s, %s)",
        player,
        uid,
        asset,
        direction,
        stake,
        price,
    )


def settle(database, call_id, price):
    as_server(database)
    return call(database, "select public.market_call_settle(%s, %s)", call_id, price)


def make_due(database, call_id, hours_ago=1):
    """Move the call back in time so its settle time was `hours_ago` hours ago."""
    as_owner(database)
    database.execute(
        "update public.market_calls set opened_at = now() - make_interval(hours => %s + 1), "
        "settle_at = now() - make_interval(hours => %s) where id = %s",
        (hours_ago, hours_ago, call_id),
    )
    as_server(database)


def balance(database, player=PLAYER):
    return call(database, "select balance from public.wallets where player_id = %s", player)


def ledger(database, reason):
    return database.execute(
        "select delta from public.wallet_transactions where player_id = %s and reason = %s",
        (PLAYER, reason),
    ).fetchall()


def test_a_call_takes_the_stake_and_is_decided_an_hour_later(database):
    player_with(database, PLAYER, 100)

    opened = open_call(database)

    assert opened["status"] == "opened" and opened["repeat"] is False and opened["balance"] == 90
    made = opened["call"]
    assert (made["asset"], made["direction"], made["stake"], made["outcome"]) == (
        "harbor-trust",
        "up",
        10,
        None,
    )
    hold = call(
        database, "select settle_at - opened_at from public.market_calls where id = %s", made["id"]
    )
    assert hold.total_seconds() == 3600
    assert ledger(database, "market_call_stake") == [(-10,)]


def test_a_repeated_click_is_the_same_call_and_charges_once(database):
    player_with(database, PLAYER, 100)

    first = open_call(database)
    again = open_call(database, stake=25)

    assert again["repeat"] is True and again["call"]["id"] == first["call"]["id"]
    assert again["balance"] == 90


def test_a_fourth_open_call_is_refused(database):
    player_with(database, PLAYER, 100)
    for number in range(3):
        open_call(database, uid=f"call-000{number}")

    assert open_call(database, uid="call-0009") == {"status": "refused", "reason": "too_many_calls"}
    assert balance(database) == 70


def test_a_call_the_player_cannot_pay_changes_nothing(database):
    player_with(database, PLAYER, 5)

    with pytest.raises(psycopg.errors.RaiseException, match="insufficient_funds"):
        open_call(database, stake=10)


def test_a_player_without_a_wallet_is_not_set_up(database):
    assert open_call(database, player=uuid4())["reason"] == "player_not_set_up"


@pytest.mark.parametrize(
    "change",
    [{"stake": 7}, {"asset": "swiftwater-ferries"}, {"direction": "sideways"}, {"uid": "short"}],
)
def test_the_table_rules_refuse_what_the_stall_does_not_offer(database, change):
    player_with(database, PLAYER, 100)

    with pytest.raises(psycopg.errors.CheckViolation):
        open_call(database, **change)


@pytest.mark.parametrize(
    ("direction", "price", "outcome", "payout", "coins"),
    [
        ("up", "101", "won", 20, 110),
        ("up", "99", "lost", 0, 90),
        ("down", "99", "won", 20, 110),
        ("down", "101", "lost", 0, 90),
        ("up", "100", "refunded", 10, 100),
    ],
)
def test_a_due_call_is_won_lost_or_refunded(database, direction, price, outcome, payout, coins):
    player_with(database, PLAYER, 100)
    made = open_call(database, direction=direction)["call"]
    make_due(database, made["id"])

    settled = settle(database, made["id"], price)

    assert settled["status"] == "settled" and settled["repeat"] is False
    assert (settled["call"]["outcome"], settled["call"]["payout"]) == (outcome, payout)
    assert settled["balance"] == coins == balance(database)


def test_a_call_is_settled_once(database):
    player_with(database, PLAYER, 100)
    made = open_call(database)["call"]
    make_due(database, made["id"])
    first = settle(database, made["id"], "150")

    again = settle(database, made["id"], "50")

    assert again == {**first, "repeat": True}
    assert ledger(database, "market_call_payout") == [(20,)]


def test_a_call_is_not_decided_before_its_time(database):
    player_with(database, PLAYER, 100)
    made = open_call(database)["call"]

    assert settle(database, made["id"], "150") == {"status": "refused", "reason": "not_due"}


def test_no_price_waits_a_day_and_then_refunds_the_stake(database):
    player_with(database, PLAYER, 100)
    made = open_call(database)["call"]
    make_due(database, made["id"], hours_ago=2)
    waiting = settle(database, made["id"], None)
    make_due(database, made["id"], hours_ago=25)

    refunded = settle(database, made["id"], None)

    assert waiting == {"status": "refused", "reason": "no_price"}
    assert (refunded["call"]["outcome"], refunded["call"]["settle_price"]) == ("refunded", None)
    assert balance(database) == 100


def test_an_unknown_call_is_refused(database):
    assert settle(database, uuid4(), "1") == {"status": "refused", "reason": "no_such_call"}


def test_no_browser_role_may_read_calls_or_run_the_functions(database):
    rights = database.execute(
        """
        select has_table_privilege('authenticated', 'public.market_calls', 'select'),
               has_table_privilege('anon', 'public.market_calls', 'select'),
               has_table_privilege('service_role', 'public.market_calls', 'delete'),
               has_function_privilege('authenticated',
                 'public.market_call_open(uuid, text, text, text, integer, numeric)', 'execute'),
               has_function_privilege('authenticated',
                 'public.market_call_settle(uuid, numeric)', 'execute'),
               (select relrowsecurity from pg_class where relname = 'market_calls'),
               (select count(*) from pg_policies where tablename = 'market_calls')
        """
    ).fetchone()
    assert rights == (False, False, False, False, False, True, 0)
