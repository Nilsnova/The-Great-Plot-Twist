"""Synthetic populated islands for the isolated recovery rehearsal, using actual RPCs.

Financial holds/credits are explicit server-origin primitive fixtures, not market-feed gameplay.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import UUID

from server.island.catalogue import load_island, runtime_catalogue
from server.island.construction_rules import catalogue_manifest
from server.island.personal_captain import configuration
from tools.economy.recovery_manifest import RecoveryError

if TYPE_CHECKING:
    from psycopg import Connection


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise RecoveryError(reason)


def rpc(connection: Connection[Any], name: str, *arguments: object) -> dict[str, Any]:
    from psycopg import sql
    from psycopg.types.json import Jsonb

    query = sql.SQL("select public.{}({})").format(
        sql.Identifier(name), sql.SQL(",").join(sql.Placeholder() for _ in arguments)
    )
    values = tuple(Jsonb(value) if isinstance(value, dict) else value for value in arguments)
    return connection.execute(query, values).fetchone()[0]


def seed(connection: Connection[Any]) -> dict[str, Any]:
    owner, member, other = (UUID(int=51301), UUID(int=51302), UUID(int=51303))
    for player in (owner, member, other):
        connection.execute("insert into auth.users(id) values(%s)", (player,))
    connection.execute("set local role service_role")
    rpc(connection, "island_open", owner, "K7Q2M", 100)
    rpc(connection, "island_open", other, "M8P3N", 100)
    rpc(connection, "game_join", member, owner, 10)
    first = rpc(connection, "island_treasury_admit", owner, owner, "recovery_admit01", 200)
    second = rpc(connection, "island_treasury_admit", other, other, "recovery_other01", 200)
    origin = first["currentEconomy"]
    for player in (owner, member):
        profile = rpc(
            connection,
            "personal_captain_initialize",
            player,
            owner,
            origin["runEpoch"],
            configuration(load_island()),
        )
        require(
            profile.get("captain", {}).get("progressionVersion") == 1,
            "personal_initialization_failed",
        )
    built = rpc(
        connection,
        "island_economy_construct",
        owner,
        origin["accountId"],
        origin["runEpoch"],
        "recovery_build01",
        {
            "action": "build",
            "spot": "cannon_1",
            "kind": "cannon",
            "instanceId": None,
            "expectedLevel": 0,
            "quotedCoins": "30",
        },
        catalogue_manifest(runtime_catalogue(load_island())),
    )
    require(built.get("status") == "done", "populated_construction_failed")
    held = rpc(
        connection,
        "island_treasury_reserve",
        member,
        origin["accountId"],
        origin["runEpoch"],
        "recovery_hold01",
        "market_call_stake",
        "rehearsal:pending",
        50,
        0,
    )
    require(held.get("status") == "done", "pending_reservation_failed")
    connection.execute("reset role")
    return {
        "owner": owner,
        "member": member,
        "other": other,
        "initial": first,
        "otherInitial": second,
        "reservation": held,
    }


def settle_pending(connection: Connection[Any], fixture: dict[str, Any]) -> dict[str, Any]:
    connection.execute("set local role service_role")
    result = rpc(
        connection,
        "island_treasury_settle",
        fixture["reservation"]["receipt"]["id"],
        75,
        "rehearsal:confirmed-result",
        "recovery_settle01",
    )
    require(result.get("status") == "done", "origin_settlement_failed")
    origin = fixture["initial"]["currentEconomy"]
    require(
        result["receipt"]["accountId"] == origin["accountId"]
        and result["receipt"]["runEpoch"] == origin["runEpoch"],
        "origin_settlement_redirected",
    )
    require(
        result["currentEconomy"]["treasury"]
        == {"balanceCoins": "195", "committedCoins": "0", "availableCoins": "195"},
        "origin_settlement_money_wrong",
    )
    connection.execute("reset role")
    return result


def prove_replays(
    connection: Connection[Any], fixture: dict[str, Any], settlement: dict[str, Any]
) -> None:
    origin = fixture["initial"]["currentEconomy"]
    before_wallets = connection.execute(
        "select player_id,balance from public.wallets order by player_id"
    ).fetchall()
    other = fixture["otherInitial"]["currentEconomy"]["accountId"]
    other_before = connection.execute(
        "select balance_coins,committed_coins,revision from public.island_economy_accounts "
        "where id=%s",
        (other,),
    ).fetchone()
    repeated = settle_pending(connection, fixture)
    require(
        repeated["repeat"] and repeated["receipt"] == settlement["receipt"],
        "restored_settlement_replay_changed",
    )
    connection.execute("set local role service_role")
    again = rpc(
        connection,
        "island_treasury_admit",
        fixture["owner"],
        fixture["owner"],
        "recovery_admit01",
        200,
    )
    require(
        again["repeat"] and again["receipt"] == fixture["initial"]["receipt"],
        "restored_starting_grant_replayed",
    )
    refused = rpc(
        connection,
        "wave_start",
        fixture["owner"],
        "recovery_old_wave01",
        "island",
        fixture["owner"],
        42,
        0,
        0,
        900,
        50,
        "calm",
        1,
        0,
    )
    require(refused.get("reason") == "economy_context_required", "legacy_payout_fallback")
    connection.execute("reset role")
    require(
        connection.execute(
            "select player_id,balance from public.wallets order by player_id"
        ).fetchall()
        == before_wallets,
        "personal_wallet_changed",
    )
    require(
        connection.execute(
            "select balance_coins,committed_coins,revision "
            "from public.island_economy_accounts where id=%s",
            (other,),
        ).fetchone()
        == other_before,
        "other_account_changed",
    )
    require(
        connection.execute(
            "select count(*) from public.island_treasury_transactions "
            "where account_id=%s and reason='starting_coins'",
            (origin["accountId"],),
        ).fetchone()
        == (1,),
        "duplicate_starting_grant",
    )
