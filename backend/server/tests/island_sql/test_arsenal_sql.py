"""Real SQL checks for 20261114120000_arsenal.sql (T40, D042): the island arsenal's invariants.

Every copy is stored OR carried by exactly one captain; at most 20 are stored; buy, take (withdraw
or swap) and return are atomic and safe to repeat; a full rack refuses a return and loses nothing;
a captain who left keeps the copy until the sweep; the old personal weapons convert lazily.

Opt-in, on a disposable local PostgreSQL with every migration applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql/test_arsenal_sql.py

Most tests are one transaction, rolled back at the end. The concurrency tests need several
connections that see each other's commits: they use fresh random players on the same disposable
server, never a configured database.
"""

import random
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from server.island.arsenal_rules import CAPACITY  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    add_players,
    as_owner,
    as_server,
    balance,
    call,
    ledger,
    start,
)

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # pragma: allowlist secret
PRICE = 60  # pistols in islands.json; the price always comes from the server


def code() -> str:
    return "".join(random.choice(ALPHABET) for _ in range(5))


def island(database, player, coins=100000):
    """A player with an open island and `coins` coins (set by hand, outside the wallet rules)."""
    add_players(database, player)
    as_server(database)
    call(database, "select public.island_open(%s, %s, 100)", player, code())
    as_owner(database)
    database.execute("update public.wallets set balance = %s where player_id = %s", (coins, player))


def join(database, player, owner):
    as_server(database)
    return call(database, "select public.game_join(%s, %s, 10)", player, owner)


def leave(database, player, owner):
    as_server(database)
    return call(database, "select public.game_leave(%s, %s)", player, owner)


def buy(database, player, owner, uid, weapon="pistols", price=PRICE, wave=0):
    as_server(database)
    return call(
        database,
        "select public.arsenal_buy(%s, %s, %s, %s, %s, %s)",
        player,
        owner,
        weapon,
        uid,
        price,
        wave,
    )


def take(database, player, owner, copy, uid):
    as_server(database)
    return call(database, "select public.arsenal_take(%s, %s, %s, %s)", player, owner, copy, uid)


def give_back(database, player, owner, uid):
    as_server(database)
    return call(database, "select public.arsenal_return(%s, %s, %s)", player, owner, uid)


def state(database, player, owner):
    as_server(database)
    return call(database, "select public.arsenal_state(%s, %s)", player, owner)


def stored(database, owner):
    return call(
        database,
        "select count(*) from public.arsenal_copies where island_owner = %s and holder is null",
        owner,
    )


def holders(database, owner):
    rows = database.execute(
        "select holder from public.arsenal_copies where island_owner = %s and holder is not null",
        (owner,),
    ).fetchall()
    return [row[0] for row in rows]


def fill_rack(database, owner, count):
    """`count` stored copies: the owner buys them while carrying one already."""
    buy(database, owner, owner, "fill-hands")  # into the owner's hands
    for number in range(count):
        assert buy(database, owner, owner, f"fill-{number:04d}")["status"] == "done"


# --- the 20-slot rack: slots 19, 20 and 21 ---


def test_the_python_capacity_is_the_database_capacity(database):
    assert call(database, "select public.arsenal_capacity()") == CAPACITY == 20


def test_slot_19_and_20_fill_and_the_21st_stored_copy_is_refused_without_charging(database):
    owner = uuid4()
    island(database, owner)
    fill_rack(database, owner, 19)
    assert stored(database, owner) == 19
    assert buy(database, owner, owner, "slot-0020")["status"] == "done"
    assert stored(database, owner) == 20
    before = balance(database, owner)

    refused = buy(database, owner, owner, "slot-0021")

    assert refused == {"status": "refused", "reason": "arsenal_full"}
    assert stored(database, owner) == 20
    assert balance(database, owner) == before


def test_a_full_rack_still_sells_into_empty_hands(database):
    owner, friend = uuid4(), uuid4()
    island(database, owner)
    island(database, friend)
    join(database, friend, owner)
    fill_rack(database, owner, 20)

    done = buy(database, friend, owner, "hands-0001")

    assert done["status"] == "done"
    assert stored(database, owner) == 20
    assert done["arsenal"]["mine"] == done["copy"]


def test_the_database_itself_refuses_a_21st_stored_copy(database):
    owner = uuid4()
    island(database, owner)
    fill_rack(database, owner, 20)
    as_owner(database)
    database.execute(
        "insert into public.arsenal_copies (island_owner, copy_no, weapon, source)"
        " values (%s, 999, 'pistols', 'bought')",
        (owner,),
    )
    with pytest.raises(psycopg.errors.CheckViolation, match="arsenal_over_capacity"):
        database.execute("set constraints all immediate")


# --- exclusive possession ---


def test_a_copy_is_never_stored_and_carried_and_never_carried_twice(database):
    owner, friend = uuid4(), uuid4()
    island(database, owner)
    island(database, friend)
    join(database, friend, owner)
    copy = buy(database, owner, owner, "buy-0001")["copy"]  # in the owner's hands

    assert take(database, friend, owner, copy, "take-0001") == {
        "status": "refused",
        "reason": "taken",
    }
    as_owner(database)
    with pytest.raises(psycopg.errors.UniqueViolation):
        database.execute(
            "insert into public.arsenal_copies (island_owner, copy_no, weapon, holder, source)"
            " values (%s, 50, 'pistols', %s, 'bought')",
            (owner, owner),
        )


def test_copies_of_one_type_keep_their_own_identity_and_number(database):
    owner = uuid4()
    island(database, owner)
    first = buy(database, owner, owner, "same-0001")
    second = buy(database, owner, owner, "same-0002")

    copies = second["arsenal"]["copies"]
    assert first["copy"] != second["copy"]
    assert [(item["no"], item["weapon"]) for item in copies] == [(1, "pistols"), (2, "pistols")]
    assert copies[0]["holder"] == str(owner) and copies[1]["holder"] is None


def test_a_swap_needs_no_free_slot_and_keeps_the_rack_full(database):
    owner = uuid4()
    island(database, owner)
    fill_rack(database, owner, 20)
    carried = state(database, owner, owner)["arsenal"]["mine"]
    rack = [c for c in state(database, owner, owner)["arsenal"]["copies"] if c["holder"] is None]

    done = take(database, owner, owner, rack[0]["id"], "swap-0001")

    assert done["status"] == "done" and done["swapped"] == carried
    assert stored(database, owner) == 20
    assert holders(database, owner) == [owner]


# --- return, full storage and disconnects ---


def test_a_return_into_a_full_rack_is_refused_and_the_copy_stays_in_hand(database):
    owner = uuid4()
    island(database, owner)
    fill_rack(database, owner, 20)

    assert give_back(database, owner, owner, "back-0001") == {
        "status": "refused",
        "reason": "arsenal_full",
    }
    assert holders(database, owner) == [owner]
    assert stored(database, owner) == 20


def test_a_return_with_empty_hands_is_refused(database):
    owner = uuid4()
    island(database, owner)
    assert give_back(database, owner, owner, "back-0002")["reason"] == "nothing_held"


def test_a_departed_captain_keeps_the_copy_until_the_sweep_puts_it_back(database):
    owner, friend = uuid4(), uuid4()
    island(database, owner)
    island(database, friend)
    join(database, friend, owner)
    copy = buy(database, friend, owner, "away-0001")["copy"]
    leave(database, friend, owner)
    as_owner(database)
    assert holders(database, owner) == [friend]  # leaving alone moves nothing

    view = state(database, owner, owner)

    assert holders(database, owner) == []
    assert [c["id"] for c in view["arsenal"]["copies"]] == [copy]


def test_the_sweep_never_overfills_the_rack(database):
    owner, friend = uuid4(), uuid4()
    island(database, owner)
    island(database, friend)
    join(database, friend, owner)
    buy(database, friend, owner, "away-0002")
    fill_rack(database, owner, 20)
    leave(database, friend, owner)

    view = state(database, owner, owner)["arsenal"]

    assert stored(database, owner) == 20
    assert [c["away"] for c in view["copies"] if c["holder"] == str(friend)] == [True]


def test_a_reload_or_disconnect_changes_nothing(database):
    owner = uuid4()
    island(database, owner)
    copy = buy(database, owner, owner, "keep-0001")["copy"]
    assert state(database, owner, owner)["arsenal"]["mine"] == copy
    assert state(database, owner, owner)["arsenal"]["mine"] == copy


# --- repeats, permissions, waves, rollback ---


def test_a_repeated_buy_charges_once_and_makes_one_copy(database):
    owner = uuid4()
    island(database, owner, coins=1000)
    first = buy(database, owner, owner, "again-0001")
    second = buy(database, owner, owner, "again-0001")

    assert second["repeat"] is True and second["copy"] == first["copy"]
    assert balance(database, owner) == 1000 - PRICE
    assert ledger(database, owner, "weapon_purchase") == [(-PRICE, "arsenal:again-0001")]


def test_a_repeated_take_and_return_change_nothing(database):
    owner = uuid4()
    island(database, owner)
    copy = buy(database, owner, owner, "rep-0001")["copy"]
    assert give_back(database, owner, owner, "rep-0002")["repeat"] is False
    assert take(database, owner, owner, copy, "rep-0003")["repeat"] is False
    assert give_back(database, owner, owner, "rep-0002")["repeat"] is True
    assert holders(database, owner) == [owner]
    assert take(database, owner, owner, copy, "rep-0003")["repeat"] is True


def test_a_click_id_used_for_another_action_is_refused(database):
    owner = uuid4()
    island(database, owner)
    buy(database, owner, owner, "uid-00001")
    assert give_back(database, owner, owner, "uid-00001")["reason"] == "action_used"


def test_only_members_use_the_arsenal(database):
    owner, stranger = uuid4(), uuid4()
    island(database, owner)
    island(database, stranger)
    copy = buy(database, owner, owner, "own-00001")["copy"]
    give_back(database, owner, owner, "own-00002")

    assert state(database, stranger, owner)["reason"] == "not_member"
    assert buy(database, stranger, owner, "str-00001")["reason"] == "not_member"
    assert take(database, stranger, owner, copy, "str-00002")["reason"] == "not_member"


def test_no_move_while_a_wave_runs(database):
    owner = uuid4()
    island(database, owner)
    copy = buy(database, owner, owner, "wave-0001")["copy"]
    start(database, owner, "wave-start-1", "island", owner)

    assert give_back(database, owner, owner, "wave-0002")["reason"] == "wave_running"
    assert buy(database, owner, owner, "wave-0003")["reason"] == "wave_running"
    assert state(database, owner, owner)["arsenal"]["waveRunning"] is True
    assert holders(database, owner) == [owner] and copy


def test_too_few_coins_and_a_locked_type_change_nothing(database):
    owner = uuid4()
    island(database, owner, coins=10)
    assert buy(database, owner, owner, "poor-0001") == {
        "status": "refused",
        "reason": "insufficient_funds",
        "price": PRICE,
    }
    assert buy(database, owner, owner, "lock-0001", wave=6)["reason"] == "locked"
    assert state(database, owner, owner)["arsenal"]["copies"] == []
    assert balance(database, owner) == 10


def test_the_musket_is_never_a_copy(database):
    owner = uuid4()
    island(database, owner)
    with pytest.raises(psycopg.errors.RaiseException, match="bad_arsenal_buy"):
        buy(database, owner, owner, "musk-0001", weapon="musket")


# --- the old personal weapons ---


def test_applying_the_migration_converts_nobody_and_the_first_look_converts(database):
    owner = uuid4()
    island(database, owner)
    as_owner(database)
    database.execute(
        "update public.islands set weapons_owned = '{musket,pistols,long_rifle}',"
        " weapon_equipped = 'long_rifle' where player_id = %s",
        (owner,),
    )

    view = state(database, owner, owner)["arsenal"]
    again = state(database, owner, owner)["arsenal"]

    carried = [c["weapon"] for c in view["copies"] if c["holder"] == str(owner)]
    assert carried == ["long_rifle"] and view["stored"] == 1
    assert again["copies"] == view["copies"]
    row = database.execute(
        "select weapons_owned, weapon_equipped from public.islands where player_id = %s", (owner,)
    ).fetchone()
    assert row == (["musket"], "musket")


# --- concurrent requests, on committed data ---


class Committed:
    """Connections that see each other's commits, and the players they made (removed after)."""

    def __init__(self, uri):
        self.uri, self.opened, self.players = uri, [], []

    def __call__(self):
        connection = psycopg.connect(self.uri, autocommit=True)
        connection.execute("set lock_timeout = '10s'")
        self.opened.append(connection)
        return connection

    def island(self, coins=100000):
        player = uuid4()
        self.players.append(player)
        island(self(), player, coins)
        return player

    def clean_up(self):
        # Deleting the login removes the profile, the island, the wallet and the arsenal (cascade),
        # so the other SQL checks on this server see what they saw before.
        with psycopg.connect(self.uri, autocommit=True) as connection:
            for player in reversed(self.players):
                connection.execute("delete from public.islands where player_id = %s", (player,))
                connection.execute("delete from auth.users where id = %s", (player,))
        for connection in self.opened:
            connection.close()


@pytest.fixture
def connect(scratch_server):
    committed = Committed(scratch_server.get_uri())
    yield committed
    committed.clean_up()


def at_once(connect, calls):
    """Run each (function, arguments) on its own connection, released together."""
    barrier = Barrier(len(calls))

    def run(item):
        function, arguments = item
        connection = connect()
        barrier.wait()
        return function(connection, *arguments)

    with ThreadPoolExecutor(len(calls)) as pool:
        return list(pool.map(run, calls))


def committed_island(connect, coins=100000):
    return connect.island(coins)


def test_two_captains_claiming_one_copy_at_once_get_it_once(connect):
    owner = committed_island(connect)
    friends = [committed_island(connect) for _ in range(2)]
    for friend in friends:
        join(connect(), friend, owner)
    setup = connect()
    copy = buy(setup, owner, owner, f"c1-{uuid4().hex[:8]}")["copy"]
    give_back(setup, owner, owner, f"c2-{uuid4().hex[:8]}")

    answers = at_once(connect, [(take, (f, owner, copy, f"t-{uuid4().hex[:8]}")) for f in friends])

    assert sorted(a["status"] for a in answers) == ["done", "refused"]
    assert [a["reason"] for a in answers if a["status"] == "refused"] == ["taken"]
    assert len(holders(setup, owner)) == 1


def test_simultaneous_returns_into_the_last_free_slot_store_one(connect):
    owner = committed_island(connect)
    friends = [committed_island(connect) for _ in range(2)]
    setup = connect()
    for friend in friends:
        join(setup, friend, owner)
        buy(setup, friend, owner, f"h-{uuid4().hex[:8]}")  # into each friend's hands
    fill_rack(setup, owner, 19)

    answers = at_once(connect, [(give_back, (f, owner, f"r-{uuid4().hex[:8]}")) for f in friends])

    assert sorted(a["status"] for a in answers) == ["done", "refused"]
    assert [a["reason"] for a in answers if a["status"] == "refused"] == ["arsenal_full"]
    assert stored(setup, owner) == 20
    assert len(holders(setup, owner)) == 2  # the owner and the friend whose return was refused


def test_the_same_buy_sent_twice_at_once_charges_once(connect):
    owner = committed_island(connect, coins=1000)
    uid = f"dup-{uuid4().hex[:8]}"

    answers = at_once(connect, [(buy, (owner, owner, uid)), (buy, (owner, owner, uid))])

    assert sorted(a["repeat"] for a in answers) == [False, True]
    setup = connect()
    assert balance(setup, owner) == 1000 - PRICE
    assert len(state(setup, owner, owner)["arsenal"]["copies"]) == 1
