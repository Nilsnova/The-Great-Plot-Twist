"""Real SQL -> Python NativeWave -> production JavaScript decoder contract.

Uses disposable PostgreSQL and the actual canonical provider, not a DTO fixture.
Trusted legacy progression/timings come from the existing adapter setup. This is
cross-language domain composition, not authenticated rendered acceptance.
"""

import asyncio
import json
import shutil
import subprocess
from decimal import Decimal
from pathlib import Path
from uuid import UUID

import pytest

pytest.importorskip("psycopg")

from server.island import shared_session_api as api  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys  # noqa: E402
from server.tests.island_sql.test_shared_session_api_sql import SQLAdmin, room  # noqa: E402

ROOT = Path(__file__).resolve().parents[4]
DECODE = """
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readNativeWave} from './frontend/src/island/shared-wave-shapes.js';
const rows=JSON.parse(readFileSync(0,'utf8'));
for(const {label,dto,record} of rows){
 const decoded=readNativeWave(dto,record);
 assert.notEqual(decoded,null,`${label}: actual SQL/Python NativeWave must decode`);
 assert.deepEqual(decoded.initialSnapshot,dto.initialSnapshot,label);
 assert.equal(decoded.waveId,dto.waveId,label);
 assert.equal(decoded.historical,dto.historical,label);
 const contradictory={kind:'wrong_weather',label:'Wrong label',ships:9,fog:0.987654};
 for(const [field,value] of Object.entries(contradictory)){
  const altered=structuredClone(dto);altered.weather[field]=value;
  assert.equal(readNativeWave(altered,record),null,`${label}: contradictory ${field}`);
 }
 const altered=structuredClone(dto);altered.initialSnapshot.createWave.weatherKind='wrong_weather';
 assert.equal(readNativeWave(altered,record),null,`${label}: contradictory frozen kind`);
}
process.stdout.write(JSON.stringify({decoded:rows.map(row=>row.label)}));
"""


class DecoderAdmin(SQLAdmin):
    async def call_function(self, name, arguments):
        if name == "shared_session_wave_start":
            # PostgREST decodes JSON numbers using the RPC's declared numeric
            # types; psycopg floats otherwise select a double-precision overload.
            arguments = {**arguments, **{
                key: Decimal(str(arguments[key])) for key in ("p_weather_ships", "p_weather_fog")
            }}
        return await super().call_function(name, arguments)


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is required for the real decoder")
@pytest.mark.parametrize("weather_kind", ["calm", "storm"])
def test_actual_native_producer_decodes_fresh_replay_join_and_current(database, weather_kind):
    _, catalogue, owner, member, _, treasury, _, sessions = room(database)
    admin = DecoderAdmin(database)
    epoch = keys(treasury)[1]
    weather = next(row for row in catalogue.weather if row.kind == weather_kind)
    started = asyncio.run(api.start_wave(
        admin, catalogue, weather, str(owner), str(owner), epoch, sessions[owner], "1",
        "decoder_bell_001", rules=["structure_recovery"], snapshot_template=None,
    ))
    wave = UUID(started["waveId"])
    historical = asyncio.run(api.replay_wave_start(
        admin, str(owner), str(owner), epoch, "decoder_bell_001"
    ))
    joined = asyncio.run(api.join_wave(
        admin, str(member), wave, str(owner), epoch, sessions[member], "1"
    ))
    controlling = asyncio.run(api.current_wave(
        admin, str(owner), str(owner), session_id=sessions[owner], connection_generation="1"
    ))
    spectator = asyncio.run(api.current_wave(admin, str(member), str(owner)))
    # Freeze the actual producer placement that the old hand-shaped client
    # fixtures failed to represent. Do not add a synthetic weather.kind field.
    snapshot = started["initialSnapshot"]
    assert set(snapshot["weather"]) == {"ships", "fog"}
    assert snapshot["createWave"]["weatherKind"] == weather_kind
    assert historical["historical"] is True and historical["economy"] is None
    assert spectator["session"]["isSpectator"] and spectator["participantToken"] is None
    assert joined["participantToken"] != started["participantToken"]
    rows = []
    for label, dto, actor, controller in (
        ("fresh bell", started, owner, True),
        ("historical bell", historical, owner, True),
        ("member join", joined, member, True),
        ("controlling current", controlling, owner, True),
        ("spectator current", spectator, member, False),
    ):
        record = {"actorId": str(actor), "origin": snapshot["economy"]}
        if controller:
            record.update(sessionId=sessions[actor], connectionGeneration="1")
        rows.append({"label": label, "dto": dto, "record": record})

    result = subprocess.run(
        ["node", "--input-type=module", "--eval", DECODE],
        input=json.dumps(rows), capture_output=True, text=True, cwd=ROOT,
        timeout=30, check=False,
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {"decoded": [row["label"] for row in rows]}
