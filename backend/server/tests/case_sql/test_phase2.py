"""Phase 2 checks N1 to N15 against the complete disposable PostgreSQL chain.

Used by: the opt-in case SQL gate. Story facts come from the checked canonical loader;
the checks never print protected content or connect to a Supabase project.
"""

import os
from dataclasses import replace
from uuid import UUID

import pytest

from server.game.case_board import deduction_parts
from server.game.case_data import load_case
from server.game.case_snapshot import Formed, Pin
from server.tests.case_rule_helpers import snapshot

from .conftest import PLAYERS, as_owner, as_server, move_clock, open_case, rpc, seed_crew

pytestmark = [
    pytest.mark.pg,
    pytest.mark.skipif(os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in database tests"),
]

TABLES = ("board_pins", "finale_posts", "finale_signals")
FUNCTIONS = (
    "finale_post_holds(uuid,text,smallint)",
    "finale_leave_post(uuid,smallint,integer,integer)",
    "board_pin(uuid,uuid,text,text,integer,text)",
    "board_pair(uuid,uuid,text,text,text,text,integer,integer,text)",
    "finale_nightfall(uuid,uuid,text,text,integer,integer)",
    "finale_take_post(uuid,uuid,text,text,boolean,integer,integer)",
    "finale_signal(uuid,uuid,text,text,numeric,boolean,integer,integer,integer,integer)",
)


@pytest.fixture(scope="module")
def board_data():
    return load_case()


def opened(database):
    as_owner(database)
    crew = seed_crew(database)
    as_server(database)
    open_case(database, crew)
    move_clock(database, crew, 0)
    return crew


def reward(data, token):
    return next(item for item in data.rewards.coins if token in item.ref)


def pin(database, crew, data, *, card=None, player=PLAYERS[0], uid="pin00001"):
    card = card or data.deductions[0].cards[0]
    coins = reward(data, "{card_id}")
    return rpc(
        database,
        "board_pin",
        crew,
        player,
        uid,
        card,
        coins.amount,
        coins.ref.replace("{card_id}", card),
    )


def pair(database, crew, data, *, uid="pair0001", deduction=True):
    item = data.deductions[0]
    coins = reward(data, "{deduction_id}")
    return rpc(
        database,
        "board_pair",
        crew,
        PLAYERS[0],
        uid,
        *item.cards,
        item.id if deduction else None,
        data.board.wrong_pair_wait_seconds,
        coins.amount,
        coins.ref.replace("{deduction_id}", item.id),
    )


def give_find(database, crew, data, card, *, seat=1, ready=0):
    database.execute(
        "insert into public.case_finds "
        "(crew_id, seat_no, card_id, route_id, started_second, ready_second) "
        "values (%s, %s, %s, %s, 0, %s) on conflict do nothing",
        (crew, seat, card, data.card(card).routes[0].id, ready),
    )


def give_pin(database, crew, card, seat, *, ordered=0, landed=0, player=None, partner=False):
    database.execute(
        "insert into public.board_pins "
        "(crew_id, card_id, seat_no, ordered_second, pinned_second, "
        "pinned_by, by_partner, order_no) "
        "values (%s, %s, %s, %s, %s, %s, %s, %s)",
        (crew, card, seat, ordered, landed, player, partner, 1 if partner else None),
    )


def pair_pins(database, crew, data, *, same_seat=False):
    left, right = data.deductions[0].cards
    give_pin(database, crew, left, 1, player=PLAYERS[0])
    give_pin(database, crew, right, 1 if same_seat else 2, player=PLAYERS[1])


def nightfall(database, crew, data, *, uid="night001"):
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


def night(database, crew, data):
    database.execute(
        "insert into public.case_deductions "
        "(crew_id, deduction_id, formed_second, formed_seat) values (%s, %s, 0, 1)",
        (crew, data.night.opens_after[0]),
    )
    return nightfall(database, crew, data)


def post(
    database, crew, data, *, light=None, player=PLAYERS[0], uid="post0001", climb=None, ready=True
):
    return rpc(
        database,
        "finale_take_post",
        crew,
        player,
        uid,
        light or data.night.lights[0].id,
        ready,
        data.night.climb_minutes * 60 if climb is None else climb,
        data.night.night_minutes * 60,
    )


def signal(database, crew, data, *, light=None, player=PLAYERS[0], uid="signal01", target=True):
    return rpc(
        database,
        "finale_signal",
        crew,
        player,
        uid,
        light or data.night.lights[0].id,
        0,
        target,
        data.night.lock_seconds,
        data.night.relock_wait_seconds,
        data.night.night_minutes * 60,
        data.night.lights_needed,
    )


def partner_post(database, crew, light, *, seat=2):
    partner = f"test_partner_{seat}"
    as_owner(database)
    database.execute(
        "update public.crew_seats set player_id = null, npc_id = %s "
        "where crew_id = %s and seat_no = %s",
        (partner, crew, seat),
    )
    as_server(database)
    database.execute(
        "insert into public.finale_posts "
        "(crew_id, light_id, seat_no, npc_id, taken_second, on_post_second) "
        "values (%s, %s, %s, %s, 0, 0)",
        (crew, light, seat, partner),
    )


def revision(database, crew):
    return database.execute(
        "select revision from public.case_state where crew_id = %s",
        (crew,),
    ).fetchone()[0]


def test_n1_complete_sorted_chain_applies_twice_with_all_phase2_objects(database):
    for table in TABLES:
        assert database.execute(
            "select to_regclass(%s) is not null", (f"public.{table}",)
        ).fetchone() == (True,)
    for function in FUNCTIONS:
        assert database.execute(
            "select to_regprocedure(%s) is not null", (f"public.{function}",)
        ).fetchone() == (True,)


def test_n2_pin_requires_a_landed_find_and_refuses_a_second_pin(database, board_data):
    crew = opened(database)
    card = board_data.deductions[0].cards[0]
    give_find(database, crew, board_data, card, ready=10)
    assert pin(database, crew, board_data) == {"status": "refused", "reason": "card_not_held"}
    assert revision(database, crew) == 1
    move_clock(database, crew, 10)
    assert pin(database, crew, board_data)["revision"] == 2
    assert pin(database, crew, board_data, uid="pin00002") == {
        "status": "refused",
        "reason": "already_pinned",
    }
    assert revision(database, crew) == 2
    assert pin(database, crew, board_data)["status"] == "repeat"


def test_n3_pin_pays_once_across_crews_and_keeps_the_unpaid_pin(database, board_data):
    for number in range(2):
        crew = opened(database)
        give_find(database, crew, board_data, board_data.deductions[0].cards[0])
        reply = pin(database, crew, board_data, uid=f"pin0000{number}")
        assert reply["coinsPaid"] == (50 if number == 0 else 0)
        assert database.execute(
            "select coins_rewarded from public.board_pins where crew_id = %s", (crew,)
        ).fetchone() == (reply["coinsPaid"],)


def test_n4_one_seat_cannot_form_a_deduction(database, board_data):
    crew = opened(database)
    pair_pins(database, crew, board_data, same_seat=True)
    assert pair(database, crew, board_data) == {
        "status": "refused",
        "reason": "different_seats_required",
    }
    assert revision(database, crew) == 1


def test_n5_wrong_pair_logs_once_and_waits_exactly_thirty_seconds(database, board_data):
    crew = opened(database)
    pair_pins(database, crew, board_data)
    assert pair(database, crew, board_data, deduction=False)["revision"] == 2
    move_clock(database, crew, 29)
    assert pair(database, crew, board_data, uid="pair0002") == {
        "status": "refused",
        "reason": "pair_cooldown",
        "seconds": 1,
    }
    assert pair(database, crew, board_data)["outcome"] == "wrong_pair"
    move_clock(database, crew, 30)
    assert pair(database, crew, board_data, uid="pair0003")["revision"] == 3
    assert database.execute(
        "select count(*) from public.case_actions where crew_id = %s", (crew,)
    ).fetchone() == (2,)


def test_n6_deduction_rewards_match_order_credit_before_partner_pin_lands(database, board_data):
    deduction = board_data.deductions[0]
    for number in range(2):
        crew = opened(database)
        pair_pins(database, crew, board_data)
        give_pin(
            database,
            crew,
            deduction.cards[0],
            4,
            ordered=90,
            landed=200,
            player=PLAYERS[2],
            partner=True,
        )
        give_pin(
            database,
            crew,
            deduction.cards[1],
            4,
            ordered=101,
            landed=201,
            player=PLAYERS[3],
            partner=True,
        )
        move_clock(database, crew, 100)
        reply = pair(database, crew, board_data, uid=f"pair000{number}")
        assert reply["status"] == "formed"
        rows = database.execute(
            "select seat_no, card_id, pinned_second, ordered_second, pinned_by, by_partner "
            "from public.board_pins where crew_id = %s",
            (crew,),
        ).fetchall()
        model = replace(
            snapshot(),
            pins=tuple(Pin(a, b, c, d, str(e), f) for a, b, c, d, e, f in rows),
            formed=(Formed(deduction.id, 100),),
        )
        expected = {player for player in PLAYERS if deduction_parts(board_data, model, str(player))}
        assert {UUID(item["playerId"]) for item in reply["payouts"]} == expected
        assert expected == set(PLAYERS[:3])
        assert all(item["paid"] == (200 if number == 0 else 0) for item in reply["payouts"])


def test_n6_pending_partner_pin_cannot_supply_the_second_effective_card(database, board_data):
    crew = opened(database)
    left, right = board_data.deductions[0].cards
    give_pin(database, crew, left, 1)
    give_pin(database, crew, right, 2, landed=10, partner=True)
    assert pair(database, crew, board_data) == {"status": "refused", "reason": "not_pinned"}
    move_clock(database, crew, 10)
    assert pair(database, crew, board_data)["status"] == "formed"


def test_n7_nightfall_enforces_the_deduction_night_and_dawn_boundaries(database, board_data):
    crew = opened(database)
    assert nightfall(database, crew, board_data) == {
        "status": "refused",
        "reason": "deduction_required",
    }
    assert night(database, crew, board_data)["nightNo"] == 1
    move_clock(database, crew, 1199)
    assert nightfall(database, crew, board_data, uid="night002") == {
        "status": "refused",
        "reason": "night_in_progress",
    }
    move_clock(database, crew, 1200)
    assert nightfall(database, crew, board_data, uid="night002") == {
        "status": "refused",
        "reason": "dawn_wait",
        "seconds": 180,
    }
    move_clock(database, crew, 1379)
    assert nightfall(database, crew, board_data, uid="night002")["seconds"] == 1
    move_clock(database, crew, 1380)
    assert nightfall(database, crew, board_data, uid="night002")["nightNo"] == 2
    assert revision(database, crew) == 3


def test_n8_climbing_refuses_a_signal_until_the_arrival_second(database, board_data):
    crew = opened(database)
    night(database, crew, board_data)
    assert post(database, crew, board_data)["onPostSecond"] == 60
    move_clock(database, crew, 59)
    assert signal(database, crew, board_data) == {"status": "refused", "reason": "post_not_ready"}
    move_clock(database, crew, 60)
    assert signal(database, crew, board_data)["status"] == "locked"


def test_n9_other_players_post_is_refused_but_any_player_can_lock_a_partner_post(
    database, board_data
):
    crew = opened(database)
    night(database, crew, board_data)
    post(database, crew, board_data, player=PLAYERS[1], climb=0)
    assert signal(database, crew, board_data) == {"status": "refused", "reason": "post_not_owned"}
    light = board_data.night.lights[1].id
    partner_post(database, crew, light, seat=3)
    assert signal(database, crew, board_data, light=light)["status"] == "locked"


def test_n10_miss_is_logged_once_and_relock_waits_five_seconds(database, board_data):
    crew = opened(database)
    night(database, crew, board_data)
    post(database, crew, board_data, climb=0)
    assert signal(database, crew, board_data, target=False)["status"] == "off_target"
    assert revision(database, crew) == 4
    move_clock(database, crew, 4)
    assert signal(database, crew, board_data, uid="signal02") == {
        "status": "refused",
        "reason": "aim_cooldown",
        "seconds": 1,
    }
    assert signal(database, crew, board_data)["outcome"] == "off_target"
    assert revision(database, crew) == 4
    move_clock(database, crew, 5)
    assert signal(database, crew, board_data, uid="signal02")["revision"] == 5


@pytest.mark.parametrize("last,parted", [(89, True), (90, False)])
def test_n11_three_distinct_seats_and_lights_need_strictly_overlapping_locks(
    database, board_data, last, parted
):
    crew = opened(database)
    night(database, crew, board_data)
    for index, second in enumerate((0, 45, last)):
        light = board_data.night.lights[index].id
        post(
            database,
            crew,
            board_data,
            light=light,
            player=PLAYERS[index],
            uid=f"post000{index}",
            climb=0,
        )
        move_clock(database, crew, second)
        reply = signal(
            database, crew, board_data, light=light, player=PLAYERS[index], uid=f"signal0{index}"
        )
    assert reply["parted"] is parted
    assert database.execute(
        "select count(*) from public.finale_signals where crew_id = %s and parted", (crew,)
    ).fetchone() == (3 if parted else 0,)
    assert database.execute(
        "select schooner_found_second from public.case_state where crew_id = %s", (crew,)
    ).fetchone() == (last if parted else None,)


def test_n11_one_player_can_lock_own_home_post_and_two_partner_posts(database, board_data):
    crew = opened(database)
    night(database, crew, board_data)
    partner_lights = tuple(light for light in board_data.night.lights if light.partners_may_man)[:2]
    for index, light in enumerate(partner_lights, 2):
        partner_post(database, crew, light.id, seat=index)
        reply = signal(database, crew, board_data, light=light.id, uid=f"signal0{index}")
        assert reply["parted"] is False
    home = next(light for light in board_data.night.lights if not light.partners_may_man)
    assert post(database, crew, board_data, light=home.id, climb=0)["status"] == "done"
    reply = signal(database, crew, board_data, light=home.id, uid="signal04")
    assert reply["parted"] is True
    assert database.execute(
        "select count(distinct aimed_seat_no), count(distinct post_seat_no) "
        "from public.finale_signals where crew_id = %s",
        (crew,),
    ).fetchone() == (1, 3)


def test_n11_one_seat_hopping_between_lights_never_parts_the_fog(database, board_data):
    crew = opened(database)
    night(database, crew, board_data)
    for index, light in enumerate(board_data.night.lights[:3]):
        move_clock(database, crew, index)
        post(database, crew, board_data, light=light.id, climb=0, uid=f"post000{index}")
        reply = signal(database, crew, board_data, light=light.id, uid=f"signal0{index}")
        assert reply["parted"] is False
    assert database.execute(
        "select ended_second from public.finale_signals where crew_id = %s order by id",
        (crew,),
    ).fetchall() == [(1,), (2,), (None,)]


def test_n12_post_move_ends_its_lock_and_preserves_both_history_rows(database, board_data):
    crew = opened(database)
    night(database, crew, board_data)
    post(database, crew, board_data, climb=0)
    signal(database, crew, board_data)
    move_clock(database, crew, 1)
    assert (
        post(database, crew, board_data, light=board_data.night.lights[1].id, uid="post0002")[
            "status"
        ]
        == "done"
    )
    assert database.execute(
        "select ended_second from public.finale_posts where crew_id = %s order by id", (crew,)
    ).fetchall() == [(1,), (None,)]
    assert database.execute(
        "select ended_second from public.finale_signals where crew_id = %s", (crew,)
    ).fetchone() == (1,)


def test_n13_a6_takeover_invalidates_a_partner_post_and_releases_it_on_the_next_move(
    database, board_data
):
    crew = opened(database)
    night(database, crew, board_data)
    light = board_data.night.lights[0].id
    partner_post(database, crew, light)
    signal(database, crew, board_data)
    as_owner(database)
    newcomer = UUID(int=90)
    database.execute("insert into auth.users (id) values (%s)", (newcomer,))
    version = database.execute(
        "select version from public.crews where id = %s", (crew,)
    ).fetchone()[0]
    as_server(database)
    assert (
        rpc(database, "crew_take_seat", crew, newcomer, 2, "informant", version)["status"]
        == "joined"
    )
    assert database.execute(
        "select public.finale_post_holds(%s, %s, 2::smallint)", (crew, light)
    ).fetchone() == (False,)
    assert signal(database, crew, board_data, uid="signal02") == {
        "status": "refused",
        "reason": "post_not_ready",
    }
    move_clock(database, crew, 1)
    assert post(database, crew, board_data, climb=0)["status"] == "done"
    assert database.execute(
        "select ended_second from public.finale_posts where crew_id = %s order by id", (crew,)
    ).fetchall() == [(1,), (None,)]
    assert database.execute(
        "select ended_second from public.finale_signals where crew_id = %s", (crew,)
    ).fetchone() == (1,)


def test_n14_authenticated_has_no_table_sequence_or_function_privileges(database):
    import psycopg

    for table in TABLES:
        assert database.execute(
            "select relrowsecurity from pg_class where oid = %s::regclass", (f"public.{table}",)
        ).fetchone() == (True,)
        for right in ("select", "insert", "update", "delete", "truncate", "references", "trigger"):
            assert database.execute(
                "select has_table_privilege('authenticated', %s, %s)", (f"public.{table}", right)
            ).fetchone() == (False,)
    for function in FUNCTIONS:
        assert database.execute(
            "select has_function_privilege('authenticated', %s, 'execute')", (f"public.{function}",)
        ).fetchone() == (False,)
    for sequence in ("finale_posts_id_seq", "finale_signals_id_seq"):
        for role in ("anon", "authenticated", "service_role"):
            assert database.execute(
                "select has_sequence_privilege(%s, %s, 'usage,select,update')",
                (role, f"public.{sequence}"),
            ).fetchone() == (False,)
    database.execute("set local role authenticated")
    for table in TABLES:
        with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
            database.execute(f"select * from public.{table}")
    with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
        rpc(database, "board_pin", None, None, "pin00001", "C1", 50, "test:card")


def test_n14_server_can_only_end_duties_and_mark_locks_without_erasing_history(database):
    import psycopg

    as_server(database)
    for table in TABLES:
        with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
            database.execute(f"delete from public.{table}")
    for statement in (
        "update public.board_pins set ordered_second = 0",
        "update public.finale_posts set taken_second = 0",
        "update public.finale_signals set bearing = 0",
    ):
        with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
            database.execute(statement)
    database.execute("update public.finale_posts set ended_second = 0")
    database.execute("update public.finale_signals set ended_second = 0, parted = true")


@pytest.mark.parametrize("conflict", ["light", "seat"])
def test_n15_partial_unique_indexes_reject_open_collisions_and_allow_ended_history(
    database, board_data, conflict
):
    import psycopg

    crew = opened(database)
    night(database, crew, board_data)
    post(database, crew, board_data, climb=0)
    light = board_data.night.lights[0 if conflict == "light" else 1].id
    seat = 2 if conflict == "light" else 1
    statement = (
        "insert into public.finale_posts "
        "(crew_id, light_id, seat_no, player_id, taken_second, on_post_second) "
        "values (%s, %s, %s, %s, 0, 0)"
    )
    with pytest.raises(psycopg.errors.UniqueViolation), database.transaction():
        database.execute(statement, (crew, light, seat, PLAYERS[seat - 1]))
    database.execute("update public.finale_posts set ended_second = 0 where crew_id = %s", (crew,))
    database.execute(statement, (crew, light, seat, PLAYERS[seat - 1]))
    assert database.execute(
        "select count(*) from public.finale_posts where crew_id = %s", (crew,)
    ).fetchone() == (2,)


def test_refusals_do_not_move_a_post_or_increment_revision(database, board_data):
    crew = opened(database)
    assert post(database, crew, board_data) == {"status": "refused", "reason": "night_required"}
    night(database, crew, board_data)
    assert post(database, crew, board_data, ready=False) == {
        "status": "refused",
        "reason": "light_not_ready",
    }
    post(database, crew, board_data, climb=0)
    before = revision(database, crew)
    assert post(database, crew, board_data, uid="post0002") == {
        "status": "refused",
        "reason": "already_on_post",
    }
    assert post(database, crew, board_data, uid="post0002", player=PLAYERS[1]) == {
        "status": "refused",
        "reason": "post_taken",
    }
    assert revision(database, crew) == before


def test_posts_survive_dawn_and_a_failed_night_keeps_board_progress(database, board_data):
    crew = opened(database)
    pair_pins(database, crew, board_data)
    night(database, crew, board_data)
    post(database, crew, board_data, climb=0)
    signal(database, crew, board_data)
    move_clock(database, crew, 1200)
    assert signal(database, crew, board_data, uid="signal02") == {
        "status": "refused",
        "reason": "night_required",
    }
    move_clock(database, crew, 1380)
    assert nightfall(database, crew, board_data, uid="night002")["nightNo"] == 2
    assert database.execute(
        "select count(*) from public.board_pins where crew_id = %s", (crew,)
    ).fetchone() == (2,)
    assert database.execute(
        "select count(*) from public.case_deductions where crew_id = %s", (crew,)
    ).fetchone() == (1,)
    assert database.execute(
        "select ended_second from public.finale_posts where crew_id = %s", (crew,)
    ).fetchone() == (None,)


@pytest.mark.parametrize("status", ["forming", "finished"])
def test_all_intents_pass_nonactive_crews_through_case_begin(database, board_data, status):
    crew = opened(database)
    database.execute("update public.crews set status = %s where id = %s", (status, crew))
    for reply in (
        pin(database, crew, board_data),
        pair(database, crew, board_data),
        nightfall(database, crew, board_data),
        post(database, crew, board_data),
        signal(database, crew, board_data),
    ):
        assert reply == {"status": "refused", "reason": "crew_not_active", "crewStatus": status}
    assert revision(database, crew) == 1


@pytest.mark.parametrize("kind", ["pin", "pair", "nightfall", "post", "signal"])
def test_every_intent_repeats_its_receipt_before_finished_crew_rules(database, board_data, kind):
    crew = opened(database)
    if kind == "pin":
        give_find(database, crew, board_data, board_data.deductions[0].cards[0])
    elif kind == "pair":
        pair_pins(database, crew, board_data)
    else:
        database.execute(
            "insert into public.case_deductions "
            "(crew_id, deduction_id, formed_second, formed_seat) values (%s, %s, 0, 1)",
            (crew, board_data.night.opens_after[0]),
        )
        if kind != "nightfall":
            nightfall(database, crew, board_data)
        if kind == "signal":
            post(database, crew, board_data, climb=0)
    intent = {"pin": pin, "pair": pair, "nightfall": nightfall, "post": post, "signal": signal}[
        kind
    ]
    before = revision(database, crew)
    assert intent(database, crew, board_data, uid="repeat01")["revision"] == before + 1
    database.execute("update public.crews set status = 'finished' where id = %s", (crew,))
    reply = intent(database, crew, board_data, uid="repeat01")
    assert reply["status"] == "repeat"
    assert reply["kind"] == kind
    assert revision(database, crew) == before + 1
