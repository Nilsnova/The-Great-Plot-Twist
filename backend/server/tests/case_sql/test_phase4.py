"""Phase 4 checks P1 to P10 against the disposable local PostgreSQL chain.

Used by: the opt-in SQL gate. Case facts and timings come from the checked loader,
and partner seats use A6's canonical muster rule. No protected prose is printed.
"""

import os
from uuid import uuid4

import pytest

from server.crews.seats import Seat, partner_seats
from server.game.case_data import load_case

from .conftest import PLAYERS, as_owner, as_server, move_clock, open_case, rpc
from .test_phase2 import post, revision, signal

pytestmark = [
    pytest.mark.pg,
    pytest.mark.skipif(os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in database tests"),
]
SIGNATURES = (
    "npc_begin(uuid,uuid,text,smallint,text)",
    "npc_next_order_no(uuid)",
    "npc_fetch_pin(uuid,uuid,text,smallint,text,text,text,text[],jsonb,integer,integer,integer,integer,text,integer,text)",
    "npc_man_light(uuid,uuid,text,smallint,text,text,integer,integer)",
)


@pytest.fixture(scope="module")
def npc_data():
    return load_case()


def durations(data):
    values = data.raw["planning"]["partner_minutes_copied_from_npc_partners_md"]
    return values["errand"] * 60, values["arrive_after"] * 60, values["pin"] * 60


def npc_crew(database, data):
    as_owner(database)
    database.execute(
        "insert into auth.users (id) values (%s) on conflict do nothing", (PLAYERS[0],)
    )
    crew = uuid4()
    database.execute(
        "insert into public.crews (id, created_by, mode, status, started_at) "
        "values (%s, %s, 'solo', 'active', clock_timestamp())",
        (crew, PLAYERS[0]),
    )
    kit = next(item.id for item in data.kits if item.id != "witness")
    player = Seat(1, str(PLAYERS[0]), None, kit, None)
    partners = tuple(partner_seats([player]))
    for seat in (player, *partners):
        database.execute(
            "insert into public.crew_seats (crew_id, seat_no, player_id, npc_id, kit) "
            "values (%s, %s, %s, %s, %s)",
            (crew, seat.seat_no, seat.player_id, seat.npc_id, seat.kit),
        )
    as_server(database)
    open_case(database, crew)
    for deduction in data.deductions:
        database.execute(
            "insert into public.case_deductions "
            "(crew_id, deduction_id, formed_second, formed_seat) values (%s, %s, 0, 1)",
            (crew, deduction.id),
        )
    move_clock(database, crew, 0)
    return crew, partners


def free_route(data, *, timed=False):
    return next(
        route
        for route in data.active_routes
        if route.kind == ("timed" if timed else "open")
        and not route.players_only
        and (not timed or route.open_when == "low_tide")
    )


def fetch(
    database,
    crew,
    data,
    partner,
    *,
    uid="fetch001",
    route=None,
    card=None,
    held=False,
    player=PLAYERS[0],
):
    route = route or free_route(data)
    card = card or route.card_id
    item = data.card(card)
    window = None if held or route.open_when == "always" else data.window(route.open_when)
    reward = next(coin for coin in data.rewards.coins if "{card_id}" in coin.ref)
    return rpc(
        database,
        "npc_fetch_pin",
        crew,
        player,
        uid,
        partner.seat_no,
        partner.npc_id,
        card,
        None if held else route.id,
        list(item.opens_after),
        None
        if window is None
        else {
            "every": window.every_minutes,
            "from": window.from_minute,
            "open": window.open_minutes,
        },
        *durations(data),
        0,
        None,
        reward.amount,
        reward.ref.format(card_id=card),
    )


def man_light(database, crew, data, partner, *, uid="light001", light=None):
    return rpc(
        database,
        "npc_man_light",
        crew,
        PLAYERS[0],
        uid,
        partner.seat_no,
        partner.npc_id,
        light or data.partners.may_man_lights[0],
        durations(data)[0],
        data.night.night_minutes * 60,
    )


def night(database, crew, data, *, uid="night001"):
    return rpc(
        database,
        "finale_nightfall",
        crew,
        PLAYERS[0],
        uid,
        data.night.opens_after[0],
        data.night.night_minutes * 60,
        data.night.dawn_wait_minutes * 60,
    )


def order_count(database, crew):
    return database.execute(
        "select orders_count from public.case_state where crew_id = %s",
        (crew,),
    ).fetchone()[0]


def test_p1_complete_sorted_chain_applies_twice_and_creates_the_four_contracts(database):
    assert database.execute("select to_regclass('public.npc_orders') is not null").fetchone() == (
        True,
    )
    for signature in SIGNATURES:
        assert database.execute(
            "select to_regprocedure(%s) is not null", (f"public.{signature}",)
        ).fetchone() == (True,)


def test_p2_tide_is_checked_on_arrival_and_all_acceptance_deadlines_are_fixed(database, npc_data):
    crew, partners = npc_crew(database, npc_data)
    route = free_route(npc_data, timed=True)
    move_clock(database, crew, 3 * 60)
    assert fetch(database, crew, npc_data, partners[0], route=route) == {
        "status": "refused",
        "reason": "locked_window",
        "minute": 3,
    }
    assert order_count(database, crew) == 0
    move_clock(database, crew, 8 * 60)
    reply = fetch(database, crew, npc_data, partners[0], route=route)
    assert reply["foundSecond"] == 8 * 60 + 600
    assert reply["pinSecond"] == 8 * 60 + 900
    assert database.execute(
        "select ordered_second, arrive_second, found_second, pin_second, ready_second, route_id "
        "from public.npc_orders where crew_id = %s",
        (crew,),
    ).fetchone() == (480, 720, 1080, 1380, 1380, route.id)
    assert database.execute(
        "select ready_second, route_id, coins_paid, started_by, by_partner, order_no "
        "from public.case_finds where crew_id = %s and card_id = %s and seat_no = %s",
        (crew, route.card_id, partners[0].seat_no),
    ).fetchone() == (1080, route.id, 0, PLAYERS[0], True, 1)
    stored = database.execute(
        "select * from public.npc_orders where crew_id = %s", (crew,)
    ).fetchall()
    before = revision(database, crew)
    move_clock(database, crew, 5000)
    for _ in range(2):
        assert (
            database.execute(
                "select * from public.npc_orders where crew_id = %s", (crew,)
            ).fetchall()
            == stored
        )
        assert revision(database, crew) == before


def test_p3_busy_ends_at_the_exact_ready_second_without_consuming_refused_orders(
    database, npc_data
):
    crew, partners = npc_crew(database, npc_data)
    route = free_route(npc_data)
    first = fetch(database, crew, npc_data, partners[0], route=route)
    second_route = next(
        item
        for item in npc_data.active_routes
        if item.kind == "open" and item.card_id != route.card_id and not item.players_only
    )
    move_clock(database, crew, first["pinSecond"] - 1)
    assert fetch(database, crew, npc_data, partners[0], route=second_route, uid="fetch002") == {
        "status": "refused",
        "reason": "busy",
        "seconds": 1,
    }
    assert order_count(database, crew) == 1
    move_clock(database, crew, first["pinSecond"])
    assert (
        fetch(database, crew, npc_data, partners[0], route=second_route, uid="fetch002")["orderNo"]
        == 2
    )


def test_p4_witness_starting_card_is_pin_only_and_keeps_its_original_find(database, npc_data):
    crew, partners = npc_crew(database, npc_data)
    witness = next(partner for partner in partners if partner.kit == "witness")
    card = next(
        route.card_id
        for route in npc_data.routes
        if route.starts_in_journal and route.kit == "witness"
    )
    original = database.execute(
        "select * from public.case_finds where crew_id = %s and seat_no = %s",
        (crew, witness.seat_no),
    ).fetchall()
    reply = fetch(database, crew, npc_data, witness, card=card, held=True)
    assert reply["foundSecond"] is None
    assert reply["pinSecond"] == 300
    assert database.execute(
        "select arrive_second, found_second, pin_second, ready_second, route_id "
        "from public.npc_orders where crew_id = %s",
        (crew,),
    ).fetchone() == (None, None, 300, 300, None)
    assert (
        database.execute(
            "select * from public.case_finds where crew_id = %s and seat_no = %s",
            (crew, witness.seat_no),
        ).fetchall()
        == original
    )


def test_p5_acceptance_credits_and_pays_the_ordering_player_once_across_crews(database, npc_data):
    card = free_route(npc_data).card_id
    reward = next(coin for coin in npc_data.rewards.coins if "{card_id}" in coin.ref)
    for index in range(2):
        crew, partners = npc_crew(database, npc_data)
        reply = fetch(database, crew, npc_data, partners[0], uid=f"fetch{index:03}")
        assert reply["coinsPaid"] == (50 if index == 0 else 0)
        assert reply["revision"] == 2
        assert database.execute(
            "select ordered_second, pinned_second, pinned_by, by_partner, order_no, coins_rewarded "
            "from public.board_pins where crew_id = %s",
            (crew,),
        ).fetchone() == (0, 900, PLAYERS[0], True, 1, reply["coinsPaid"])
        assert database.execute("select count(*) from public.wallets").fetchone() == (1,)
        assert database.execute(
            "select count(*) from public.wallet_transactions where reason = 'clue_purchase'"
        ).fetchone() == (0,)
    assert database.execute(
        "select player_id, delta, reason from public.wallet_transactions where ref = %s",
        (reward.ref.format(card_id=card),),
    ).fetchall() == [(PLAYERS[0], 50, reward.reason)]


def test_p6_man_light_requires_night_and_an_unoccupied_public_light(database, npc_data):
    crew, partners = npc_crew(database, npc_data)
    assert man_light(database, crew, npc_data, partners[0]) == {
        "status": "refused",
        "reason": "not_nightfall",
    }
    assert order_count(database, crew) == 0
    night(database, crew, npc_data)
    post(database, crew, npc_data, light=npc_data.partners.may_man_lights[0], climb=0)
    assert man_light(database, crew, npc_data, partners[0]) == {
        "status": "refused",
        "reason": "light_taken",
    }
    assert order_count(database, crew) == 0


def test_p6_reservation_is_immediate_but_a_signal_waits_until_arrival(database, npc_data):
    crew, partners = npc_crew(database, npc_data)
    night(database, crew, npc_data)
    light = npc_data.partners.may_man_lights[0]
    reply = man_light(database, crew, npc_data, partners[0], light=light)
    assert reply["onPostSecond"] == 600
    assert post(database, crew, npc_data, light=light) == {
        "status": "refused",
        "reason": "post_taken",
    }
    assert man_light(database, crew, npc_data, partners[1], uid="light002", light=light) == {
        "status": "refused",
        "reason": "light_taken",
    }
    move_clock(database, crew, 599)
    assert signal(database, crew, npc_data, light=light) == {
        "status": "refused",
        "reason": "post_not_ready",
    }
    move_clock(database, crew, 600)
    assert signal(database, crew, npc_data, light=light)["status"] == "locked"


def test_p7_a_new_fetch_ends_the_partner_post_and_its_active_lock(database, npc_data):
    crew, partners = npc_crew(database, npc_data)
    night(database, crew, npc_data)
    light = npc_data.partners.may_man_lights[0]
    man_light(database, crew, npc_data, partners[0], light=light)
    move_clock(database, crew, 600)
    signal(database, crew, npc_data, light=light)
    move_clock(database, crew, 601)
    assert fetch(database, crew, npc_data, partners[0])["orderNo"] == 2
    assert database.execute(
        "select ended_second from public.finale_posts where crew_id = %s", (crew,)
    ).fetchall() == [(601,)]
    assert database.execute(
        "select ended_second from public.finale_signals where crew_id = %s", (crew,)
    ).fetchone() == (601,)


def test_p8_a6_takeover_refuses_new_orders_but_preserves_accepted_find_and_pin_deadlines(
    database, npc_data
):
    crew, partners = npc_crew(database, npc_data)
    partner = partners[0]
    route = free_route(npc_data)
    fetch(database, crew, npc_data, partner, route=route)
    as_owner(database)
    newcomer = uuid4()
    database.execute("insert into auth.users (id) values (%s)", (newcomer,))
    version = database.execute(
        "select version from public.crews where id = %s", (crew,)
    ).fetchone()[0]
    as_server(database)
    assert (
        rpc(database, "crew_take_seat", crew, newcomer, partner.seat_no, partner.kit, version)[
            "status"
        ]
        == "joined"
    )
    assert fetch(database, crew, npc_data, partner, uid="fetch002") == {
        "status": "refused",
        "reason": "seat_changed",
    }
    assert man_light(database, crew, npc_data, partner) == {
        "status": "refused",
        "reason": "seat_changed",
    }
    assert fetch(database, crew, npc_data, partner)["status"] == "repeat"
    for second, found, pinned in (
        (599, False, False),
        (600, True, False),
        (899, True, False),
        (900, True, True),
    ):
        move_clock(database, crew, second)
        assert database.execute(
            "select ready_second <= %s from public.case_finds "
            "where crew_id = %s and seat_no = %s and card_id = %s",
            (second, crew, partner.seat_no, route.card_id),
        ).fetchone() == (found,)
        assert database.execute(
            "select pinned_second <= %s from public.board_pins "
            "where crew_id = %s and seat_no = %s and card_id = %s",
            (second, crew, partner.seat_no, route.card_id),
        ).fetchone() == (pinned,)
    assert order_count(database, crew) == 1
    assert revision(database, crew) == 2


def test_p9_twenty_five_real_orders_have_no_number_gaps_from_refusals_or_repeats(
    database, npc_data
):
    crew, partners = npc_crew(database, npc_data)
    night_start = 0
    now = 0
    night(database, crew, npc_data)
    for index in range(25):
        if now >= night_start + npc_data.night.night_minutes * 60:
            now = (
                night_start + (npc_data.night.night_minutes + npc_data.night.dawn_wait_minutes) * 60
            )
            move_clock(database, crew, now)
            night(database, crew, npc_data, uid=f"night{index:03}")
            night_start = now
        move_clock(database, crew, now)
        light = npc_data.partners.may_man_lights[index % 2]
        uid = f"light{index:03}"
        reply = man_light(database, crew, npc_data, partners[0], uid=uid, light=light)
        assert reply["orderNo"] == index + 1
        assert (
            man_light(database, crew, npc_data, partners[0], uid=uid, light=light)["status"]
            == "repeat"
        )
        assert (
            man_light(database, crew, npc_data, partners[0], uid="refused1", light=light)["reason"]
            == "busy"
        )
        now = reply["onPostSecond"]
    assert order_count(database, crew) == 25
    assert database.execute(
        "select order_no from public.npc_orders where crew_id = %s order by order_no", (crew,)
    ).fetchall() == [(number,) for number in range(1, 26)]


def test_p10_authenticated_cannot_access_orders_or_any_npc_function(database):
    import psycopg

    assert database.execute(
        "select relrowsecurity from pg_class where oid = 'public.npc_orders'::regclass"
    ).fetchone() == (True,)
    for role in ("anon", "authenticated"):
        assert database.execute(
            "select has_table_privilege(%s, 'public.npc_orders', 'select,insert,update,delete')",
            (role,),
        ).fetchone() == (False,)
        for signature in SIGNATURES:
            assert database.execute(
                "select has_function_privilege(%s, %s, 'execute')", (role, f"public.{signature}")
            ).fetchone() == (False,)
    as_server(database)
    for operation in ("delete from public.npc_orders", "update public.npc_orders set price = 0"):
        with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
            database.execute(operation)
    database.execute("set local role authenticated")
    with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
        database.execute("select * from public.npc_orders")
    with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
        rpc(database, "npc_next_order_no", None)


@pytest.mark.parametrize("kind", ["fetch", "man_light"])
def test_order_receipts_repeat_before_finished_crew_rules(database, npc_data, kind):
    crew, partners = npc_crew(database, npc_data)
    if kind == "man_light":
        night(database, crew, npc_data)
    intent = fetch if kind == "fetch" else man_light
    reply = intent(database, crew, npc_data, partners[0], uid="repeat01")
    before = revision(database, crew)
    assert reply["status"] == "done"
    database.execute("update public.crews set status = 'finished' where id = %s", (crew,))
    repeated = intent(database, crew, npc_data, partners[0], uid="repeat01")
    assert repeated["status"] == "repeat"
    assert repeated["outcome"] == kind
    assert repeated["target"] == str(reply["orderNo"])
    assert order_count(database, crew) == 1
    assert revision(database, crew) == before
    assert (
        intent(database, crew, npc_data, partners[0], uid="changed1")["reason"] == "crew_not_active"
    )


def test_same_card_orders_at_one_second_repeat_their_exact_distinct_order_numbers(
    database, npc_data
):
    crew, partners = npc_crew(database, npc_data)
    route = free_route(npc_data)
    first = fetch(database, crew, npc_data, partners[0], route=route, uid="fetch001")
    second = fetch(database, crew, npc_data, partners[1], route=route, uid="fetch002")
    assert (first["orderNo"], second["orderNo"]) == (1, 2)
    assert database.execute(
        "select action_uid, target, case_second from public.case_actions "
        "where crew_id = %s and kind = 'order' order by id",
        (crew,),
    ).fetchall() == [("fetch001", "1", 0), ("fetch002", "2", 0)]
    for partner, uid, number in ((partners[0], "fetch001", 1), (partners[1], "fetch002", 2)):
        reply = fetch(database, crew, npc_data, partner, route=route, uid=uid)
        assert reply["status"] == "repeat"
        assert reply["target"] == str(number)
        assert database.execute(
            "select seat_no, target, ordered_second from public.npc_orders "
            "where crew_id = %s and order_no = %s",
            (crew, int(reply["target"])),
        ).fetchone() == (partner.seat_no, route.card_id, 0)
    assert order_count(database, crew) == 2
    assert revision(database, crew) == 3


def test_missing_lead_and_repeat_pin_refuse_before_any_new_order_or_payment(database, npc_data):
    crew, partners = npc_crew(database, npc_data)
    route = next(
        route
        for route in npc_data.active_routes
        if npc_data.card(route.card_id).opens_after
        and route.kind == "open"
        and not route.players_only
    )
    as_owner(database)
    database.execute("delete from public.case_deductions where crew_id = %s", (crew,))
    as_server(database)
    assert fetch(database, crew, npc_data, partners[0], route=route)["reason"] == "no_lead"
    assert order_count(database, crew) == 0
    free = free_route(npc_data)
    accepted = fetch(database, crew, npc_data, partners[0], route=free)
    move_clock(database, crew, accepted["pinSecond"])
    assert (
        fetch(database, crew, npc_data, partners[0], route=free, uid="fetch002")["reason"]
        == "already_have"
    )
    assert order_count(database, crew) == 1


def test_only_a_current_player_member_can_order_a_partner(database, npc_data):
    crew, partners = npc_crew(database, npc_data)
    assert fetch(database, crew, npc_data, partners[0], player=uuid4()) == {
        "status": "refused",
        "reason": "not_in_crew",
    }
    assert order_count(database, crew) == 0
    assert revision(database, crew) == 1
