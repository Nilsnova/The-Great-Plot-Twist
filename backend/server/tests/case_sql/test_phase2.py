"""Board and finale checks N1 to N15 against disposable local PostgreSQL only.

Used by: the Phase 2 migration gate. Every test rolls back its stand-in crew and ledger.
"""

import os
from dataclasses import replace
from decimal import Decimal
from pathlib import Path

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

pytestmark = [
    pytest.mark.pg,
    pytest.mark.skipif(os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in database tests"),
]
MIGRATION = MIGRATIONS / "20261106080000_case_board_and_night.sql"
LIGHTS = ("keepers_lamp", "harbor_light", "islet_signal_station", "ruin_light")
TABLES = ("board_pins", "finale_posts", "finale_signals")
FUNCTIONS = (
    "board_pin",
    "board_pair",
    "finale_nightfall",
    "finale_take_post",
    "finale_signal",
    "finale_post_holds",
    "finale_leave_post",
)


def prepare(database, *, partner=False):
    crew = seed_crew(database, partner=partner)
    as_server(database)
    assert open_case(database, crew)["status"] == "opened"
    move_clock(database, crew, 0)
    return crew


def pin(database, crew, *, uid="pin00001", card="C2", player=PLAYERS[0]):
    return rpc(database, "board_pin", crew, player, uid, card, 50, f"false_light:pin:{card}")


def put_pin(database, crew, seat, card, *, player=None, lands=0, ordered=0):
    partner = lands != ordered
    database.execute(
        "insert into public.board_pins "
        "(crew_id, card_id, seat_no, ordered_second, pinned_second, pinned_by, "
        "by_partner, order_no) values (%s, %s, %s, %s, %s, %s, %s, %s)",
        (crew, card, seat, ordered, lands, player, partner, 1 if partner else None),
    )


def pair(database, crew, *, uid="pair0001", deduction="D1"):
    return rpc(
        database,
        "board_pair",
        crew,
        PLAYERS[0],
        uid,
        "C1",
        "C2",
        deduction,
        30,
        200,
        f"false_light:deduction:{deduction or 'none'}",
    )


def nightfall(database, crew, *, uid="night001", player=PLAYERS[0]):
    return rpc(database, "finale_nightfall", crew, player, uid, "D1", 1200, 180)


def begin_night(database, crew, *, player=PLAYERS[0]):
    database.execute(
        "insert into public.case_deductions "
        "(crew_id, deduction_id, formed_second, formed_seat) values (%s, 'D1', 0, 1)",
        (crew,),
    )
    assert nightfall(database, crew, player=player)["status"] == "done"


def take_post(database, crew, *, seat=1, light=LIGHTS[0], uid="post0001", climb=60):
    return rpc(database, "finale_take_post", crew, PLAYERS[seat - 1], uid, light, True, climb, 1200)


def put_post(database, crew, seat, light, *, partner=False):
    database.execute(
        "insert into public.finale_posts "
        "(crew_id, light_id, seat_no, player_id, npc_id, taken_second, on_post_second) "
        "values (%s, %s, %s, %s, %s, 0, 0)",
        (
            crew,
            light,
            seat,
            None if partner else PLAYERS[seat - 1],
            "test_partner" if partner else None,
        ),
    )


def signal(database, crew, *, seat=1, light=LIGHTS[0], uid="signal01", on_target=True):
    return rpc(
        database,
        "finale_signal",
        crew,
        PLAYERS[seat - 1],
        uid,
        light,
        Decimal("10.0"),
        on_target,
        90,
        5,
        1200,
        3,
    )


def test_n1_chain_applies_twice_without_changing_existing_history(database):
    # The session fixture already executed the whole timestamp-ordered chain twice.
    crew = prepare(database)
    assert pin(database, crew)["coinsPaid"] == 50
    as_owner(database)
    database.execute(MIGRATION.read_text())
    as_server(database)
    assert database.execute(
        "select card_id, coins_rewarded from public.board_pins where crew_id = %s", (crew,)
    ).fetchall() == [("C2", 50)]
    assert database.execute(
        "select count(*) from pg_tables where schemaname = 'public' and tablename = any(%s)",
        (list(TABLES),),
    ).fetchone() == (3,)


def test_n2_pin_requires_a_landed_find_and_cannot_pin_twice(database):
    crew = prepare(database)
    assert pin(database, crew, card="C4") == {"status": "refused", "reason": "card_not_held"}
    database.execute(
        "insert into public.case_finds "
        "(crew_id, seat_no, card_id, route_id, started_second, ready_second) "
        "values (%s, 1, 'C4', 'C4.back_room', 0, 10)",
        (crew,),
    )
    assert pin(database, crew, card="C4")["reason"] == "card_not_held"
    move_clock(database, crew, 10)
    assert pin(database, crew, card="C4")["coinsPaid"] == 50
    assert pin(database, crew, uid="pin00002", card="C4") == {
        "status": "refused",
        "reason": "already_pinned",
    }
    assert database.execute(
        "select count(*) from public.case_actions where crew_id = %s", (crew,)
    ).fetchone() == (1,)


def test_n3_same_card_in_another_crew_is_stored_without_a_second_reward(database):
    for number in range(2):
        as_owner(database)
        crew = prepare(database)
        reply = pin(database, crew, uid=f"pin0000{number}")
        assert reply["coinsPaid"] == (50 if number == 0 else 0)
        assert database.execute(
            "select coins_rewarded from public.board_pins where crew_id = %s", (crew,)
        ).fetchone() == (reply["coinsPaid"],)
    assert database.execute(
        "select count(*), sum(delta) from public.wallet_transactions "
        "where player_id = %s and reason = 'clue_reward'",
        (PLAYERS[0],),
    ).fetchone() == (1, 50)


def test_n4_pair_needs_two_landed_cards_from_different_seats(database):
    crew = prepare(database)
    put_pin(database, crew, 1, "C1")
    assert pair(database, crew)["reason"] == "not_pinned"
    put_pin(database, crew, 1, "C2")
    assert pair(database, crew)["reason"] == "different_seats_required"
    put_pin(database, crew, 2, "C2", lands=10)
    assert pair(database, crew)["reason"] == "different_seats_required"
    move_clock(database, crew, 10)
    assert pair(database, crew)["status"] == "formed"


def test_n5_wrong_pair_wait_is_shared_and_expires_at_thirty_seconds(database):
    crew = prepare(database)
    put_pin(database, crew, 1, "C1")
    put_pin(database, crew, 2, "C2")
    wrong = pair(database, crew, deduction=None)
    assert wrong == {"status": "wrong_pair", "seconds": 30, "revision": 2}
    assert database.execute("select count(*) from public.case_deductions").fetchone() == (0,)
    assert database.execute("select count(*) from public.wallet_transactions").fetchone() == (0,)
    move_clock(database, crew, 29)
    assert pair(database, crew, uid="pair0002") == {
        "status": "refused",
        "reason": "pair_cooldown",
        "seconds": 1,
    }
    move_clock(database, crew, 30)
    assert pair(database, crew, uid="pair0003")["status"] == "formed"


def test_n6_reward_owners_include_pending_partner_orders_match_python_and_pay_once(database):
    from server.game.case_rewards import deduction_rewarded_players
    from server.game.case_snapshot import Pin
    from server.tests.case_rule_helpers import snapshot

    pins = (
        Pin(1, "C1", 0, 0, str(PLAYERS[0])),
        Pin(2, "C2", 0, 0, str(PLAYERS[1])),
        Pin(3, "C1", 90, 0, str(PLAYERS[2]), True),
        Pin(4, "C3", 0, 0, str(PLAYERS[3])),
    )
    expected = deduction_rewarded_players(replace(snapshot(), pins=pins), ("C1", "C2"), 0)
    for number in range(2):
        as_owner(database)
        crew = prepare(database)
        for item in reversed(pins):
            put_pin(
                database,
                crew,
                item.seat_no,
                item.card_id,
                player=item.pinned_by,
                lands=item.pinned_second,
            )
        result = pair(database, crew, uid=f"pair000{number}")
        assert result["status"] == "formed"
        assert result["payouts"] == [
            {"playerId": player, "paid": 200 if number == 0 else 0} for player in expected
        ]
        assert pair(database, crew, uid=f"dupe000{number}")["reason"] == "already_deduced"
    assert database.execute(
        "select player_id::text, sum(delta) from public.wallet_transactions "
        "where reason = 'mystery_reward' group by player_id order by player_id"
    ).fetchall() == [(player, 200) for player in expected]


def test_n7_night_prerequisite_boundaries_and_failed_night_preserves_posts(database):
    crew = prepare(database)
    assert nightfall(database, crew)["reason"] == "deduction_required"
    begin_night(database, crew)
    assert take_post(database, crew)["status"] == "done"
    for second, reason in ((1199, "night_in_progress"), (1200, "dawn_wait")):
        move_clock(database, crew, second)
        assert nightfall(database, crew, uid=f"night{second}")["reason"] == reason
    move_clock(database, crew, 1380)
    result = nightfall(database, crew, uid="night002")
    assert result["nightNo"] == 2
    assert result["endsSecond"] == 2580
    assert database.execute(
        "select count(*) from public.finale_posts where crew_id = %s and ended_second is null",
        (crew,),
    ).fetchone() == (1,)
    assert database.execute(
        "select count(*) from public.case_deductions where crew_id = %s", (crew,)
    ).fetchone() == (1,)


def test_n8_post_climb_lasts_sixty_seconds(database):
    crew = prepare(database)
    begin_night(database, crew)
    assert take_post(database, crew)["onPostSecond"] == 60
    move_clock(database, crew, 59)
    assert signal(database, crew)["reason"] == "post_not_ready"
    move_clock(database, crew, 60)
    assert signal(database, crew)["status"] == "locked"


def test_n9_other_player_cannot_aim_but_a_partner_can_be_aimed_by_any_player(database):
    crew = prepare(database, partner=True)
    begin_night(database, crew, player=PLAYERS[1])
    put_post(database, crew, 3, LIGHTS[0])
    put_post(database, crew, 1, LIGHTS[1], partner=True)
    assert signal(database, crew, seat=2)["reason"] == "post_not_owned"
    assert signal(database, crew, seat=2, light=LIGHTS[1])["status"] == "locked"


def test_n10_miss_is_recorded_and_relock_cooldown_expires_after_five_seconds(database):
    crew = prepare(database)
    begin_night(database, crew)
    put_post(database, crew, 1, LIGHTS[0])
    result = signal(database, crew, on_target=False)
    assert result == {"status": "off_target", "seconds": 5, "revision": 3}
    move_clock(database, crew, 4)
    assert signal(database, crew, uid="signal02") == {
        "status": "refused",
        "reason": "aim_cooldown",
        "seconds": 1,
    }
    move_clock(database, crew, 5)
    assert signal(database, crew, uid="signal03")["status"] == "locked"
    assert database.execute(
        "select on_target, holds_until_second from public.finale_signals "
        "where crew_id = %s order by id",
        (crew,),
    ).fetchall() == [(False, None), (True, 95)]


@pytest.mark.parametrize("last,parted", [(89, True), (90, False)])
def test_n11_three_seats_must_overlap_strictly_before_lock_expiry(database, last, parted):
    crew = prepare(database)
    begin_night(database, crew)
    for seat, second in enumerate((0, 45, last), 1):
        put_post(database, crew, seat, LIGHTS[seat - 1])
        move_clock(database, crew, second)
        result = signal(database, crew, seat=seat, light=LIGHTS[seat - 1], uid=f"signal0{seat}")
    assert result["parted"] is parted
    assert database.execute(
        "select schooner_found_second from public.case_state where crew_id = %s", (crew,)
    ).fetchone() == (last if parted else None,)
    assert database.execute(
        "select count(*) from public.finale_signals where crew_id = %s and parted", (crew,)
    ).fetchone() == (3 if parted else 0,)


def test_n12_moving_ends_a_lock_and_keeps_the_old_post_as_history(database):
    crew = prepare(database)
    begin_night(database, crew)
    put_post(database, crew, 1, LIGHTS[0])
    assert signal(database, crew)["status"] == "locked"
    move_clock(database, crew, 10)
    assert take_post(database, crew, light=LIGHTS[1])["status"] == "done"
    assert database.execute(
        "select light_id, ended_second from public.finale_posts where crew_id = %s order by id",
        (crew,),
    ).fetchall() == [(LIGHTS[0], 10), (LIGHTS[1], None)]
    assert database.execute(
        "select ended_second from public.finale_signals where crew_id = %s", (crew,)
    ).fetchone() == (10,)
    assert rpc(database, "finale_post_holds", crew, LIGHTS[0], 1) is False


def test_n13_a6_takeover_invalidates_partner_lock_and_frees_its_stale_post(database):
    crew = prepare(database, partner=True)
    begin_night(database, crew, player=PLAYERS[1])
    put_post(database, crew, 1, LIGHTS[0], partner=True)
    assert signal(database, crew, seat=2)["status"] == "locked"
    assert rpc(database, "finale_post_holds", crew, LIGHTS[0], 1) is True
    as_owner(database)
    database.execute(
        "update public.crew_seats set npc_id = null, player_id = %s "
        "where crew_id = %s and seat_no = 1",
        (PLAYERS[0], crew),
    )
    as_server(database)
    assert rpc(database, "finale_post_holds", crew, LIGHTS[0], 1) is False
    assert signal(database, crew, uid="signal02")["reason"] == "post_not_ready"
    move_clock(database, crew, 10)
    assert take_post(database, crew)["status"] == "done"
    assert database.execute(
        "select npc_id, ended_second from public.finale_posts where crew_id = %s order by id",
        (crew,),
    ).fetchall() == [("test_partner", 10), (None, None)]
    assert database.execute(
        "select ended_second from public.finale_signals where crew_id = %s", (crew,)
    ).fetchone() == (10,)


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_n14_players_have_no_table_sequence_or_function_access(database, role):
    import psycopg

    functions = database.execute(
        "select oid::regprocedure::text, prosecdef, proconfig from pg_proc "
        "where pronamespace = 'public'::regnamespace and proname = any(%s)",
        (list(FUNCTIONS),),
    ).fetchall()
    assert len(functions) == 7
    for name, definer, config in functions:
        assert definer is False
        assert config == ['search_path=""']
        assert database.execute(
            "select has_function_privilege(%s, %s, 'execute')", (role, name)
        ).fetchone() == (False,)
    for table in TABLES:
        assert database.execute(
            "select relrowsecurity from pg_class where oid = %s::regclass", (f"public.{table}",)
        ).fetchone() == (True,)
        assert database.execute(
            "select count(*) from pg_policies where schemaname = 'public' and tablename = %s",
            (table,),
        ).fetchone() == (0,)
        for right in ("select", "insert", "update", "delete", "truncate", "references", "trigger"):
            assert database.execute(
                "select has_table_privilege(%s, %s, %s)", (role, f"public.{table}", right)
            ).fetchone() == (False,)
    for table in TABLES[1:]:
        for right in ("select", "usage", "update"):
            assert database.execute(
                "select has_sequence_privilege(%s, %s, %s)",
                (role, f"public.{table}_id_seq", right),
            ).fetchone() == (False,)
    database.execute(f"set local role {role}")
    for table in TABLES:
        with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
            database.execute(f"select * from public.{table}")
    with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
        rpc(database, "board_pin", None, None, None, None, None, None)


def test_n14_service_can_only_append_or_end_history_and_has_no_sequence_rights(database):
    import psycopg

    crew = prepare(database)
    begin_night(database, crew)
    put_post(database, crew, 1, LIGHTS[0])
    signal(database, crew)
    for table in TABLES:
        with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
            database.execute(f"delete from public.{table} where crew_id = %s", (crew,))
    for table, column in (
        ("board_pins", "coins_rewarded"),
        ("finale_posts", "seat_no"),
        ("finale_signals", "bearing"),
    ):
        with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
            database.execute(
                f"update public.{table} set {column} = {column} where crew_id = %s", (crew,)
            )
    for table in TABLES[1:]:
        for right in ("select", "usage", "update"):
            assert database.execute(
                "select has_sequence_privilege('service_role', %s, %s)",
                (f"public.{table}_id_seq", right),
            ).fetchone() == (False,)


@pytest.mark.parametrize("seat,light", [(2, LIGHTS[0]), (1, LIGHTS[1])])
def test_n15_partial_uniques_reject_overlapping_duties_but_allow_ended_history(
    database, seat, light
):
    import psycopg

    crew = prepare(database)
    put_post(database, crew, 1, LIGHTS[0])
    with pytest.raises(psycopg.errors.UniqueViolation) as error, database.transaction():
        put_post(database, crew, seat, light)
    assert error.value.sqlstate == "23505"
    database.execute("update public.finale_posts set ended_second = 0 where crew_id = %s", (crew,))
    put_post(database, crew, seat, light)
    assert database.execute(
        "select count(*), count(*) filter (where ended_second is null) "
        "from public.finale_posts where crew_id = %s",
        (crew,),
    ).fetchone() == (2, 1)


def test_signal_relocks_end_the_previous_lock_without_counting_a_second_seat(database):
    crew = prepare(database)
    begin_night(database, crew)
    put_post(database, crew, 1, LIGHTS[0])
    for second in (0, 10, 20):
        move_clock(database, crew, second)
        assert signal(database, crew, uid=f"signal{second:02}")["parted"] is False
    assert database.execute(
        "select ended_second from public.finale_signals where crew_id = %s order by id", (crew,)
    ).fetchall() == [(10,), (20,), (None,)]


def test_repeat_keeps_receipts_and_never_pays_or_writes_twice(database):
    crew = prepare(database)
    pin(database, crew)
    result = pin(database, crew)
    assert result == {
        "status": "repeat",
        "crewId": str(crew),
        "kind": "pin",
        "target": "C2",
        "outcome": "pinned",
    }
    assert database.execute("select count(*) from public.wallet_transactions").fetchone() == (1,)
    assert database.execute("select count(*) from public.case_actions").fetchone() == (1,)
    assert database.execute(
        "select revision from public.case_state where crew_id = %s", (crew,)
    ).fetchone() == (2,)


@pytest.mark.parametrize("bearing", ["-1", "360", "10.01", "NaN", "Infinity", "-Infinity"])
def test_invalid_bearings_leave_no_aim_or_action_receipt(database, bearing):
    import psycopg

    crew = prepare(database)
    begin_night(database, crew)
    put_post(database, crew, 1, LIGHTS[0])
    with pytest.raises(psycopg.errors.RaiseException, match="bad_signal"), database.transaction():
        rpc(
            database,
            "finale_signal",
            crew,
            PLAYERS[0],
            "signal01",
            LIGHTS[0],
            Decimal(bearing),
            True,
            90,
            5,
            1200,
            3,
        )
    assert database.execute("select count(*) from public.finale_signals").fetchone() == (0,)
    assert database.execute(
        "select count(*) from public.case_actions where kind = 'signal'"
    ).fetchone() == (0,)


def test_migration_replaces_broad_default_grants_with_the_narrow_contract(database):
    # Supabase projects can grant new public objects broadly by default. Explicit revokes
    # must repair that state as well as the empty ACLs of the local stand-in schema.
    for table in TABLES:
        database.execute(f"grant all on public.{table} to anon, authenticated, service_role")
    for table in TABLES[1:]:
        database.execute(
            f"grant all on sequence public.{table}_id_seq to anon, authenticated, service_role"
        )
    database.execute(MIGRATION.read_text())
    for table in TABLES:
        for role in ("anon", "authenticated"):
            assert database.execute(
                "select has_table_privilege(%s, %s, 'select')", (role, f"public.{table}")
            ).fetchone() == (False,)
        assert database.execute(
            "select has_table_privilege('service_role', %s, 'delete')", (f"public.{table}",)
        ).fetchone() == (False,)
    for table in TABLES[1:]:
        assert database.execute(
            "select has_sequence_privilege('service_role', %s, 'usage')",
            (f"public.{table}_id_seq",),
        ).fetchone() == (False,)


def test_migration_parses_with_a_real_postgresql_parser():
    pglast = pytest.importorskip("pglast")
    assert len(pglast.parse_sql(Path(MIGRATION).read_text())) > 0
