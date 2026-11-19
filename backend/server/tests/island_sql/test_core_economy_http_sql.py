"""Exact core HTTP intents and historical retries against actual domain SQL.

The isolated scratch database has no invented authority provider or admission route.
"""

import asyncio
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg import sql  # noqa: E402
from psycopg.types.json import Jsonb  # noqa: E402

from server.errors import ApiError  # noqa: E402
from server.island import economy_progression, shared_crew  # noqa: E402
from server.island.catalogue import load_island  # noqa: E402
from server.island.economy_http import shared_write  # noqa: E402
from server.island.economy_http_models import parse_shared_body  # noqa: E402
from server.island.shared_crew_rules import HireIntent  # noqa: E402
from server.island.shared_snapshot import snapshot_from_row  # noqa: E402
from server.island.treasury import EconomyContext  # noqa: E402
from server.supabase_admin import SupabaseRejected  # noqa: E402
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.economy_test_authority import authority_outage  # noqa: E402
from server.tests.island_sql.test_core_snapshot_sql import snapshot  # noqa: E402
from server.tests.island_sql.test_economy_progression_sql import (  # noqa: E402
    add_building,
    set_v1_policy,
    setup,
)
from server.tests.island_sql.test_island_treasury_sql import keys, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import as_server  # noqa: E402
from server.tests.island_sql.test_personal_captain_sql import initialized  # noqa: E402
from server.tests.island_sql.test_shared_construction_sql import construct, target  # noqa: E402

CATALOGUE = load_island()


class DatabaseAdmin:
    def __init__(self, connection):
        self.connection, self.calls = connection, []

    async def call_function(self, name, parameters):
        self.calls.append(name)
        named = sql.SQL(",").join(
            sql.SQL("{} => %s").format(sql.Identifier(key)) for key in parameters
        )
        statement = sql.SQL("select public.{}({})").format(sql.Identifier(name), named)
        values = [
            Jsonb(value) if isinstance(value, (dict, list)) else value
            for value in parameters.values()
        ]
        as_server(self.connection)
        try:
            with self.connection.transaction():
                return self.connection.execute(statement, values).fetchone()[0]
        except psycopg.errors.UndefinedFunction as error:
            raise SupabaseRejected() from error


def prepared(connection, owner):
    return snapshot_from_row(snapshot(connection, owner, owner), str(owner), str(owner), CATALOGUE)


def select_quote(value, group, **selector):
    offer = next(row for row in value["quotes"][group] if row["target"] == selector)
    assert offer["available"], offer
    return offer["intent"]


def test_new_shared_http_action_refuses_actual_missing_authority_without_claiming_or_charging(
    database,
):
    owner, _, _, initial, _ = initialized(database)
    view = prepared(database, owner)
    body = parse_shared_body(
        "build",
        {
            **select_quote(view, "build", spot="wall_1", kind="wall"),
            "economy": {
                key: view["economy"][key] for key in ("mode", "version", "islandOwner", "runEpoch")
            },
            "actionUid": "httpnew01",
        },
    )
    admin = DatabaseAdmin(database)
    with authority_outage(database):
        with pytest.raises(ApiError) as error:
            asyncio.run(shared_write(admin, str(owner), "build", body, CATALOGUE))
        assert error.value.code == "economy_path_unavailable"
        assert admin.calls == [
            "island_economy_operation_origin",
            "island_economy_context",
            "island_economy_authority",
        ]
        assert prepared(database, owner)["economy"] == view["economy"]
        assert rpc(
            database,
            "island_economy_operation_origin",
            owner,
            owner,
            keys(initial)[1],
            "httpnew01",
            "construction:build",
        ) == {"status": "new"}


def test_historical_http_retry_reaches_exact_domain_with_no_current_authority_provider(database):
    owner, _, _, initial, _ = initialized(database)
    view = prepared(database, owner)
    intent = select_quote(view, "build", spot="wall_1", kind="wall")
    first = construct(database, owner, initial, {"action": "build", **intent}, uid="httproot1")
    body = parse_shared_body(
        "build",
        {
            **intent,
            "actionUid": "httproot1",
            "economy": {
                key: view["economy"][key] for key in ("mode", "version", "islandOwner", "runEpoch")
            },
        },
    )
    admin = DatabaseAdmin(database)
    with authority_outage(database):
        replay = asyncio.run(shared_write(admin, str(owner), "build", body, CATALOGUE))
        assert replay["repeat"] is True and replay["receipt"] == first["receipt"]
        assert admin.calls == ["island_economy_operation_origin", "island_economy_construct"]


def test_research_tower_and_wreck_quotes_execute_actual_progression_transactions(database):
    owner, _, _, initial, _ = initialized(database)
    as_server(database)
    rpc(
        database,
        "island_treasury_credit",
        owner,
        *keys(initial),
        "sys_" + uuid4().hex + "_loot",
        "pirate_loot",
        "quote:fixture",
        10000,
    )
    built = construct(
        database,
        owner,
        initial,
        {
            "action": "build",
            "spot": "cannon_1",
            "kind": "cannon",
            "instanceId": None,
            "expectedLevel": 0,
            "quotedCoins": "27",
        },
    )
    for price in (54, 108, 216, 432):
        built = construct(database, owner, initial, target(built, "upgrade", str(price)))
        assert built["status"] == "done", built
    context = EconomyContext("island_shared", 1, str(owner), str(owner), *keys(initial), None)
    for group, action, selector in (
        ("research", "research", {"branch": "cannon", "tier": 1, "choice": None, "change": False}),
        ("towerSkill", "specialise", {"spot": "cannon_1", "spec": "rapid"}),
        ("towerTree", "tower_tree", {"spot": "cannon_1", "path": "a", "tier": 1}),
        ("wreck", "wreck", {"amount": 100}),
    ):
        view = prepared(database, owner)
        intent = select_quote(view, group, **selector)
        result = asyncio.run(
            economy_progression.mutate(
                DatabaseAdmin(database),
                CATALOGUE,
                context,
                uuid4().hex,
                {"action": action, **intent},
            )
        )
        assert result.status == "done" and result.receipt.action == action
        assert result.receipt.result.chargedCoins == intent["quotedCoins"]


def test_departed_crew_buyer_replays_original_http_receipt_without_current_counts(database):
    owner, member, _, initial, _ = initialized(database)
    context = EconomyContext("island_shared", 1, str(member), str(owner), *keys(initial), None)
    first = asyncio.run(
        shared_crew.hire(
            DatabaseAdmin(database), context, "crewhist1", HireIntent(crew="gunner"), CATALOGUE
        )
    )
    assert first["currentCrew"]["gunner"] == 1
    as_server(database)
    rpc(database, "game_leave", member, owner)
    body = parse_shared_body(
        "hire",
        {
            "crew": "gunner",
            "actionUid": "crewhist1",
            "economy": {
                "mode": "island_shared",
                "version": 1,
                "islandOwner": str(owner),
                "runEpoch": keys(initial)[1],
            },
        },
    )
    admin = DatabaseAdmin(database)
    replay = asyncio.run(shared_write(admin, str(member), "hire", body, CATALOGUE))
    assert replay["repeat"] is True and replay["receipt"] == first["receipt"]
    assert replay["currentEconomy"] is replay["currentCrew"] is replay["currentWaveBest"] is None
    assert admin.calls == ["island_economy_operation_origin", "island_economy_hire"]


@pytest.mark.parametrize(
    "kind,spot,action",
    [
        ("cannon", "cannon_8", "specialise"),
        ("cannon", "cannon_8", "tower_tree"),
        ("culverin", "cannon_1", "tower_tree"),
        ("culverin", "cannon_8", "tower_tree"),
    ],
)
def test_saved_gated_tower_quotes_execute_with_new_offers_disabled(database, kind, spot, action):
    owner, _, _, initial = setup(database)
    expected = add_building(database, owner, kind, 5, spot)
    if action == "specialise":
        database.execute(
            "insert into public.island_research"
            "(island_owner,branch,researched_by,coins_paid,ref) "
            "values(%s,'cannon',%s,180,'research:quote-gate')",
            (owner, owner),
        )
    set_v1_policy(database, owner, more=True)
    projected = prepared(database, owner)
    group = "towerSkill" if action == "specialise" else "towerTree"
    selector = (
        {"spot": spot, "spec": "rapid"}
        if action == "specialise"
        else {"spot": spot, "path": "a", "tier": 1}
    )
    intent = select_quote(projected, group, **selector)
    assert intent["expected"] == expected
    context = EconomyContext("island_shared", 1, str(owner), str(owner), *keys(initial), None)
    result = asyncio.run(
        economy_progression.mutate(
            DatabaseAdmin(database), CATALOGUE, context, uuid4().hex, {"action": action, **intent}
        )
    )
    assert result.receipt.result.chargedCoins == intent["quotedCoins"]
