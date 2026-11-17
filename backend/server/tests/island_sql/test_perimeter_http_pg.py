"""Production perimeter HTTP against private Unix-socket SQL, never live credentials/network."""

import json
import subprocess
from dataclasses import replace
from pathlib import Path
from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient

pytest.importorskip("psycopg")
from server.app import create_app  # noqa: E402
from server.auth import PlayerVerifier  # noqa: E402
from server.flags import parse_flags  # noqa: E402
from server.tests.helpers import CONFIGURED_SETTINGS, FakeClock  # noqa: E402
from server.tests.island_helpers import CALM, FakeWeather  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    add_players,
    as_owner,
    balance,
    call,
    open_island,
)
from server.tests.structure_recovery_pg import ScratchRecoveryAdmin  # noqa: E402

ROOT = Path(__file__).resolve().parents[4]
OWNER, MEMBER = UUID(int=13801), UUID(int=13802)
CODE = "H7Q2M"
TOKENS = {"owner": str(OWNER), "member": str(MEMBER)}
HEADERS = {name: {"Authorization": f"Bearer test.{name}.signature"} for name in TOKENS}
FLAGS = "islands,placement,perimeter_walls,structure_recovery"
RING = json.loads(
    (Path(__file__).resolve().parent.parent / "fixtures/perimeter-ring.json").read_text()
)["cells"]


def seeded_client(database):
    add_players(database, OWNER, MEMBER)
    open_island(database, OWNER, CODE)
    open_island(database, MEMBER, "MBR29")
    as_owner(database)
    database.execute("update public.wallets set balance=5000 where player_id=%s", (OWNER,))
    database.execute(
        "update public.islands set wave_best=100,won_wave_best=100 where player_id=%s", (OWNER,)
    )
    database.execute(
        "insert into public.island_members(island_owner,player_id,role) values(%s,%s,'member')",
        (OWNER, MEMBER),
    )
    settings = replace(CONFIGURED_SETTINGS, flags=parse_flags(FLAGS))

    def login(request):
        who = (
            request.headers["authorization"].removeprefix("Bearer test.").removesuffix(".signature")
        )
        player = TOKENS.get(who)
        return (
            httpx.Response(200, json={"id": player, "is_anonymous": False})
            if player
            else httpx.Response(401)
        )

    verifier = PlayerVerifier(settings, transport=httpx.MockTransport(login), clock=FakeClock())
    admin = ScratchRecoveryAdmin(database)
    app = create_app(settings, verifier, admin, weather_source=FakeWeather(CALM))
    return TestClient(app), admin


def post(client, path, body, who="owner"):
    return client.post("/api/" + path, json=body, headers=HEADERS[who])


def accepted(response, admin):
    assert response.status_code == 200, f"{response.text}; scratch SQL: {admin.last_database_error}"
    return response.json()


def test_actual_http_buys_full_ring_then_freezes_the_first_public_perimeter_wave(database):
    client, admin = seeded_client(database)
    with client:
        enabled = accepted(post(client, "island/walls/enable", {}), admin)
        assert enabled["layout"]["wallCapacity"] == 128
        before = balance(database, OWNER)
        purchased, total = {}, 0
        for batch, first in enumerate(range(0, len(RING), 32)):
            cells = [{"x": x, "z": z} for x, z in RING[first : first + 32]]
            quote = accepted(post(client, "island/walls/quote", {"cells": cells}), admin)
            intent = {
                "placements": quote["placements"],
                "quotedTotal": quote["totalCost"],
                "islandEpoch": quote["islandEpoch"],
                "actionUid": f"http-ring-batch-{batch}",
            }
            built = accepted(post(client, "island/walls/build", intent), admin)
            assert built["receipt"]["placements"] == quote["placements"]
            assert built["receipt"]["repeat"] is False
            purchased.update({p["spot"]: (p["x"], p["z"]) for p in quote["placements"]})
            total += quote["totalCost"]
        assert len(purchased) == len(RING) == 102 and total == 1020
        assert "wall_13" in purchased and "wall_102" in purchased
        assert balance(database, OWNER) == before - total
        replay = accepted(post(client, "island/walls/build", intent), admin)
        assert replay["receipt"]["repeat"] is True and balance(database, OWNER) == before - total
        reloaded = accepted(client.get("/api/island", headers=HEADERS["owner"]), admin)
        assert {s["id"]: (s["x"], s["z"]) for s in reloaded["spots"] if s["built"]} == purchased
        assert (
            call(
                database,
                "select count(*) from public.building_payments where island_owner=%s",
                OWNER,
            )
            == 102
        )
        assert (
            call(
                database,
                "select count(*) from public.island_wall_build_receipts where payer=%s",
                OWNER,
            )
            == 4
        )

        # Pause new offers; owned geometry and the next supported wave remain available.
        client.app.state.settings = replace(
            client.app.state.settings, flags=parse_flags("islands,placement,structure_recovery")
        )
        denied = post(client, "island/walls/quote", {"cells": [{"x": 4, "z": -19.5}]})
        assert denied.status_code == 404 and denied.json()["error"]["code"] == "feature_off"
        moved = accepted(post(client, "island/move", {"spot": "wall_102", "x": 0, "z": -9}), admin)
        piece = next(s for s in moved["spots"] if s["id"] == "wall_102")
        assert (piece["x"], piece["z"]) == (0, -9)
        x, z = purchased["wall_102"]
        restored = accepted(
            post(client, "island/move", {"spot": "wall_102", "x": x, "z": z}), admin
        )
        assert {s["id"]: (s["x"], s["z"]) for s in restored["spots"] if s["built"]} == purchased
        assert balance(database, OWNER) == before - total  # Moving charges no new purchase.
        old = post(
            client,
            "waves/start",
            {"where": "own", "actionUid": "http-old-client", "waveProtocol": 2},
        )
        assert old.status_code == 409 and old.json()["error"]["code"] == "client_update_required"
        assert (
            call(database, "select count(*) from public.wave_runs where island_owner=%s", OWNER)
            == 0
        )
        started = accepted(
            post(
                client,
                "waves/start",
                {
                    "where": "own",
                    "actionUid": "http-supported-wave",
                    "waveProtocol": 2,
                    "wallClientVersion": 1,
                },
            ),
            admin,
        )
        initial = started["initialSnapshot"]
        assert initial["configVersion"] == 2 and initial["createWave"]["perimeterWalls"] is True
        assert "pathing" in started["rules"] and initial["createWave"]["pathing"] is True
        assert len(initial["structures"]) == 102
        assert {s["spot"]: (s["x"], s["z"]) for s in initial["structures"]} == purchased
        joined = accepted(
            post(
                client,
                "waves/join",
                {
                    "waveId": started["waveId"],
                    "waveProtocol": 2,
                },
                "member",
            ),
            admin,
        )
        current = accepted(
            client.get("/api/waves/current?where=own&waveProtocol=2", headers=HEADERS["owner"]),
            admin,
        )
        assert joined["waveId"] == current["waveId"] == started["waveId"]
        assert (
            joined["initialSnapshot"]["structures"]
            == current["initialSnapshot"]["structures"]
            == initial["structures"]
        )
        incompatible = post(client, "waves/join", {"waveId": started["waveId"]}, "member")
        assert incompatible.status_code == 409
        assert incompatible.json()["error"]["code"] == "client_update_required"
        health = accepted(client.get("/api/island/structures", headers=HEADERS["owner"]), admin)
        assert len(health["structures"]) == 102

        # Exercise the actual browser's pure decoder without another browser/QA platform.
        script = """
          import {readFileSync} from 'node:fs';
          import {readRecoverySnapshot,recoveryWaveDefenses}
            from './frontend/src/pirates/recovery-snapshot.js';
          import {createIslandApi,isStructureRecovery} from './frontend/src/island/api.js';
          const {snapshot,waveId,health}=JSON.parse(readFileSync(0,'utf8'));
          const frozen=readRecoverySnapshot(snapshot,waveId);
          if(!frozen)throw new Error('perimeter snapshot rejected');
          if(!isStructureRecovery(health))throw new Error('actual full health DTO rejected');
          const api=createIslandApi({transport:{
            get:async path=>{
              if(path!=='/api/island/structures')throw new Error('wrong health read path');
              return {ok:true,status:200,data:health};
            },
            post:async()=>{throw new Error('unexpected mutation during health read');},
          }});
          const read=await api.structureRecovery();
          if(!read.ok)throw new Error('actual full health read rejected');
          process.stdout.write(JSON.stringify({count:recoveryWaveDefenses(frozen)?.length,
            healthCount:read.data.structures.length}));
        """
        decoded = subprocess.run(
            ["node", "--input-type=module", "--eval", script],
            cwd=ROOT,
            input=json.dumps({"snapshot": initial, "waveId": started["waveId"], "health": health}),
            capture_output=True,
            text=True,
        )
        assert decoded.returncode == 0, decoded.stderr
        assert json.loads(decoded.stdout) == {"count": 102, "healthCount": 102}


def test_actual_double_reset_rejects_stale_quote_despite_identical_empty_layout(database):
    client, admin = seeded_client(database)
    with client:
        accepted(post(client, "island/walls/enable", {}), admin)
        accepted(
            post(
                client,
                "island/fresh-start",
                {
                    "confirmCode": f"ISLE-{CODE}",
                    "actionUid": "http-reset-first",
                },
            ),
            admin,
        )
        quote = accepted(
            post(client, "island/walls/quote", {"cells": [{"x": 4, "z": -19.5}]}), admin
        )
        accepted(
            post(
                client,
                "island/fresh-start",
                {
                    "confirmCode": f"ISLE-{CODE}",
                    "actionUid": "http-reset-second",
                },
            ),
            admin,
        )
        before = balance(database, OWNER)
        state = call(database, "select public.island_wall_layout_read(%s)", OWNER)
        assert state["rows"] == [] and state["islandEpoch"] != quote["islandEpoch"]
        refused = post(
            client,
            "island/walls/build",
            {
                "placements": quote["placements"],
                "quotedTotal": quote["totalCost"],
                "islandEpoch": quote["islandEpoch"],
                "actionUid": "http-stale-epoch",
            },
        )
        assert refused.status_code == 409 and refused.json()["error"]["code"] == "quote_changed"
        assert balance(database, OWNER) == before
        assert (
            call(
                database,
                "select count(*) from public.island_wall_build_receipts where payer=%s",
                OWNER,
            )
            == 0
        )
