"""Opt-in local adapter proof against real Phase 2 to 4 SQL and embedded reads.

Used by: R1 preparation. Every check starts the guarded disposable Unix-socket database,
applies the complete checkout migration chain twice and deletes its directory afterwards.
"""

import asyncio
import os
from pathlib import Path
from uuid import uuid4

import pytest

from server.game.case_data import load_case
from server.supabase_admin import SupabaseRejected
from tools.local_admin import LocalAdmin
from tools.local_database import ScratchDatabase
from tools.local_players import PLAYERS

pytestmark = pytest.mark.skipif(
    os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in disposable PostgreSQL checks"
)


@pytest.fixture
def database():
    pytest.importorskip("pgserver")
    pytest.importorskip("psycopg")
    instance = ScratchDatabase()
    instance.start()
    directory = Path(instance.directory.name)
    try:
        yield instance
    finally:
        instance.close()
    assert instance.uri is None and not directory.exists()


def call(admin, name, **arguments):
    return asyncio.run(admin.call_function(name, arguments))


def read(admin, table, **query):
    return asyncio.run(admin.select_rows(table, query))


def crew(database):
    identifier = uuid4()
    with database.connect() as connection:
        connection.execute(
            "insert into public.crews (id, created_by, mode, status, started_at) "
            "values (%s, %s, 'crew', 'active', clock_timestamp())",
            (identifier, PLAYERS[0].id),
        )
        for seat, kit in enumerate(("true_keeper", "witness", "informant", "stranger"), 1):
            connection.execute(
                "insert into public.crew_seats (crew_id, seat_no, player_id, npc_id, kit) "
                "values (%s, %s, %s, %s, %s)",
                (
                    identifier,
                    seat,
                    PLAYERS[seat - 1].id if seat <= 2 else None,
                    None if seat <= 2 else f"partner_{seat}",
                    kit,
                ),
            )
    return identifier


def open_case(admin, identifier, data):
    return call(
        admin,
        "case_open",
        p_crew_id=identifier,
        p_case_id=data.case_id,
        p_start_cards=[
            {"kit": route.kit, "card_id": route.card_id, "route_id": route.id}
            for route in data.routes
            if route.starts_in_journal
        ],
    )


def test_actual_local_adapter_executes_all_new_case_intents_and_reads_the_exact_npc_receipt(
    database,
):
    data = load_case()
    admin = LocalAdmin(database)
    identifier = crew(database)
    assert open_case(admin, identifier, data)["status"] == "opened"
    deduction = data.deductions[0]
    pin_reward = next(reward for reward in data.rewards.coins if "{card_id}" in reward.ref)
    with database.connect() as connection:
        for seat, card in enumerate(deduction.cards, 1):
            connection.execute(
                "insert into public.case_finds "
                "(crew_id, seat_no, card_id, route_id, started_second, ready_second) "
                "values (%s, %s, %s, %s, 0, 0) on conflict do nothing",
                (identifier, seat, card, data.card(card).routes[0].id),
            )
    for seat, card in enumerate(deduction.cards, 1):
        assert (
            call(
                admin,
                "board_pin",
                p_crew_id=identifier,
                p_player_id=PLAYERS[seat - 1].id,
                p_action_uid=f"localpin{seat}",
                p_card_id=card,
                p_reward_coins=pin_reward.amount,
                p_reward_ref=pin_reward.ref.format(card_id=card),
            )["status"]
            == "done"
        )
    reward = next(reward for reward in data.rewards.coins if "{deduction_id}" in reward.ref)
    assert (
        call(
            admin,
            "board_pair",
            p_crew_id=identifier,
            p_player_id=PLAYERS[0].id,
            p_action_uid="localpair1",
            p_card_a=deduction.cards[0],
            p_card_b=deduction.cards[1],
            p_deduction_id=deduction.id,
            p_wrong_wait_seconds=data.board.wrong_pair_wait_seconds,
            p_reward_coins=reward.amount,
            p_reward_ref=reward.ref.format(deduction_id=deduction.id),
        )["status"]
        == "formed"
    )
    with database.connect() as connection:
        connection.execute(
            "insert into public.case_deductions "
            "(crew_id, deduction_id, formed_second, formed_seat) values (%s, %s, 0, 1) "
            "on conflict do nothing",
            (identifier, data.night.opens_after[0]),
        )
    assert (
        call(
            admin,
            "finale_nightfall",
            p_crew_id=identifier,
            p_player_id=PLAYERS[0].id,
            p_action_uid="localnight",
            p_needs_deduction=data.night.opens_after[0],
            p_night_seconds=data.night.night_minutes * 60,
            p_dawn_wait_seconds=data.night.dawn_wait_minutes * 60,
        )["status"]
        == "done"
    )
    light = data.partners.may_man_lights[0]
    assert (
        call(
            admin,
            "finale_take_post",
            p_crew_id=identifier,
            p_player_id=PLAYERS[0].id,
            p_action_uid="localpost",
            p_light_id=light,
            p_light_ready=True,
            p_climb_seconds=0,
            p_night_seconds=data.night.night_minutes * 60,
        )["status"]
        == "done"
    )
    assert (
        call(
            admin,
            "finale_signal",
            p_crew_id=identifier,
            p_player_id=PLAYERS[0].id,
            p_action_uid="localsignal",
            p_light_id=light,
            p_bearing=0,
            p_on_target=True,
            p_lock_seconds=data.night.lock_seconds,
            p_relock_wait_seconds=data.night.relock_wait_seconds,
            p_night_seconds=data.night.night_minutes * 60,
            p_lights_needed=data.night.lights_needed,
        )["status"]
        == "locked"
    )
    route = next(
        route for route in data.active_routes if route.kind == "open" and not route.players_only
    )
    durations = data.raw["planning"]["partner_minutes_copied_from_npc_partners_md"]
    arguments = dict(
        p_crew_id=identifier,
        p_player_id=PLAYERS[0].id,
        p_action_uid="localfetch",
        p_seat_no=3,
        p_npc_id="partner_3",
        p_card_id=route.card_id,
        p_route_id=route.id,
        p_needs_deductions=list(data.card(route.card_id).opens_after),
        p_window=None,
        p_errand_seconds=durations["errand"] * 60,
        p_arrive_seconds=durations["arrive_after"] * 60,
        p_pin_seconds=durations["pin"] * 60,
        p_price=0,
        p_purchase_ref=None,
        p_reward_coins=pin_reward.amount,
        p_reward_ref=pin_reward.ref.format(card_id=route.card_id),
    )
    fetched = call(admin, "npc_fetch_pin", **arguments)
    assert fetched["status"] == "done" and fetched["orderNo"] == 1
    repeated = call(admin, "npc_fetch_pin", **arguments)
    assert repeated["status"] == "repeat" and repeated["target"] == "1"
    receipt = read(
        admin,
        "npc_orders",
        select="seat_no,kind,target,order_no",
        crew_id=f"eq.{identifier}",
        ordered_by=f"eq.{PLAYERS[0].id}",
        order_no=f"eq.{repeated['target']}",
        limit="1",
    )
    assert receipt == [{"seat_no": 3, "kind": "fetch", "target": route.card_id, "order_no": 1}]
    assert (
        read(
            admin,
            "npc_orders",
            select="order_no",
            crew_id=f"eq.{identifier}",
            ordered_by=f"eq.{PLAYERS[1].id}",
            order_no="eq.1",
            limit="1",
        )
        == []
    )
    assert (
        call(
            admin,
            "npc_man_light",
            p_crew_id=identifier,
            p_player_id=PLAYERS[0].id,
            p_action_uid="locallight",
            p_seat_no=4,
            p_npc_id="partner_4",
            p_light_id=data.partners.may_man_lights[1],
            p_travel_seconds=durations["errand"] * 60,
            p_night_seconds=data.night.night_minutes * 60,
        )["orderNo"]
        == 2
    )


def test_actual_embeds_scope_filter_sort_and_limit_each_history_before_projection(database):
    data = load_case()
    admin = LocalAdmin(database)
    identifier, other = crew(database), crew(database)
    open_case(admin, identifier, data)
    light = data.partners.may_man_lights[0]
    with database.connect() as connection:
        for ended, taken in ((1, 0), (None, 2)):
            connection.execute(
                "insert into public.finale_posts "
                "(crew_id, light_id, seat_no, player_id, taken_second, "
                "on_post_second, ended_second) "
                "values (%s, %s, 1, %s, %s, %s, %s)",
                (identifier, light, PLAYERS[0].id, taken, taken, ended),
            )
        for index in range(45):
            connection.execute(
                "insert into public.finale_signals (crew_id, night_no, light_id, post_seat_no, "
                "aimed_by, aimed_seat_no, bearing, on_target, case_second) "
                "values (%s, 1, %s, 1, %s, 1, 0, false, %s)",
                (identifier, light, PLAYERS[0].id, index),
            )
        for target_crew, numbers in ((identifier, range(1, 46)), (other, (99,))):
            for number in numbers:
                connection.execute(
                    "insert into public.npc_orders (crew_id, order_no, seat_no, npc_id, kind, "
                    "target, ordered_by, ordered_second, ready_second) "
                    "values (%s, %s, 3, 'partner_3', 'fetch', 'C1', %s, 0, 0)",
                    (target_crew, number, PLAYERS[0].id),
                )
    query = {
        "select": "id,case_state(revision),board_pins(*),finale_posts(ended_second),"
        "finale_signals(case_second),npc_orders(order_no)",
        "id": f"eq.{identifier}",
        "limit": "1",
        "finale_posts.ended_second": "is.null",
        "finale_signals.order": "id.desc",
        "finale_signals.limit": "40",
        "npc_orders.order": "order_no.desc",
        "npc_orders.limit": "40",
    }
    row = asyncio.run(admin.select_rows("crews", query))[0]
    assert row["case_state"] == {"revision": 1}
    assert row["board_pins"] == []
    assert row["finale_posts"] == [{"ended_second": None}]
    assert row["finale_signals"] == [{"case_second": value} for value in range(44, 4, -1)]
    assert row["npc_orders"] == [{"order_no": value} for value in range(45, 5, -1)]
    assert read(admin, "crews", select="case_state(*)", id=f"eq.{other}")[0] == {"case_state": None}
    for key, value in (
        ("finale_posts.ended_second", None),
        ("finale_posts.unknown", "is.null"),
        ("npc_orders.crew_id", f"eq.{other}"),
        ("npc_orders.limit", None),
    ):
        for selected in (identifier, uuid4()):
            broken = {**query, "id": f"eq.{selected}", key: value}
            with pytest.raises(SupabaseRejected):
                asyncio.run(admin.select_rows("crews", broken))


def test_actual_world_wall_projection_multi_order_and_bound_values(database):
    admin = LocalAdmin(database)
    with database.connect() as connection:
        for index, player in enumerate(PLAYERS[:3]):
            connection.execute(
                "update public.profiles set display_name = %s where id = %s",
                (f"Brave Puffin {index + 1}", player.id),
            )
            connection.execute(
                "insert into public.wall_of_lights (player_id, solve_no, added_at) "
                "values (%s, %s, timestamptz '2026-11-06 12:00:00+00' + make_interval(secs => %s))",
                (player.id, 1 if index < 2 else 2, 2 - index),
            )
    assert read(
        admin, "world_state", select="stage,relit_at,solves,extra_lights", id="eq.1", limit="1"
    ) == [{"stage": "dark", "relit_at": None, "solves": 0, "extra_lights": 0}]
    wall = read(
        admin,
        "wall_of_lights",
        select="solve_no,added_at,profiles(display_name)",
        order="solve_no.asc,added_at.asc",
        limit="200",
    )
    assert [(row["solve_no"], row["profiles"]["display_name"]) for row in wall] == [
        (1, "Brave Puffin 2"),
        (1, "Brave Puffin 1"),
        (2, "Brave Puffin 3"),
    ]
    assert read(admin, "profiles", select="id", display_name="eq.Brave Puffin 1' or true--") == []
    assert read(admin, "profiles", select="id", display_name="eq.Brave Puffin 1") == [
        {"id": PLAYERS[0].id}
    ]
