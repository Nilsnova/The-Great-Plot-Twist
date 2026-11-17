"""Two players through the real routes and the disposable SQL (integ/recovery-fixes).

One recovery-v1 island, its owner and a member, over HTTP (TestClient) into the scratch PostgreSQL:
  1. a late join after the seal moved: the owner's own replay (frontend wave-replay.js) still
     accepts the next round of pages, and both players finish (each with its own prefix);
  2. both players close the tab mid-wave: the next bell ends the abandoned wave and starts anew;
  3. the 900 s timeout: the seal stops at the last tick, late input is wave_over, the finish
     expires;
  4. a finish before the minimum answers 409 wave_too_early with Retry-After (not 502).
"""

import json
import subprocess
from dataclasses import replace
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

psycopg = pytest.importorskip("psycopg")

from server.app import create_app  # noqa: E402
from server.auth import PlayerVerifier  # noqa: E402
from server.flags import parse_flags  # noqa: E402
from server.tests.helpers import CONFIGURED_SETTINGS, FakeClock  # noqa: E402
from server.tests.island_helpers import CALM, FakeWeather  # noqa: E402
from server.tests.island_sql.test_structure_repair_sql import (  # noqa: E402
    ISLAND_CODE,
    MEMBER,
    OWNER,
    as_owner,
    as_server,
    seed_recovery,
)
from server.tests.structure_recovery_pg import ScratchRecoveryAdmin  # noqa: E402

ROOT = Path(__file__).resolve().parents[4]
TOKENS = {"owner": str(OWNER), "member": str(MEMBER)}
HEADERS = {name: {"Authorization": f"Bearer test.{name}.signature"} for name in TOKENS}
WHERE = f"ISLE-{ISLAND_CODE}"


def client_for(database):
    settings = replace(CONFIGURED_SETTINGS, flags=parse_flags("islands,structure_recovery"))

    def login(request: httpx.Request) -> httpx.Response:
        token = request.headers["authorization"].removeprefix("Bearer ")
        player_id = TOKENS.get(token.removeprefix("test.").removesuffix(".signature"))
        if player_id is None:
            return httpx.Response(401, json={"message": "bad token"})
        return httpx.Response(200, json={"id": player_id, "is_anonymous": False})

    verifier = PlayerVerifier(settings, transport=httpx.MockTransport(login), clock=FakeClock())
    admin = ScratchRecoveryAdmin(database)
    return TestClient(
        create_app(settings, verifier, admin, weather_source=FakeWeather(CALM))
    ), admin


def shift(database, wave_id, seconds, activity=None):
    """Put a wave `seconds` after its start (and its last journal read `activity` seconds ago)."""
    as_owner(database)
    database.execute(
        "update public.wave_runs set starts_at=clock_timestamp()-make_interval(secs=>%s) "
        "where id=%s",
        (seconds, wave_id),
    )
    database.execute(
        "update public.island_recovery_state "
        "set starts_at=clock_timestamp()-make_interval(secs=>%s),"
        "reserved_at=clock_timestamp()-make_interval(secs=>%s),"
        "expires_at=clock_timestamp()-make_interval(secs=>%s)+interval '900 seconds' "
        "where island_owner=%s and current_wave_id=%s",
        (seconds, seconds, seconds, OWNER, wave_id),
    )
    if activity is not None:
        database.execute(
            "update public.recovery_wave_states "
            "set last_activity_at=clock_timestamp()-make_interval(secs=>%s) where wave_id=%s",
            (activity, wave_id),
        )
    as_server(database)


def ring(client, admin, uid):
    response = client.post(
        "/api/waves/start",
        headers=HEADERS["owner"],
        json={"where": "own", "actionUid": uid, "waveProtocol": 2},
    )
    assert response.status_code == 200, f"{response.text}; {admin.last_database_error}"
    return response.json()


def join(client, wave_id):
    found = client.get(
        f"/api/waves/current?where={WHERE}&waveProtocol=2", headers=HEADERS["member"]
    )
    assert found.status_code == 200, found.text
    assert found.json()["waveId"] == wave_id
    response = client.post(
        "/api/waves/join", headers=HEADERS["member"], json={"waveId": wave_id, "waveProtocol": 2}
    )
    assert response.status_code == 200, response.text
    return response.json()


def page(client, who, wave_id, after=0):
    response = client.get(f"/api/waves/{wave_id}/events?after={after}", headers=HEADERS[who])
    assert response.status_code == 200, response.text
    return response.json()


def vector(started):
    rows = started["initialSnapshot"]["structures"]
    return (
        {row["instanceId"]: row["repairSeq"] for row in rows},
        {row["instanceId"]: row["hpUnits"] for row in rows},
    )


def finish(client, who, started, prefix, uid, survived=True):
    basis, hp = vector(started)
    return client.post(
        "/api/waves/finish",
        headers=HEADERS[who],
        json={
            "waveId": started["waveId"],
            "waveProtocol": 2,
            "survived": survived,
            "shipsSunk": 3,
            "checkpoint": {
                "islandEpoch": started["initialSnapshot"]["islandEpoch"],
                "checkpointUid": uid,
                "throughTick": max(0, prefix["sealedThroughTick"]),
                "inputHeadSeq": prefix["headSeq"],
                "lastRepairSeq": 0,
                "basisRepairSeq": basis,
                "hpUnits": hp,
            },
        },
    )


REPLAY = """
  import {readFileSync} from 'node:fs';
  import {createWaveReplay, fetchSealedEvents} from './frontend/src/pirates/wave-replay.js';
  const {pages} = JSON.parse(readFileSync(0, 'utf8'));
  const replay = createWaveReplay();
  const rounds = [];
  for (const page of pages) {
    rounds.push(await fetchSealedEvents(replay, async request => {
      if (request.through !== undefined || request.after !== (replay.headSeq ?? 0)) return null;
      return {...page, events: page.events.filter(event => event.serverSeq > request.after)};
    }));
  }
  process.stdout.write(JSON.stringify({rounds, head: replay.headSeq}));
"""


def test_two_players_late_join_both_finish_tab_closed_and_timeout(database):
    seed_recovery(database)
    client, admin = client_for(database)
    with client:
        # 1. A late join after the seal moved, then both finish with their own prefix.
        started = ring(client, admin, "twoplayer-01")
        wave_id = started["waveId"]
        shift(database, wave_id, 30)
        owner_first = page(client, "owner", wave_id)
        assert owner_first["sealedThroughTick"] > 0
        joined = join(client, wave_id)
        assert joined["participantToken"] != started["participantToken"]
        shift(database, wave_id, 31)
        owner_second = page(client, "owner", wave_id)
        joined_event = next(
            event for event in owner_second["events"] if event["type"] == "participant_joined"
        )
        assert joined_event["effectiveTick"] > owner_first["sealedThroughTick"]
        replayed = subprocess.run(
            ["node", "--input-type=module", "--eval", REPLAY],
            input=json.dumps({"pages": [owner_first, owner_second]}),
            capture_output=True,
            text=True,
            cwd=ROOT,
            check=False,
        )
        assert replayed.returncode == 0, replayed.stderr
        # Before the fix the second round was refused for good (the join sat at tick 0).
        assert json.loads(replayed.stdout)["rounds"] == [True, True]
        member_page = page(client, "member", wave_id)
        moved = client.post(
            f"/api/waves/{wave_id}/inputs",
            headers=HEADERS["member"],
            json={
                "waveProtocol": 2,
                "inputs": [
                    {
                        "inputUid": "member-move-01",
                        "actorCounter": 1,
                        "tick": member_page["sealedThroughTick"] + 1,
                        "command": {"type": "captain_move", "x": 1, "z": 2},
                    }
                ],
            },
        )
        assert moved.status_code == 200, moved.text
        # The owner finishes with the prefix it read, after the member moved seal and head.
        owner_done = finish(client, "owner", started, owner_second, "owner-close-01")
        assert owner_done.status_code == 200, f"{owner_done.text}; {admin.last_database_error}"
        member_after = page(client, "member", wave_id)
        assert member_after["sealedThroughTick"] >= owner_second["sealedThroughTick"]
        late_input = client.post(
            f"/api/waves/{wave_id}/inputs",
            headers=HEADERS["member"],
            json={
                "waveProtocol": 2,
                "inputs": [
                    {
                        "inputUid": "member-move-02",
                        "actorCounter": 2,
                        "tick": member_after["sealedThroughTick"] + 1,
                        "command": {"type": "captain_move", "x": 2, "z": 2},
                    }
                ],
            },
        )
        assert late_input.status_code == 409
        assert late_input.json()["error"]["code"] == "wave_over"
        member_done = finish(client, "member", joined, member_after, "member-close-1", False)
        assert member_done.status_code == 200, member_done.text
        assert member_done.json()["loot"] == owner_done.json()["loot"] > 0
        assert member_done.json()["recovery"] == owner_done.json()["recovery"]

        # 2. Both players close the tab: no journal read for over a minute.
        second = ring(client, admin, "twoplayer-02")
        join(client, second["waveId"])
        shift(database, second["waveId"], 120, activity=70)
        gone = client.get(
            f"/api/waves/current?where={WHERE}&waveProtocol=2", headers=HEADERS["member"]
        )
        assert gone.status_code == 200 and gone.json() is None
        third = ring(client, admin, "twoplayer-03")
        assert third["waveId"] != second["waveId"]
        assert database.execute(
            "select expired, survived from public.wave_runs where id=%s", (second["waveId"],)
        ).fetchone() == (True, False)
        stale = finish(
            client, "owner", second, {"sealedThroughTick": 0, "headSeq": 0}, "ab-close-01"
        )
        assert stale.status_code == 200, stale.text
        assert stale.json()["loot"] == 0

        # 3. The 900 s timeout.
        shift(database, third["waveId"], 905)
        timeout_page = page(client, "owner", third["waveId"])
        assert timeout_page["sealedThroughTick"] == 17999
        late = client.post(
            f"/api/waves/{third['waveId']}/inputs",
            headers=HEADERS["owner"],
            json={
                "waveProtocol": 2,
                "inputs": [
                    {
                        "inputUid": "after-timeout1",
                        "actorCounter": 1,
                        "tick": 17999,
                        "command": {"type": "captain_move", "x": 1, "z": 1},
                    }
                ],
            },
        )
        assert late.status_code == 409 and late.json()["error"]["code"] == "wave_over"
        expired = finish(client, "owner", third, timeout_page, "timeout-close")
        assert expired.status_code == 200, expired.text
        assert expired.json()["loot"] == 0

        # 4. Too early is a 409 with Retry-After, not a 502.
        fourth = ring(client, admin, "twoplayer-04")
        early = finish(
            client, "owner", fourth, {"sealedThroughTick": 0, "headSeq": 0}, "too-early-01"
        )
        assert early.status_code == 409, early.text
        assert early.json()["error"]["code"] == "wave_too_early"
        assert int(early.headers["retry-after"]) >= 1
