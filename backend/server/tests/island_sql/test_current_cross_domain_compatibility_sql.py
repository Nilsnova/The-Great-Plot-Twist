"""Current canonical purchase/wager races and legacy fences on disposable SQL.

Auth identities, a fresh ten-coin admission and Harbor unlock are explicit setup.
The persistent authority is never replaced. Wager prices are trusted test inputs;
no clock, combat health or terminal outcome is modified.
"""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island, runtime_catalogue  # noqa: E402
from server.island.construction_rules import catalogue_manifest  # noqa: E402
from server.island.personal_captain import configuration  # noqa: E402
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    keys,
    ready,
    reconciles,
    rpc,
)
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_owner,
    as_server,
    start,
)


def prepared(connection):
    owner, member, outsider, initial = ready(connection, 10)
    as_owner(connection)
    connection.execute("update public.islands set wave_best=4 where player_id=%s", (owner,))
    as_server(connection)
    for actor in (owner, member):
        profile = rpc(
            connection,
            "personal_captain_initialize",
            actor,
            owner,
            keys(initial)[1],
            Jsonb(configuration(load_island())),
        )
        assert profile["captain"]["level"] == 1
    return owner, member, outsider, initial


def construct(connection, actor, initial, uid="compat_build_001"):
    as_server(connection)
    return rpc(
        connection,
        "island_economy_construct",
        actor,
        *keys(initial),
        uid,
        Jsonb(
            {
                "action": "build",
                "spot": "wall_1",
                "kind": "wall",
                "instanceId": None,
                "expectedLevel": 0,
                "quotedCoins": "10",
            }
        ),
        Jsonb(catalogue_manifest(runtime_catalogue(load_island()))),
    )


def wager(connection, actor, owner, initial, *, product="market_call"):
    as_server(connection)
    moment = connection.execute("select clock_timestamp()").fetchone()[0].isoformat()
    return rpc(
        connection,
        "island_wager_open",
        actor,
        owner,
        keys(initial)[1],
        "compat_wager_001",
        product,
        "harbor-trust",
        "up",
        10,
        Jsonb(
            {
                "asset": "harbor-trust",
                "price": "100",
                "source": "live",
                "fetchedAt": moment,
                "quotedAt": moment,
            }
        ),
    )


@pytest.mark.parametrize("construction_actor", ["owner", "member"])
def test_valid_purchase_and_wager_serialize_last_funds_with_real_authority(
    scratch_server, construction_actor
):
    with psycopg.connect(scratch_server.get_uri()) as setup:
        owner, member, _, initial = prepared(setup)
        wallets = setup.execute(
            "select player_id,balance from public.wallets order by player_id"
        ).fetchall()
    gate = Barrier(2)

    def perform(action):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            gate.wait(timeout=10)
            if action == "build":
                actor = owner if construction_actor == "owner" else member
                return construct(connection, actor, initial)
            return wager(connection, member, owner, initial)

    with ThreadPoolExecutor(2) as pool:
        built, opened = list(pool.map(perform, ["build", "wager"]))
    assert sorted(reply["status"] for reply in (built, opened)) == ["done", "refused"]
    with psycopg.connect(scratch_server.get_uri()) as check:
        as_owner(check)
        account = keys(initial)[0]
        balance, committed = check.execute(
            "select balance_coins,committed_coins from public.island_economy_accounts where id=%s",
            (account,),
        ).fetchone()
        assert (balance, committed) == ((0, 0) if built["status"] == "done" else (10, 10))
        assert (
            check.execute(
                "select player_id,balance from public.wallets order by player_id"
            ).fetchall()
            == wallets
        )
        reconciles(check, account)
        replay = (
            construct(check, owner if construction_actor == "owner" else member, initial)
            if built["status"] == "done"
            else wager(check, member, owner, initial)
        )
        winner = built if built["status"] == "done" else opened
        assert replay["repeat"] and replay["receipt"] == winner["receipt"]
        as_owner(check)
        reconciles(check, account)


def test_unsupported_shared_product_cannot_fall_back_to_a_private_wallet(database):
    owner, member, _, initial = prepared(database)
    as_owner(database)
    before = database.execute(
        "select player_id,balance from public.wallets order by player_id"
    ).fetchall()
    assert wager(database, member, owner, initial, product="exchange_position") == {
        "status": "refused",
        "reason": "path_unavailable",
    }
    as_owner(database)
    assert (
        database.execute(
            "select player_id,balance from public.wallets order by player_id"
        ).fetchall()
        == before
    )
    assert database.execute(
        "select balance_coins,committed_coins from public.island_economy_accounts where id=%s",
        (keys(initial)[0],),
    ).fetchone() == (10, 0)
    assert database.execute(
        "select count(*) from public.island_economy_operations where actor_id=%s and action_uid=%s",
        (member, "compat_wager_001"),
    ).fetchone() == (0,)


def test_shared_legacy_wave_entry_refuses_without_a_wave_or_personal_fallback(database):
    owner, _, _, initial = prepared(database)
    as_owner(database)
    before = database.execute(
        "select player_id,balance from public.wallets order by player_id"
    ).fetchall()
    as_server(database)
    assert start(database, owner, "compat_legacy_wave_001", owner=owner) == {
        "status": "refused",
        "reason": "economy_context_required",
    }
    as_owner(database)
    assert (
        database.execute(
            "select player_id,balance from public.wallets order by player_id"
        ).fetchall()
        == before
    )
    assert database.execute(
        "select count(*) from public.wave_runs where island_owner=%s", (owner,)
    ).fetchone() == (0,)
    reconciles(database, keys(initial)[0])
