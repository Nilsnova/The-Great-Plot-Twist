"""Real SQL checks for 20261112080000_demolish.sql: tearing a building down between waves, with
half of what each payer paid back (docs/GAME-V3.md section 4.2).

Opt-in, like test_tech_hub_sql.py, on a disposable local PostgreSQL with every migration applied
twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end.
"""

import json
from uuid import UUID

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_game_rooms_sql import join, leave  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    add_players,
    as_owner,
    as_server,
    balance,
    build,
    call,
    finish,
    ledger,
    move_start,
    open_island,
    start,
)
from server.tests.island_sql.test_tower_defense_sql import coop_build  # noqa: E402

MEMBER = UUID(int=941)
OTHER = UUID(int=942)
STRANGER = UUID(int=943)
PRICES = {
    "wall": [10, 20, 40, 80, 160],
    "cannon": [30, 60, 120, 240, 480],
    "mortar": [60, 120, 240, 480, 960],
    "watchtower": [40, 80, 160, 320, 640],
    "house": [50, 100, 200],
}


def game(database):
    """OWNER hosts K7Q2M; MEMBER and OTHER joined it; STRANGER has an island of their own. Each
    holds 100 starting coins plus 400."""
    add_players(database, OWNER, MEMBER, OTHER, STRANGER)
    for player, code in (
        (OWNER, "K7Q2M"),
        (MEMBER, "M3MBR"),
        (OTHER, "QTHER"),
        (STRANGER, "STRNG"),
    ):
        open_island(database, player, code)
        coins(database, player, 400)
    assert join(database, MEMBER, OWNER)["status"] == "joined"
    assert join(database, OTHER, OWNER)["status"] == "joined"


def coins(database, player, amount, ref="test-coins"):
    as_owner(database)
    database.execute(
        "select public.apply_wallet_transaction(%s, %s, 'admin_adjust', %s)", (player, amount, ref)
    )


def upgrade(database, player, plot, uid, kind="cannon", owner=OWNER, unlocked=5):
    as_server(database)
    return call(
        database,
        "select public.island_upgrade(%s, %s, %s, %s, %s, %s)",
        player,
        owner,
        plot,
        uid,
        PRICES[kind],
        unlocked,
    )


def quote(database, player, plot, owner=OWNER):
    as_server(database)
    return call(
        database,
        "select public.island_demolish_quote(%s, %s, %s, %s::jsonb)",
        player,
        owner,
        plot,
        json.dumps(PRICES),
    )


def demolish(database, player, plot, uid, owner=OWNER):
    as_server(database)
    return call(
        database,
        "select public.island_demolish(%s, %s, %s, %s, %s::jsonb)",
        player,
        owner,
        plot,
        uid,
        json.dumps(PRICES),
    )


def split(answer):
    """{player: coins} of a quote or a tear-down."""
    return {UUID(item["playerId"]): item["coins"] for item in answer["refunds"]}


def standing(database, plot, owner=OWNER):
    as_owner(database)
    row = database.execute(
        "select building_type, level, spec from public.islet_buildings"
        " where player_id = %s and plot = %s",
        (owner, plot),
    ).fetchone()
    return row


def payments(database, plot, owner=OWNER):
    as_owner(database)
    return database.execute(
        "select level, payer, coins, refunded_by from public.building_payments"
        " where island_owner = %s and plot = %s order by paid_at, level",
        (owner, plot),
    ).fetchall()


def test_two_payers_each_get_half_of_what_they_paid_themselves(database):
    game(database)
    # MEMBER builds a cannon (30), OWNER pays level 2 (60), MEMBER level 3 (120).
    assert (
        coop_build(database, MEMBER, OWNER, "cannon_1", "cannon", "build-0001", 30)["status"]
        == "done"
    )
    assert upgrade(database, OWNER, "cannon_1", "up-00002")["level"] == 2
    assert upgrade(database, MEMBER, "cannon_1", "up-00003")["level"] == 3
    assert [(level, payer, paid) for level, payer, paid, _ in payments(database, "cannon_1")] == [
        (1, MEMBER, 30),
        (2, OWNER, 60),
        (3, MEMBER, 120),
    ]
    before = {player: balance(database, player) for player in (OWNER, MEMBER, OTHER)}

    offer = quote(database, OTHER, "cannon_1")
    assert (offer["status"], offer["kind"], offer["level"]) == ("quote", "cannon", 3)
    assert split(offer) == {MEMBER: 75, OWNER: 30}
    assert offer["refunds"][0]["paid"] == 150  # the biggest payer first

    done = demolish(database, OTHER, "cannon_1", "tear-0001")

    assert (done["status"], done["kind"], done["level"], done["repeat"]) == (
        "done", "cannon", 3, False,
    )  # fmt: skip
    assert split(done) == {MEMBER: 75, OWNER: 30}
    assert balance(database, MEMBER) == before[MEMBER] + 75
    assert balance(database, OWNER) == before[OWNER] + 30
    assert balance(database, OTHER) == before[OTHER]  # tore it down, paid nothing, gets nothing
    assert ledger(database, MEMBER, "building_refund") == [(75, "demolish:tear-0001")]
    assert ledger(database, OTHER, "building_refund") == []
    assert standing(database, "cannon_1") is None
    assert {refunded for *_, refunded in payments(database, "cannon_1")} == {"demolish:tear-0001"}


def test_a_building_from_before_the_migration_pays_the_host_half_its_catalogue_value(database):
    game(database)
    # A level-3 wall with no payment rows, as every building built before this migration.
    as_owner(database)
    database.execute(
        "insert into public.islets (player_id, timber) values (%s, 0) on conflict do nothing",
        (OWNER,),
    )
    database.execute(
        "insert into public.islet_buildings"
        " (player_id, plot, building_type, level, coins_paid, timber_paid, ref)"
        " values (%s, 'wall_3', 'wall', 3, 70, 0, 'island:legacy-01')",
        (OWNER,),
    )
    host = balance(database, OWNER)

    assert split(quote(database, MEMBER, "wall_3")) == {OWNER: 35}  # (10 + 20 + 40) / 2
    assert split(demolish(database, MEMBER, "wall_3", "tear-0002")) == {OWNER: 35}
    assert balance(database, OWNER) == host + 35


def test_old_levels_go_to_the_host_and_new_ones_to_their_payer(database):
    game(database)
    # The host's own build (islet_build writes no payment row): level 1 counts as the host's.
    build(database, OWNER, "wall_1", "wall", "island:own-00001", coins=10)
    upgrade(database, MEMBER, "wall_1", "up-00011", kind="wall")  # 20
    upgrade(database, MEMBER, "wall_1", "up-00012", kind="wall")  # 40

    # 60 // 2 and 10 // 2: half of what each paid, rounded down.
    assert split(quote(database, OWNER, "wall_1")) == {MEMBER: 30, OWNER: 5}


def test_a_repeated_click_pays_nothing_twice(database):
    game(database)
    coop_build(database, MEMBER, OWNER, "cannon_2", "cannon", "build-0021", 30)
    first = demolish(database, MEMBER, "cannon_2", "tear-0021")
    paid = balance(database, MEMBER)

    again = demolish(database, MEMBER, "cannon_2", "tear-0021")

    assert again["repeat"] is True
    assert split(again) == split(first) == {MEMBER: 15}
    assert balance(database, MEMBER) == paid
    assert ledger(database, MEMBER, "building_refund") == [(15, "demolish:tear-0021")]
    # Another click finds no building: refunded once.
    assert demolish(database, MEMBER, "cannon_2", "tear-0022") == {
        "status": "refused", "reason": "not_built",
    }  # fmt: skip


def test_nothing_comes_down_while_a_wave_runs_or_counts_down(database):
    game(database)
    coop_build(database, MEMBER, OWNER, "wall_2", "wall", "build-0031", 10)
    wave = start(database, OWNER, "bell-0031", owner=OWNER)
    refused = {"status": "refused", "reason": "wave_running"}

    assert demolish(database, MEMBER, "wall_2", "tear-0031") == refused  # the countdown
    move_start(database, wave["waveId"], 30)
    assert demolish(database, MEMBER, "wall_2", "tear-0032") == refused  # under way
    assert quote(database, MEMBER, "wall_2") == refused
    assert standing(database, "wall_2") == ("wall", 1, None)
    assert ledger(database, MEMBER, "building_refund") == []

    finish(database, OWNER, wave["waveId"])
    assert demolish(database, MEMBER, "wall_2", "tear-0033")["status"] == "done"


def test_only_a_member_of_the_game_tears_down(database):
    game(database)
    coop_build(database, MEMBER, OWNER, "wall_4", "wall", "build-0041", 10)
    refused = {"status": "refused", "reason": "not_member"}

    assert demolish(database, STRANGER, "wall_4", "tear-0041") == refused
    assert quote(database, STRANGER, "wall_4") == refused
    assert leave(database, OTHER, OWNER)["status"] == "left"
    assert demolish(database, OTHER, "wall_4", "tear-0042") == refused
    assert standing(database, "wall_4") == ("wall", 1, None)


def test_the_heart_and_the_home_islet_buildings_are_never_torn_down(database):
    game(database)
    build(database, OWNER, "islet_signal_station", "signal_station", "island:sig-00001", coins=10)
    refused = {"status": "refused", "reason": "protected"}

    for plot in (
        "cabin",
        "heart",
        "island_bell",
        "island_harbor",
        "islet_signal_station",
        "plot_2",
    ):
        assert demolish(database, OWNER, plot, f"tear-{plot[:10]}") == refused
        assert quote(database, OWNER, plot) == refused
    assert standing(database, "islet_signal_station") == ("signal_station", 1, None)
    assert demolish(database, OWNER, "wall_5", "tear-0051") == {
        "status": "refused", "reason": "not_built",
    }  # fmt: skip


def test_a_building_rebuilt_on_the_same_spot_starts_with_no_payments(database):
    game(database)
    coop_build(database, MEMBER, OWNER, "cannon_3", "cannon", "build-0061", 30)
    upgrade(database, MEMBER, "cannon_3", "up-00061")
    as_owner(database)
    database.execute(
        "update public.islet_buildings set spec = 'heavy'"
        " where player_id = %s and plot = 'cannon_3'",
        (OWNER,),
    )
    demolish(database, OWNER, "cannon_3", "tear-0061")

    # OTHER builds a mortar there now: only that payment counts, and the old skill is gone.
    coop_build(database, OTHER, OWNER, "cannon_3", "mortar", "build-0062", 60)
    assert standing(database, "cannon_3") == ("mortar", 1, None)
    assert split(quote(database, MEMBER, "cannon_3")) == {OTHER: 30}
    done = demolish(database, MEMBER, "cannon_3", "tear-0062")
    assert split(done) == {OTHER: 30}
    assert ledger(database, MEMBER, "building_refund") == [(45, "demolish:tear-0061")]


def test_a_bad_argument_is_a_server_bug(database):
    game(database)
    with pytest.raises(psycopg.errors.RaiseException, match="bad_demolish"):
        demolish(database, OWNER, "wall_1", "short")


@pytest.mark.parametrize("bad", [0, -5, 2.5, None, "10"])
def test_a_price_that_is_not_a_positive_whole_number_is_a_server_bug(database, bad):
    game(database)
    coop_build(database, MEMBER, OWNER, "wall_6", "wall", "build-0071", 10)
    prices = {**PRICES, "wall": [10, bad, 40, 80, 160]}
    as_server(database)
    for sql, arguments in (
        (
            "select public.island_demolish(%s, %s, %s, %s, %s)",
            (MEMBER, OWNER, "wall_6", "tear-0071"),
        ),
        ("select public.island_demolish_quote(%s, %s, %s, %s)", (MEMBER, OWNER, "wall_6")),
    ):
        database.execute("savepoint before_call")
        with pytest.raises(psycopg.errors.RaiseException, match="bad_demolish"):
            database.execute(sql, (*arguments, json.dumps(prices)))
        database.execute("rollback to savepoint before_call")
    assert standing(database, "wall_6") == ("wall", 1, None)
    assert ledger(database, MEMBER, "building_refund") == []


# The two checks below need a second connection: they stop the click at the island row lock, as a
# second player would, change the game, and let the click go on. The data is committed, so it is
# removed again by hand.
RACE_PLAYERS = (OWNER, MEMBER, OTHER, STRANGER)


def cleanup_committed(uri):
    with psycopg.connect(uri, autocommit=True) as clean:
        clean.execute("delete from auth.users where id = any(%s)", (list(RACE_PLAYERS),))


def click_blocked_at_the_island_lock(scratch_server, change):
    """Run a member's demolish of wall_7 while another transaction holds the island row, run
    `change(other_connection)` in that transaction, commit it, and return the click's answer."""
    import threading
    import time

    uri = scratch_server.get_uri()
    result = {}

    def click():
        with psycopg.connect(uri) as connection:
            as_server(connection)
            result["answer"] = call(
                connection,
                "select public.island_demolish(%s, %s, %s, %s, %s)",
                MEMBER,
                OWNER,
                "wall_7",
                "tear-0081",
                json.dumps(PRICES),
            )

    with psycopg.connect(uri) as setup, psycopg.connect(uri) as other:
        game(setup)
        coop_build(setup, MEMBER, OWNER, "wall_7", "wall", "build-0081", 10)
        setup.commit()
        other.execute("select 1 from public.islands where player_id = %s for update", (OWNER,))
        thread = threading.Thread(target=click)
        thread.start()
        for _ in range(100):  # wait until the click stands at the lock
            waiting = setup.execute("select count(*) from pg_locks where not granted").fetchone()[0]
            setup.commit()
            if waiting:
                break
            time.sleep(0.05)
        change(other)
        other.commit()
        thread.join(timeout=10)
        assert not thread.is_alive()
    return result["answer"]


def test_a_member_who_left_while_the_click_waited_is_refused(database, scratch_server):
    def leave_the_game(other):
        other.execute(
            "update public.island_members set left_at = now()"
            " where island_owner = %s and player_id = %s",
            (OWNER, MEMBER),
        )

    try:
        answer = click_blocked_at_the_island_lock(scratch_server, leave_the_game)
        assert answer == {"status": "refused", "reason": "not_member"}
        with psycopg.connect(scratch_server.get_uri()) as check:
            assert standing(check, "wall_7") == ("wall", 1, None)
            assert ledger(check, MEMBER, "building_refund") == []
    finally:
        cleanup_committed(scratch_server.get_uri())


def test_a_building_rebuilt_while_the_click_waited_answers_busy(database, scratch_server):
    def rebuild(other):
        other.execute(
            "delete from public.islet_buildings where player_id = %s and plot = 'wall_7'", (OWNER,)
        )
        other.execute(
            "insert into public.islet_buildings (player_id, plot, building_type, level, coins_paid,"
            " timber_paid, ref) values (%s, 'wall_7', 'wall', 1, 10, 0, 'island:build-0082')",
            (OWNER,),
        )

    try:
        answer = click_blocked_at_the_island_lock(scratch_server, rebuild)
        assert answer == {"status": "refused", "reason": "busy"}
        with psycopg.connect(scratch_server.get_uri()) as check:
            assert standing(check, "wall_7") == ("wall", 1, None)
            assert ledger(check, MEMBER, "building_refund") == []
    finally:
        cleanup_committed(scratch_server.get_uri())
