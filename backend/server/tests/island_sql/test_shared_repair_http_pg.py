"""Real shared repair routes plus SQL; login and missing wave authority are explicit test fixtures.

Uses only disposable Unix-socket PostgreSQL. This proves the HTTP/transaction connection,
not a production sign-in, Captain provider, snapshot producer or live migration.
"""

import asyncio
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

psycopg = pytest.importorskip("psycopg")

from server.app import create_app  # noqa: E402
from server.auth import PlayerVerifier  # noqa: E402
from server.flags import parse_flags  # noqa: E402
from server.supabase_admin import SupabaseRejected  # noqa: E402
from server.tests.helpers import CONFIGURED_SETTINGS, FakeClock  # noqa: E402
from server.tests.island_helpers import CALM, FakeWeather  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import as_owner, rpc  # noqa: E402
from server.tests.island_sql.test_shared_combat_repairs_sql import body_for, seed  # noqa: E402
from server.tests.structure_recovery_pg import ScratchRecoveryAdmin  # noqa: E402


class SharedRepairAdmin(ScratchRecoveryAdmin):
    """Narrow real-SQL extension; arbitrary function/table names remain rejected."""

    def __init__(self, connection):
        super().__init__(connection)
        self.called = []
        self.tables = []

    async def call_function(self, name, parameters):
        self.called.append(name)
        if name in {
            "island_economy_authority",
            "island_shared_repair_replay",
            "island_shared_structure_repair",
        }:
            return await asyncio.to_thread(self._call, name, parameters)
        return await super().call_function(name, parameters)

    async def select_rows(self, table, query):
        self.tables.append(table)
        return await super().select_rows(table, query)


def test_member_shared_repair_uses_real_atomic_rpc_and_owned_replay_after_leaving(database):
    world = seed(database)
    as_owner(database)
    code = database.execute(
        "select code from public.islands where player_id=%s", (world.owner,)
    ).fetchone()[0]
    settings = replace(CONFIGURED_SETTINGS, flags=parse_flags("islands,structure_recovery"))

    def login(request):
        if request.headers.get("authorization") != "Bearer fixture.member.signature":
            return httpx.Response(401, json={"message": "not admitted"})
        return httpx.Response(200, json={"id": str(world.member), "is_anonymous": False})

    verifier = PlayerVerifier(settings, transport=httpx.MockTransport(login), clock=FakeClock())
    admin = SharedRepairAdmin(database)
    app = create_app(settings, verifier, admin, weather_source=FakeWeather(CALM))
    headers = {"Authorization": "Bearer fixture.member.signature", "X-Island-Economy-Version": "1"}
    body = body_for(world).model_dump(mode="json", by_alias=True, exclude_none=True)
    with TestClient(app) as client:
        before = client.get(f"/api/island/structures?code=ISLE-{code}", headers=headers)
        assert before.status_code == 200, before.text
        assert before.json()["economy"]["accountId"] == world.initial["currentEconomy"]["accountId"]
        assert "coins" not in before.json()
        paid = client.post("/api/island/structures/repair", headers=headers, json=body)
        assert paid.status_code == 200, paid.text
        data = paid.json()
        assert data["receipt"]["result"]["financialReceipt"]["balanceDelta"] == "-10"
        assert data["economy"]["treasury"]["availableCoins"] == "90"
        assert data["currentState"]["structures"][0]["hpUnits"] == 1_000_000
        assert "island_shared_structure_repair" in admin.called
        assert "island_structure_repair" not in admin.called
        assert "wallets" not in admin.tables
        assert "island_open" not in admin.called
        as_owner(database)
        rpc(database, "game_leave", world.member, world.owner)
        admin.called.clear()
        admin.tables.clear()
        again = client.post("/api/island/structures/repair", headers=headers, json=body)
        assert again.status_code == 200, again.text
        assert again.json() == {"receipt": data["receipt"], "repeat": True}
        assert admin.called == ["island_shared_repair_replay"]
        assert "wallets" not in admin.tables


def test_dedicated_scratch_adapter_keeps_unknown_rpc_rejection(database):
    admin = SharedRepairAdmin(database)
    with pytest.raises(SupabaseRejected):
        asyncio.run(admin.call_function("unregistered_financial_write", {}))
