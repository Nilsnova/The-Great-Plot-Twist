"""Partner checks P1 to P10 against only disposable local PostgreSQL.

The actual migration runs as service_role; each test rolls back its generic crew and ledger.
"""

import os

import pytest

from .conftest import (
    MIGRATIONS,
    PLAYERS,
    as_owner,
    as_server,
    move_clock,
    open_case,
    rpc,
    seed_crew,
)
from .test_phase2 import begin_night, signal

pytestmark = [
    pytest.mark.pg,
    pytest.mark.skipif(os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in database tests"),
]
MIGRATION = MIGRATIONS / "20261106130000_npc_partners.sql"
FUNCTIONS = ("npc_begin", "npc_next_order_no", "npc_fetch_pin", "npc_man_light")
PLAYER = PLAYERS[1]
PUBLIC_LIGHTS = ("keepers_lamp", "harbor_light")


def partner_id(seat):
    return "test_partner" if seat == 1 else f"test_partner_{seat}"


def prepare(database, *, partners=(1,)):
    crew = seed_crew(database, partner=True)
    for seat in partners:
        database.execute(
            "update public.crew_seats set player_id = null, npc_id = %s "
            "where crew_id = %s and seat_no = %s",
            (partner_id(seat), crew, seat),
        )
    as_server(database)
    assert open_case(database, crew)["status"] == "opened"
    move_clock(database, crew, 0)
    return crew


def fetch(
    database,
    crew,
    *,
    uid="fetch001",
    seat=1,
    card="C4",
    route="auto",
    needs=None,
    window=None,
    price=0,
    player=PLAYER,
):
    return rpc(
        database,
        "npc_fetch_pin",
        crew,
        player,
        uid,
        seat,
        partner_id(seat),
        card,
        f"{card}.generic" if route == "auto" else route,
        needs or [],
        window,
        600,
        240,
        300,
        price,
        None,
        50,
        f"false_light:pin:{card}",
    )


def man_light(database, crew, *, uid="light001", seat=1, light=PUBLIC_LIGHTS[0], player=PLAYER):
    return rpc(
        database, "npc_man_light", crew, player, uid, seat, partner_id(seat), light, 600, 1200
    )


def test_p1_full_chain_applies_twice_and_reapplying_keeps_orders_credit_and_receipts(database):
    crew = prepare(database)
    result = fetch(database, crew)
    assert result["orderNo"] == 1
    before = database.execute(
        "select * from public.npc_orders where crew_id = %s", (crew,)
    ).fetchall()
    as_owner(database)
    database.execute(MIGRATION.read_text())
    database.execute(MIGRATION.read_text())
    as_server(database)
    assert (
        database.execute("select * from public.npc_orders where crew_id = %s", (crew,)).fetchall()
        == before
    )
    assert database.execute(
        "select count(*), sum(delta) from public.wallet_transactions"
    ).fetchone() == (1, 50)
    assert fetch(database, crew)["status"] == "repeat"


def test_p2_arrival_window_refuses_at_minute_three_and_accepts_at_minute_eight(database):
    crew = prepare(database)
    window = {"every": 20, "from": 12, "open": 8}
    move_clock(database, crew, 180)
    assert fetch(database, crew, window=window) == {
        "status": "refused",
        "reason": "locked_window",
        "minute": 3,
    }
    assert database.execute("select count(*) from public.npc_orders").fetchone() == (0,)
    assert database.execute(
        "select orders_count from public.case_state where crew_id = %s", (crew,)
    ).fetchone() == (0,)
    move_clock(database, crew, 480)
    result = fetch(database, crew, window=window)
    assert (
        result["status"] == "done" and result["foundSecond"] == 1080 and result["pinSecond"] == 1380
    )
    assert database.execute(
        "select ordered_second, arrive_second, found_second, pin_second, ready_second "
        "from public.npc_orders where crew_id = %s",
        (crew,),
    ).fetchone() == (480, 720, 1080, 1380, 1380)


def test_p3_partner_stays_busy_until_the_exact_ready_second(database):
    crew = prepare(database)
    assert fetch(database, crew)["status"] == "done"
    move_clock(database, crew, 899)
    assert fetch(database, crew, uid="fetch002", card="C1") == {
        "status": "refused",
        "reason": "busy",
        "seconds": 1,
    }
    move_clock(database, crew, 900)
    assert fetch(database, crew, uid="fetch002", card="C1")["orderNo"] == 2


def test_p4_witness_starting_card_pins_in_five_minutes_with_no_extra_find(database):
    crew = prepare(database)
    result = fetch(database, crew, card="C2", route=None)
    assert result["foundSecond"] is None and result["pinSecond"] == 300
    assert database.execute(
        "select arrive_second, found_second, pin_second, ready_second, route_id "
        "from public.npc_orders where crew_id = %s",
        (crew,),
    ).fetchone() == (None, None, 300, 300, None)
    assert database.execute(
        "select ready_second, by_partner from public.case_finds where crew_id = %s", (crew,)
    ).fetchall() == [(0, True)]


def test_p5_ordering_player_gets_pin_credit_and_the_same_card_pays_once_across_partners(database):
    crew = prepare(database, partners=(1, 3))
    assert fetch(database, crew)["coinsPaid"] == 50
    assert fetch(database, crew, uid="fetch002", seat=3)["coinsPaid"] == 0
    assert database.execute(
        "select seat_no, pinned_by, ordered_second, pinned_second, "
        "by_partner, order_no, coins_rewarded "
        "from public.board_pins where crew_id = %s order by seat_no",
        (crew,),
    ).fetchall() == [(1, PLAYER, 0, 900, True, 1, 50), (3, PLAYER, 0, 900, True, 2, 0)]
    assert database.execute(
        "select player_id, delta, reason from public.wallet_transactions",
    ).fetchall() == [(PLAYER, 50, "clue_reward")]
    assert database.execute(
        "select orders_count from public.case_state where crew_id = %s", (crew,)
    ).fetchone() == (2,)


def test_p6_man_light_needs_nightfall_and_an_unoccupied_public_light(database):
    crew = prepare(database)
    assert man_light(database, crew)["reason"] == "not_nightfall"
    begin_night(database, crew, player=PLAYER)
    for light in ("islet_signal_station", "ruin_light"):
        assert man_light(database, crew, light=light)["reason"] == "light_not_for_partners"
    assert (
        rpc(
            database, "finale_take_post", crew, PLAYER, "post0001", PUBLIC_LIGHTS[0], True, 60, 1200
        )["status"]
        == "done"
    )
    assert man_light(database, crew)["reason"] == "light_taken"
    result = man_light(database, crew, light=PUBLIC_LIGHTS[1])
    assert result["onPostSecond"] == 600
    assert database.execute(
        "select taken_second, on_post_second, order_no from public.finale_posts "
        "where crew_id = %s and npc_id is not null",
        (crew,),
    ).fetchone() == (0, 600, 1)
    assert rpc(database, "finale_post_holds", crew, PUBLIC_LIGHTS[1], 1) is True


def test_p7_fetch_ends_a_partners_post_and_live_lock_without_deleting_history(database):
    crew = prepare(database)
    begin_night(database, crew, player=PLAYER)
    assert man_light(database, crew)["status"] == "done"
    move_clock(database, crew, 600)
    assert signal(database, crew, seat=2, light=PUBLIC_LIGHTS[0])["status"] == "locked"
    move_clock(database, crew, 601)
    assert fetch(database, crew)["status"] == "done"
    assert database.execute(
        "select ended_second from public.finale_posts where crew_id = %s", (crew,)
    ).fetchall() == [(601,)]
    assert database.execute(
        "select ended_second from public.finale_signals where crew_id = %s", (crew,)
    ).fetchall() == [(601,)]


def test_p8_takeover_refuses_the_old_partner_but_keeps_running_find_and_pin(database):
    crew = prepare(database)
    fetch(database, crew)
    as_owner(database)
    database.execute(
        "update public.crew_seats set npc_id = null, player_id = %s "
        "where crew_id = %s and seat_no = 1",
        (PLAYERS[0], crew),
    )
    as_server(database)
    assert fetch(database, crew, uid="fetch002", card="C1")["reason"] == "seat_changed"
    move_clock(database, crew, 900)
    assert database.execute(
        "select seat_no, ready_second from public.case_finds where card_id = 'C4' and crew_id = %s",
        (crew,),
    ).fetchall() == [(1, 600)]
    assert database.execute(
        "select seat_no, pinned_second, pinned_by from public.board_pins where crew_id = %s",
        (crew,),
    ).fetchall() == [(1, 900, PLAYER)]


def test_p9_twenty_five_accepted_orders_have_consecutive_numbers_without_gaps(database):
    crew = prepare(database)
    begin_night(database, crew, player=PLAYER)
    numbers = []
    for number in range(1, 26):
        second = (number - 1) * 600
        move_clock(database, crew, second)
        as_owner(database)
        database.execute(
            "update public.case_state set night_started_second = %s where crew_id = %s",
            (second, crew),
        )
        as_server(database)
        reply = man_light(database, crew, uid=f"order{number:03}", light=PUBLIC_LIGHTS[number % 2])
        numbers.append(reply["orderNo"])
    assert numbers == list(range(1, 26))
    assert database.execute(
        "select orders_count from public.case_state where crew_id = %s", (crew,)
    ).fetchone() == (25,)


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_p10_browser_roles_have_no_table_or_function_access(database, role):
    import psycopg

    assert database.execute(
        "select relrowsecurity from pg_class where oid = 'public.npc_orders'::regclass"
    ).fetchone() == (True,)
    assert database.execute(
        "select count(*) from pg_policies where schemaname = 'public' and tablename = 'npc_orders'"
    ).fetchone() == (0,)
    for right in ("select", "insert", "update", "delete", "truncate", "references", "trigger"):
        assert database.execute(
            "select has_table_privilege(%s, 'public.npc_orders', %s)", (role, right)
        ).fetchone() == (False,)
    functions = database.execute(
        "select oid::regprocedure::text, prosecdef, proconfig from pg_proc "
        "where pronamespace = 'public'::regnamespace and proname = any(%s)",
        (list(FUNCTIONS),),
    ).fetchall()
    assert len(functions) == 4
    for name, definer, config in functions:
        assert not definer and config == ['search_path=""']
        assert database.execute(
            "select has_function_privilege(%s, %s, 'execute')", (role, name)
        ).fetchone() == (False,)
    database.execute(f"set local role {role}")
    with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
        database.execute("select * from public.npc_orders")
    with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
        rpc(database, "npc_begin", None, None, None, None, None)


def test_receipts_identify_the_exact_same_target_orders_for_different_partners(database):
    crew = prepare(database, partners=(1, 3))
    fetch(database, crew, uid="receipt1")
    fetch(database, crew, uid="receipt2", seat=3)
    assert database.execute(
        "select action_uid, order_no, seat_no, target, ordered_second from public.npc_orders "
        "where ordered_by = %s order by order_no",
        (PLAYER,),
    ).fetchall() == [("receipt1", 1, 1, "C4", 0), ("receipt2", 2, 3, "C4", 0)]
    repeat = fetch(database, crew, uid="receipt1", seat=3, card="C1")
    assert repeat == {
        "status": "repeat",
        "crewId": str(crew),
        "kind": "order",
        "target": "C4",
        "outcome": "fetch",
    }
    assert database.execute(
        "select count(*) from public.npc_orders where crew_id = %s", (crew,)
    ).fetchone() == (2,)


def test_paid_errands_fail_without_charging_or_creating_an_order(database):
    import psycopg

    crew = prepare(database)
    with (
        pytest.raises(psycopg.errors.RaiseException, match="paid_errands_off"),
        database.transaction(),
    ):
        fetch(database, crew, price=100)
    assert database.execute("select count(*) from public.npc_orders").fetchone() == (0,)
    assert database.execute("select count(*) from public.wallet_transactions").fetchone() == (0,)


def test_a_future_find_is_not_pinned_early_and_no_refusal_records_an_order(database):
    crew = prepare(database)
    assert fetch(database, crew, needs=["D3"])["reason"] == "no_lead"
    database.execute(
        "insert into public.case_finds "
        "(crew_id, seat_no, card_id, route_id, started_second, ready_second) "
        "values (%s, 1, 'C4', 'C4.generic', 0, 100)",
        (crew,),
    )
    assert fetch(database, crew)["reason"] == "not_carrying"
    assert database.execute("select count(*) from public.npc_orders").fetchone() == (0,)
    assert database.execute("select count(*) from public.board_pins").fetchone() == (0,)
    assert database.execute("select count(*) from public.wallet_transactions").fetchone() == (0,)
    move_clock(database, crew, 100)
    assert fetch(database, crew)["pinSecond"] == 400


def test_reapply_repairs_broad_grants_and_service_cannot_update_or_delete_order_history(database):
    import psycopg

    crew = prepare(database)
    fetch(database, crew)
    as_owner(database)
    database.execute("grant all on public.npc_orders to anon, authenticated, service_role")
    database.execute(MIGRATION.read_text())
    as_server(database)
    for query in ("delete from public.npc_orders", "update public.npc_orders set price = 0"):
        with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
            database.execute(query)
    for role in ("anon", "authenticated"):
        assert database.execute(
            "select has_table_privilege(%s, 'public.npc_orders', 'select')", (role,)
        ).fetchone() == (False,)


def test_migration_parses_with_a_real_postgresql_parser():
    pglast = pytest.importorskip("pglast")
    assert pglast.parse_sql(MIGRATION.read_text())
