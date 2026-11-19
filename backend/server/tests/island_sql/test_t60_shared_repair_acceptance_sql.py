"""Native bell -> two HTTP actors -> reconnect -> closed HP, on disposable PostgreSQL.

Only login verification and accepted damage reports are synthetic fixtures. The
actual persisted provider, producer, financial RPC and canonical close are used.
No source, frozen snapshot or journal row is overwritten to authorize a result.
"""

import time
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

pytest.importorskip("psycopg")

from server.app import create_app  # noqa: E402
from server.auth import PlayerVerifier  # noqa: E402
from server.flags import parse_flags  # noqa: E402
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.helpers import CONFIGURED_SETTINGS, FakeClock  # noqa: E402
from server.tests.island_helpers import CALM, FakeWeather  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, reconciles, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import as_owner, as_server  # noqa: E402
from server.tests.island_sql.test_shared_combat_native_sql import (  # noqa: E402
    damage,
    native_combat,
    repair_facts,
    wave_hp,
)
from server.tests.island_sql.test_shared_repair_http_pg import SharedRepairAdmin  # noqa: E402
from server.tests.island_sql.test_shared_session_close_sql import close  # noqa: E402
from server.tests.island_sql.test_shared_session_control_sql import attach  # noqa: E402


def client_for(database, world):
    actors = {str(actor): actor for actor in (world.owner, world.target)}

    def login(request):
        actor = (
            request.headers.get("authorization", "")
            .removeprefix("Bearer fixture.")
            .removesuffix(".signature")
        )
        return httpx.Response(
            200 if actor in actors else 401, json={"id": actor, "is_anonymous": False}
        )

    settings = replace(CONFIGURED_SETTINGS, flags=parse_flags("islands,structure_recovery"))
    verifier = PlayerVerifier(settings, transport=httpx.MockTransport(login), clock=FakeClock())
    app = create_app(
        settings, verifier, SharedRepairAdmin(database), weather_source=FakeWeather(CALM)
    )
    return TestClient(app)


def headers(actor):
    return {"Authorization": f"Bearer fixture.{actor}.signature", "X-Island-Economy-Version": "1"}


def body(world, uid, seq=0, price=10):
    return {
        "economy": {
            "mode": "island_shared",
            "version": 1,
            "islandOwner": str(world.owner),
            "runEpoch": keys(world.treasury)[1],
        },
        "spot": "wall_1",
        "instanceId": str(world.instance),
        "actionUid": uid,
        "expectedEpoch": world.snapshot["islandEpoch"],
        "expectedWindow": "reserved_wave",
        "expectedWaveId": str(world.wave),
        "expectedLevel": 1,
        "expectedRepairSeq": seq,
        "quotedPrice": price,
        "waveProtocol": 2,
    }


def state(client, database, world, actor):
    as_owner(database)
    code = database.execute(
        "select code from public.islands where player_id=%s", (world.owner,)
    ).fetchone()[0]
    answer = client.get(f"/api/island/structures?code=ISLE-{code}", headers=headers(actor))
    assert answer.status_code == 200, answer.text
    return answer.json()


@pytest.mark.parametrize("outcome", ["won", "lost", "expired", "abandoned"])
def test_two_http_actors_share_bell_quota_reconnect_replay_and_canonical_full_health(
    database, outcome
):
    world = native_combat(database, coins=40, countdown=3)
    original = body(world, "t60-first-repair")
    with client_for(database, world) as client:
        preparing = state(client, database, world, world.target)
        assert preparing["displayPhase"] == "preparing"
        assert preparing["remainingPaidUses"] == 3
        before = repair_facts(database, world)
        intact = client.post(
            "/api/island/structures/repair", headers=headers(world.owner), json=original
        )
        assert intact.status_code == 409 and intact.json()["error"]["code"] == "intact"
        assert repair_facts(database, world) == before
        # Let the real accepted countdown elapse; no clock or immutable snapshot edits.
        deadline = time.monotonic() + 5
        while state(client, database, world, world.owner)["displayPhase"] == "preparing":
            assert time.monotonic() < deadline
            time.sleep(0.05)
        seq = damage(database, world)
        wrong = client.post(
            "/api/island/structures/repair",
            headers=headers(world.target),
            json=body(world, "t60-stale-price", seq, price=9),
        )
        assert wrong.status_code == 409 and wrong.json()["error"]["code"] == "stale_recovery_quote"
        assert state(client, database, world, world.owner)["remainingPaidUses"] == 3
        original["expectedRepairSeq"] = seq
        first = client.post(
            "/api/island/structures/repair", headers=headers(world.owner), json=original
        )
        assert first.status_code == 200, first.text
        receipt = first.json()["receipt"]
        assert receipt["result"]["chargedPrice"] == "10"
        assert receipt["result"]["useOrdinal"] == 1
        seq = damage(database, world)
        repeated = client.post(
            "/api/island/structures/repair", headers=headers(world.owner), json=original
        )
        assert repeated.json() == {"receipt": receipt, "repeat": True}
        assert wave_hp(database, world) == 400000
        # A genuine controller-generation change preserves the same frozen wave and paid allowance.
        replacement = world.sessions[world.target]
        as_server(database)
        disconnected = rpc(
            database,
            "shared_session_disconnect",
            world.target,
            world.owner,
            keys(world.treasury)[1],
            replacement,
            1,
        )
        assert disconnected["status"] == "done", disconnected
        attached = attach(
            database, world.target, world.owner, world.treasury, replacement, generation=1
        )
        assert attached["status"] == "done", attached
        world.sessions[world.target] = replacement
        world.generations[world.target] = 2
        assert state(client, database, world, world.target)["remainingPaidUses"] == 2
        for ordinal, actor in [(2, world.target), (3, world.owner)]:
            paid = client.post(
                "/api/island/structures/repair",
                headers=headers(actor),
                json=body(world, f"t60-repair-{ordinal}", seq),
            )
            assert paid.status_code == 200, paid.text
            assert paid.json()["receipt"]["result"]["useOrdinal"] == ordinal
            seq = damage(database, world)
        before = repair_facts(database, world)
        refused = client.post(
            "/api/island/structures/repair",
            headers=headers(world.target),
            json=body(world, "t60-fourth-repair", seq),
        )
        assert (
            refused.status_code == 409 and refused.json()["error"]["code"] == "repair_limit_reached"
        )
        assert repair_facts(database, world) == before
        for actor in (world.owner, world.target):
            current = state(client, database, world, actor)
            assert current["remainingPaidUses"] == 0
            assert current["economy"]["treasury"]["availableCoins"] == "10"
            assert current["structures"][0]["hpUnits"] == 400000
        closed = close(database, {"waveId": str(world.wave)}, outcome)
        assert closed["status"] == "done", closed
        as_owner(database)
        closed_hp = database.execute(
            "select closed_hp from public.recovery_wave_states where wave_id=%s", (world.wave,)
        ).fetchone()[0]
        assert closed_hp[str(world.instance)] == 400000
        for actor in (world.owner, world.target):
            current = state(client, database, world, actor)
            assert current["displayPhase"] == "between_waves"
            assert current["remainingPaidUses"] is None
            assert current["structures"][0]["hpUnits"] == 1000000
            # The compatibility field spells an already-full structure's wait as zero.
            assert current["structures"][0]["estimatedFreeSeconds"] == 0
        as_owner(database)
        assert database.execute(
            "select closed_hp from public.recovery_wave_states where wave_id=%s", (world.wave,)
        ).fetchone()[0] == closed_hp
        assert client.post(
            "/api/island/structures/repair", headers=headers(world.owner), json=original
        ).json() == {"receipt": receipt, "repeat": True}
        reconciles(database, keys(world.treasury)[0])
