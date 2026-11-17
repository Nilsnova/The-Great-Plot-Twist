"""Exercise recovery API services, disposable SQL, and the production replay modules together."""

import json
import subprocess
import time
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
    balance,
    hp,
    instance,
    seed_recovery,
)
from server.tests.structure_recovery_pg import ScratchRecoveryAdmin  # noqa: E402

ROOT = Path(__file__).resolve().parents[4]

TOKENS = {
    "owner": str(OWNER),
    "member": str(MEMBER),
}
HEADERS = {name: {"Authorization": f"Bearer test.{name}.signature"} for name in TOKENS}


def test_accepted_bell_member_join_and_paid_repair_match_committed_state(database):
    epoch, _ = seed_recovery(database)
    as_server(database)
    database.execute(
        "update public.island_structure_health set rate_numerator=1, rate_denominator=1, "
        "settled_at=clock_timestamp()-interval '5 seconds' where island_owner=%s and spot='wall_1'",
        (OWNER,),
    )
    settings = replace(CONFIGURED_SETTINGS, flags=parse_flags("islands,structure_recovery"))

    def login(request: httpx.Request) -> httpx.Response:
        token = request.headers["authorization"].removeprefix("Bearer ")
        who = token.removeprefix("test.").removesuffix(".signature")
        player_id = TOKENS.get(who)
        if player_id is None:
            return httpx.Response(401, json={"message": "bad token"})
        return httpx.Response(200, json={"id": player_id, "is_anonymous": False})

    verifier = PlayerVerifier(
        settings,
        transport=httpx.MockTransport(login),
        clock=FakeClock(),
    )
    admin = ScratchRecoveryAdmin(database)
    app = create_app(
        settings,
        verifier,
        admin,
        weather_source=FakeWeather(CALM),
    )

    with TestClient(app) as client:
        state_response = client.get(
            f"/api/island/structures?code=ISLE-{ISLAND_CODE}", headers=HEADERS["member"]
        )
        assert state_response.status_code == 200, state_response.text
        before_bell_state = state_response.json()
        before_bell = before_bell_state["structures"][0]
        assert before_bell_state["repairWindow"] == "between_waves"
        assert before_bell["hpUnits"] > 500_000

        start_response = client.post(
            "/api/waves/start",
            headers=HEADERS["owner"],
            json={"where": "own", "actionUid": "bell-api-0001", "waveProtocol": 2},
        )
        assert start_response.status_code == 200, (
            f"{start_response.text}; local SQL error: {admin.last_database_error}"
        )
        started = start_response.json()
        wave_id = started["waveId"]
        assert started["recoveryVersion"] == 1
        assert started["waveProtocol"] == 2
        assert started["participantToken"]
        initial = started["initialSnapshot"]
        structure = initial["structures"][0]
        assert structure["spot"] == "wall_1"
        assert structure["hpUnits"] >= before_bell["hpUnits"]
        assert initial["waveId"] == wave_id

        # The teammate discovers the running wave before joining it (no token, no snapshot yet).
        joinable_response = client.get(
            f"/api/waves/current?where=ISLE-{ISLAND_CODE}&waveProtocol=2",
            headers=HEADERS["member"],
        )
        assert joinable_response.status_code == 200, joinable_response.text
        joinable = joinable_response.json()
        assert joinable["waveId"] == wave_id
        assert joinable["recoveryVersion"] == 1 and joinable["waveProtocol"] == 2
        assert "participantToken" not in joinable
        assert "initialSnapshot" not in joinable
        assert "lastActorCounter" not in joinable

        joined_response = client.post(
            "/api/waves/join",
            headers=HEADERS["member"],
            json={"waveId": wave_id, "waveProtocol": 2},
        )
        assert joined_response.status_code == 200, joined_response.text
        joined = joined_response.json()
        assert joined["waveId"] == wave_id
        assert joined["participantToken"]
        assert joined["initialSnapshot"] == initial

        current_response = client.get(
            f"/api/waves/current?where=ISLE-{ISLAND_CODE}&waveProtocol=2",
            headers=HEADERS["owner"],
        )
        assert current_response.status_code == 200, current_response.text
        current = current_response.json()
        assert current["waveId"] == wave_id
        assert current["participantToken"] == started["participantToken"]
        member_current = client.get(
            f"/api/waves/current?where=ISLE-{ISLAND_CODE}&waveProtocol=2",
            headers=HEADERS["member"],
        ).json()
        assert member_current["participantToken"] == joined["participantToken"]
        assert member_current["initialSnapshot"] == initial

        reserved_response = client.get(
            f"/api/island/structures?code=ISLE-{ISLAND_CODE}", headers=HEADERS["member"]
        )
        assert reserved_response.status_code == 200, reserved_response.text
        reserved_state = reserved_response.json()
        reserved_structure = reserved_state["structures"][0]
        assert reserved_state["displayPhase"] == "preparing"
        assert reserved_state["repairWindow"] == "reserved_wave"
        assert reserved_state["waveId"] == wave_id
        assert reserved_structure["hpUnits"] == structure["hpUnits"]

        time.sleep(1.05)
        paused_response = client.get(
            f"/api/island/structures?code=ISLE-{ISLAND_CODE}", headers=HEADERS["member"]
        )
        assert paused_response.status_code == 200, paused_response.text
        paused_structure = paused_response.json()["structures"][0]
        assert paused_structure["hpUnits"] == reserved_structure["hpUnits"]

        before = balance(database, MEMBER)
        repair_response = client.post(
            "/api/island/structures/repair",
            headers=HEADERS["member"],
            json={
                "code": f"ISLE-{ISLAND_CODE}",
                "spot": reserved_structure["spot"],
                "instanceId": reserved_structure["instanceId"],
                "actionUid": "api-repair-0001",
                "expectedEpoch": str(epoch),
                "expectedWindow": "reserved_wave",
                "expectedWaveId": wave_id,
                "expectedLevel": reserved_structure["level"],
                "expectedRepairSeq": reserved_structure["repairSeq"],
                "quotedPrice": reserved_structure["fixedPrice"],
                "waveProtocol": 2,
            },
        )
        assert repair_response.status_code == 200, repair_response.text
        body = repair_response.json()
        assert body["receipt"]["actionUid"] == "api-repair-0001"
        assert body["receipt"]["chargedPrice"] == 10
        assert body["receipt"]["balanceAtCommit"] == before - 10
        assert body["receipt"]["useOrdinal"] == 1
        assert body["receipt"]["waveId"] == wave_id
        assert body["coins"] == before - 10
        assert body["currentState"]["structures"][0]["hpUnits"] == 1_000_000

        repair_seq = body["receipt"]["repairSeq"]
        structure_id = body["receipt"]["instanceId"]
        unsealed_checkpoint_response = client.post(
            f"/api/waves/{wave_id}/health",
            headers=HEADERS["owner"],
            json={
                "waveProtocol": 2,
                "islandEpoch": str(epoch),
                "checkpointUid": "health-before-seal-01",
                "throughTick": 0,
                "inputHeadSeq": body["receipt"]["eventSeq"],
                "lastRepairSeq": repair_seq,
                "basisRepairSeq": {structure_id: repair_seq},
                "hpUnits": {structure_id: 1_000_000},
            },
        )
        assert unsealed_checkpoint_response.status_code == 409
        assert unsealed_checkpoint_response.json()["error"]["code"] == "health_sync_required"

        # Move the disposable run into its active replay window so the SQL server can seal ticks.
        as_owner(database)
        database.execute(
            "update public.wave_runs set starts_at=clock_timestamp()-interval '20 seconds' "
            "where id=%s",
            (wave_id,),
        )
        database.execute(
            "update public.island_recovery_state "
            "set starts_at=clock_timestamp()-interval '20 seconds', "
            "reserved_at=clock_timestamp()-interval '20 seconds' where island_owner=%s",
            (OWNER,),
        )
        as_server(database)
        active_response = client.get(
            f"/api/island/structures?code=ISLE-{ISLAND_CODE}", headers=HEADERS["member"]
        )
        assert active_response.status_code == 200, active_response.text
        active_state = active_response.json()
        assert active_state["displayPhase"] == "combat"
        assert active_state["repairWindow"] == "reserved_wave"
        assert (
            active_state["structures"][0]["hpUnits"]
            == body["currentState"]["structures"][0]["hpUnits"]
        )
        events_response = client.get(
            f"/api/waves/{wave_id}/events?after=0", headers=HEADERS["member"]
        )
        assert events_response.status_code == 200, events_response.text
        page = events_response.json()
        assert page["headSeq"] == len(page["events"]), page
        assert page["sealedThroughTick"] >= 0
        # A same-actor reload/lost response may restart from seq 0 after already opening a head.
        # It must be able to fetch that prefix again instead of being stranded by prior page state.
        reconnect_response = client.get(
            f"/api/waves/{wave_id}/events?after=0", headers=HEADERS["member"]
        )
        assert reconnect_response.status_code == 200, reconnect_response.text
        reconnect_page = reconnect_response.json()
        assert reconnect_page["headSeq"] == page["headSeq"]
        assert reconnect_page["sealedThroughTick"] >= page["sealedThroughTick"]
        assert reconnect_page["events"] == page["events"]
        page = reconnect_page
        appended_response = client.post(
            f"/api/waves/{wave_id}/inputs",
            headers=HEADERS["owner"],
            json={
                "waveProtocol": 2,
                "inputs": [
                    {
                        "inputUid": "reconnect-command-01",
                        "actorCounter": 1,
                        "tick": page["sealedThroughTick"],
                        "command": {"type": "captain_move", "x": 1, "z": 2},
                    }
                ],
            },
        )
        assert appended_response.status_code == 200, appended_response.text
        appended = appended_response.json()
        assert appended["headSeq"] == page["headSeq"] + 1
        fixed_response = client.get(
            f"/api/waves/{wave_id}/events?after=0&through={page['headSeq']}"
            f"&sealedThroughTick={page['sealedThroughTick']}",
            headers=HEADERS["member"],
        )
        assert fixed_response.status_code == 200, fixed_response.text
        fixed_page = fixed_response.json()
        assert fixed_page["headSeq"] == page["headSeq"]
        assert fixed_page["through"] == page["headSeq"]
        assert fixed_page["sealedThroughTick"] == page["sealedThroughTick"]
        assert fixed_page["events"] == page["events"]
        repair_events = [event for event in page["events"] if event["type"] == "structure_repaired"]
        assert len(repair_events) == 1, page
        assert repair_events[0]["serverSeq"] == body["receipt"]["eventSeq"]
        checkpoint_response = client.post(
            f"/api/waves/{wave_id}/health",
            headers=HEADERS["owner"],
            json={
                "waveProtocol": 2,
                "islandEpoch": str(epoch),
                "checkpointUid": "health-after-pay-01",
                "throughTick": page["sealedThroughTick"],
                "inputHeadSeq": page["headSeq"],
                "lastRepairSeq": repair_seq,
                "basisRepairSeq": {structure_id: repair_seq},
                "hpUnits": {structure_id: 1_000_000},
            },
        )
        assert checkpoint_response.status_code == 200, checkpoint_response.text

        replay_script = """
          import {readFileSync} from 'node:fs';
          import {
            createWaveReplay, createReplayDriver, fetchSealedEvents,
          } from './frontend/src/pirates/wave-replay.js';
          import {
            readRecoverySnapshot, recoveryWaveDefenses,
          } from './frontend/src/pirates/recovery-snapshot.js';
          const {page, snapshot, waveId} = JSON.parse(readFileSync(0, 'utf8'));
          const frozen = readRecoverySnapshot(snapshot, waveId);
          if (!frozen) throw new Error('snapshot rejected');
          const defenses = recoveryWaveDefenses(frozen);
          if (!defenses || defenses[0]?.hpUnits !== snapshot.structures[0]?.hpUnits) {
            throw new Error('snapshot defense health differs');
          }
          const clients = [];
          for (let index = 0; index < 2; index++) {
            const replay = createWaveReplay();
            const complete = await fetchSealedEvents(replay, async request => {
              if (request.after !== 0 || request.through !== undefined) return null;
              return page;
            });
            if (!complete || !replay.canAdvanceThrough(page.sealedThroughTick)) {
              throw new Error('incomplete replay');
            }
            const driver = createReplayDriver(replay);
            const observed = [];
            if (!driver.advanceThrough(page.sealedThroughTick, (tick, events) => {
              observed.push(...events.map(event => ({
                tick, event,
              })));
            })) throw new Error('replay did not advance');
            clients.push(observed);
          }
          if (JSON.stringify(clients[0]) !== JSON.stringify(clients[1])) {
            throw new Error('clients diverged');
          }
          process.stdout.write(JSON.stringify(clients[0]));
        """
        replay_result = subprocess.run(
            ["node", "--input-type=module", "--eval", replay_script],
            input=json.dumps({"page": page, "snapshot": initial, "waveId": wave_id}),
            capture_output=True,
            text=True,
            cwd=ROOT,
            check=False,
        )
        assert replay_result.returncode == 0, replay_result.stderr
        replayed = json.loads(replay_result.stdout)
        assert [entry["event"]["type"] for entry in replayed] == [
            "participant_joined",
            "structure_repaired",
        ]
        assert replayed[1]["event"]["serverSeq"] == body["receipt"]["eventSeq"]

        time.sleep(1.05)
        damage_page_response = client.get(
            f"/api/waves/{wave_id}/events?after={page['headSeq']}",
            headers=HEADERS["member"],
        )
        assert damage_page_response.status_code == 200, damage_page_response.text
        damage_page = damage_page_response.json()
        assert damage_page["headSeq"] == appended["headSeq"]
        assert damage_page["events"][-1]["serverSeq"] == appended["headSeq"]
        assert damage_page["events"][-1]["type"] == "captain_input"
        assert damage_page["sealedThroughTick"] > page["sealedThroughTick"]
        damage_response = client.post(
            f"/api/waves/{wave_id}/health",
            headers=HEADERS["owner"],
            json={
                "waveProtocol": 2,
                "islandEpoch": str(epoch),
                "checkpointUid": "health-after-damage-1",
                "throughTick": damage_page["sealedThroughTick"],
                "inputHeadSeq": damage_page["headSeq"],
                "lastRepairSeq": repair_seq,
                "basisRepairSeq": {structure_id: repair_seq},
                "hpUnits": {structure_id: 750_000},
            },
        )
        assert damage_response.status_code == 200, damage_response.text
        balance_after_repair = balance(database, MEMBER)
        retry_response = client.post(
            "/api/island/structures/repair",
            headers=HEADERS["member"],
            json={
                "code": f"ISLE-{ISLAND_CODE}",
                "spot": reserved_structure["spot"],
                "instanceId": structure_id,
                "actionUid": "api-repair-0001",
                "expectedEpoch": str(epoch),
                "expectedWindow": "reserved_wave",
                "expectedWaveId": wave_id,
                "expectedLevel": reserved_structure["level"],
                "expectedRepairSeq": reserved_structure["repairSeq"],
                "quotedPrice": reserved_structure["fixedPrice"],
                "waveProtocol": 2,
            },
        )
        assert retry_response.status_code == 200, retry_response.text
        retry = retry_response.json()
        assert retry["receipt"] == body["receipt"]
        assert retry["currentState"]["structures"][0]["hpUnits"] == 750_000
        assert retry["coins"] == balance_after_repair

        as_owner(database)
        database.execute(
            "update public.wave_runs set starts_at=clock_timestamp()-interval '20 seconds' "
            "where id=%s",
            (wave_id,),
        )
        database.execute(
            "update public.island_recovery_state "
            "set starts_at=clock_timestamp()-interval '20 seconds', "
            "reserved_at=clock_timestamp()-interval '20 seconds', "
            "expires_at=clock_timestamp()+interval '880 seconds' where island_owner=%s",
            (OWNER,),
        )
        as_server(database)
        finish_response = client.post(
            "/api/waves/finish",
            headers=HEADERS["owner"],
            json={
                "waveId": wave_id,
                "waveProtocol": 2,
                "survived": True,
                "shipsSunk": 1,
                "checkpoint": {
                    "islandEpoch": str(epoch),
                    "checkpointUid": "health-after-damage-1",
                    "throughTick": damage_page["sealedThroughTick"],
                    "inputHeadSeq": damage_page["headSeq"],
                    "lastRepairSeq": repair_seq,
                    "basisRepairSeq": {structure_id: repair_seq},
                    "hpUnits": {structure_id: 750_000},
                },
            },
        )
        assert finish_response.status_code == 200, finish_response.text
        finished = finish_response.json()
        assert finished["recovery"]["waveId"] == wave_id
        assert finished["recovery"]["closedHp"][structure_id] == 750_000

        between_response = client.get(
            f"/api/island/structures?code=ISLE-{ISLAND_CODE}", headers=HEADERS["member"]
        )
        assert between_response.status_code == 200, between_response.text
        between = between_response.json()
        assert between["repairWindow"] == "between_waves"
        assert between["remainingPaidUses"] is None
        hp_at_finish = between["structures"][0]["hpUnits"]
        time.sleep(1.05)
        resumed_response = client.get(
            f"/api/island/structures?code=ISLE-{ISLAND_CODE}", headers=HEADERS["member"]
        )
        assert resumed_response.status_code == 200, resumed_response.text
        resumed = resumed_response.json()
        assert resumed["structures"][0]["hpUnits"] > hp_at_finish

        # Saved v1 islands remain readable and can ring the next bell with admission off.
        client.app.state.settings = replace(settings, flags=parse_flags("islands"))
        next_start_response = client.post(
            "/api/waves/start",
            headers=HEADERS["owner"],
            json={"where": "own", "actionUid": "bell-api-0002", "waveProtocol": 2},
        )
        assert next_start_response.status_code == 200, (
            f"{next_start_response.text}; local SQL error: {admin.last_database_error}"
        )
        next_start = next_start_response.json()
        assert next_start["waveId"] != wave_id
        assert next_start["recoveryVersion"] == 1
        assert next_start["waveProtocol"] == 2
        next_state_response = client.get(
            f"/api/island/structures?code=ISLE-{ISLAND_CODE}", headers=HEADERS["member"]
        )
        assert next_state_response.status_code == 200, next_state_response.text
        next_state = next_state_response.json()
        assert next_state["remainingPaidUses"] == 3

        # A stale paid quote after expiry settles the wave but cannot charge or start healing early.
        expiring_structure = next_state["structures"][0]
        owner_balance_before_late_finish = balance(database, OWNER)
        member_balance_before_stale_quote = balance(database, MEMBER)
        as_owner(database)
        database.execute(
            "update public.wave_runs set starts_at=clock_timestamp()-interval '901 seconds' "
            "where id=%s",
            (next_start["waveId"],),
        )
        database.execute(
            "update public.island_recovery_state "
            "set starts_at=clock_timestamp()-interval '901 seconds', "
            "reserved_at=clock_timestamp()-interval '901 seconds', "
            "expires_at=clock_timestamp()-interval '1 second' where island_owner=%s",
            (OWNER,),
        )
        as_server(database)
        stale_quote_response = client.post(
            "/api/island/structures/repair",
            headers=HEADERS["member"],
            json={
                "code": f"ISLE-{ISLAND_CODE}",
                "spot": expiring_structure["spot"],
                "instanceId": expiring_structure["instanceId"],
                "actionUid": "expired-repair-01",
                "expectedEpoch": str(epoch),
                "expectedWindow": "reserved_wave",
                "expectedWaveId": next_start["waveId"],
                "expectedLevel": expiring_structure["level"],
                "expectedRepairSeq": expiring_structure["repairSeq"],
                "quotedPrice": expiring_structure["fixedPrice"],
                "waveProtocol": 2,
            },
        )
        assert stale_quote_response.status_code == 409, stale_quote_response.text
        assert stale_quote_response.json()["error"]["code"] == "stale_recovery_quote"
        assert balance(database, MEMBER) == member_balance_before_stale_quote
        assert database.execute(
            "select current_wave_id from public.island_recovery_state where island_owner=%s",
            (OWNER,),
        ).fetchone() == (None,)
        assert database.execute(
            "select closed_at is not null from public.recovery_wave_states where wave_id=%s",
            (next_start["waveId"],),
        ).fetchone() == (True,)

        expired_snapshot_structure = next_start["initialSnapshot"]["structures"][0]
        late_finish_response = client.post(
            "/api/waves/finish",
            headers=HEADERS["owner"],
            json={
                "waveId": next_start["waveId"],
                "waveProtocol": 2,
                "survived": True,
                "shipsSunk": 1,
                "checkpoint": {
                    "islandEpoch": next_start["initialSnapshot"]["islandEpoch"],
                    "checkpointUid": "expired-late-ck01",
                    "throughTick": 0,
                    "inputHeadSeq": 0,
                    "lastRepairSeq": 0,
                    "basisRepairSeq": {
                        expiring_structure["instanceId"]: expiring_structure["repairSeq"]
                    },
                    "hpUnits": {
                        expiring_structure["instanceId"]: expired_snapshot_structure["hpUnits"]
                    },
                },
            },
        )
        assert late_finish_response.status_code == 200, late_finish_response.text
        late_finish = late_finish_response.json()
        assert late_finish["loot"] == 0
        assert late_finish["coins"] == owner_balance_before_late_finish
        assert (
            late_finish["recovery"]["closedHp"][expiring_structure["instanceId"]]
            == (expired_snapshot_structure["hpUnits"])
        )
        assert balance(database, OWNER) == owner_balance_before_late_finish

    persisted_hp, persisted_repair_seq = hp(database)
    assert persisted_hp > 750_000
    assert persisted_repair_seq == 1
    assert balance(database, MEMBER) == before - 10
    assert database.execute(
        "select paid_used from public.recovery_wave_states where wave_id=%s", (wave_id,)
    ).fetchone() == (1,)
    assert database.execute(
        "select seq,event_kind from public.recovery_wave_events where wave_id=%s order by seq",
        (wave_id,),
    ).fetchall() == [
        (1, "participant_joined"),
        (2, "structure_repaired"),
        (3, "captain_input"),
    ]
    assert database.execute(
        "select instance_id from public.structure_repair_receipts "
        "where payer_id=%s and action_uid=%s",
        (MEMBER, "api-repair-0001"),
    ).fetchone() == (instance(database),)
