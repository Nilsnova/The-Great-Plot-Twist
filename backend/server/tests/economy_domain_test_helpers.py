"""Actual domain RPC calls for disposable SQL acceptance; authority remains injected.

No helper replaces a domain transaction or supplies production session authority.
"""

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from server.tests.economy_test_authority import configure_test_authority
from server.tests.island_sql.test_island_treasury_sql import (
    as_owner,
    as_server,
    keys,
    ready,
    rpc,
)


def prepare_domains(connection: Any, coins: int = 60) -> tuple:
    owner, member, outsider, initial = ready(connection, coins)
    as_owner(connection)
    for actor in (owner, member, outsider):
        configure_test_authority(connection, actor, owner)
    connection.execute(
        "update public.islands set wave_best=30,wreck_paid=500 where player_id=%s", (owner,)
    )
    return owner, member, outsider, initial


def buy_copy(connection: Any, actor: Any, initial: dict, uid: str, price: int = 60) -> dict:
    as_server(connection)
    return rpc(
        connection,
        "island_shared_arsenal_mutate",
        actor,
        initial["currentEconomy"]["islandOwner"],
        *keys(initial),
        uid,
        "buy",
        "pistols",
        None,
        None,
        price,
        0,
    )


def open_market_call(connection: Any, actor: Any, initial: dict, uid: str, stake: int = 60) -> dict:
    as_server(connection)
    moment = connection.execute("select clock_timestamp()").fetchone()[0].isoformat()
    evidence = {
        "asset": "harbor-trust",
        "price": "100",
        "source": "live",
        "fetchedAt": moment,
        "quotedAt": moment,
    }
    return rpc(
        connection,
        "island_wager_open",
        actor,
        initial["currentEconomy"]["islandOwner"],
        keys(initial)[1],
        uid,
        "market_call",
        "harbor-trust",
        "up",
        stake,
        Jsonb(evidence),
    )


def start_round(connection: Any, actor: Any, initial: dict, uid: str) -> dict:
    as_server(connection)
    return rpc(
        connection,
        "island_shared_boat_start",
        actor,
        initial["currentEconomy"]["islandOwner"],
        keys(initial)[1],
        "dash",
        uid,
    )


def claim_round(connection: Any, actor: Any, opened: dict, uid: str) -> dict:
    as_server(connection)
    source = opened["receipt"]["result"]["round"]
    return rpc(
        connection,
        "island_shared_boat_claim",
        actor,
        source["id"],
        source["runEpoch"],
        3,
        uid,
    )


def concurrent_calls(server: Any, actions: list[Callable[[Any], dict]]) -> list[dict]:
    """Run actual RPCs through distinct transactions with bounded lock/statement waits."""
    barrier = Barrier(len(actions))

    def run(action: Callable[[Any], dict]) -> dict:
        with psycopg.connect(server.get_uri()) as connection:
            connection.execute("set lock_timeout='5s'")
            connection.execute("set statement_timeout='10s'")
            barrier.wait(timeout=5)
            result = action(connection)
            connection.commit()
            return result

    with ThreadPoolExecutor(len(actions)) as pool:
        return list(pool.map(run, actions))
