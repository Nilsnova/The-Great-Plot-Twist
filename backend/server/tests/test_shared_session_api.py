"""Strict native transport checks; no fixture asserts runtime SQL authorization."""

import asyncio
from copy import deepcopy
from uuid import UUID

import pytest
from pydantic import ValidationError

from server.errors import ApiError
from server.island import shared_session_api as api
from server.island.shared_session_models import NativeWave, SessionData
from server.island.wave_recovery import RecoveryInput
from server.supabase_admin import SupabaseRejected

ACTOR = "11111111-1111-4111-8111-111111111111"
OWNER = "22222222-2222-4222-8222-222222222222"
EPOCH = "33333333-3333-4333-8333-333333333333"
ACCOUNT = "44444444-4444-4444-8444-444444444444"
SESSION = "55555555-5555-4555-8555-555555555555"
WAVE = "66666666-6666-4666-8666-666666666666"
TOKEN = "77777777-7777-4777-8777-777777777777"
NOW = "2026-11-18T12:00:00Z"
ORIGIN = dict(mode="island_shared", version=1, islandOwner=OWNER, accountId=ACCOUNT, runEpoch=EPOCH)


def economy():
    return {
        **ORIGIN,
        "revision": "1",
        "treasury": {
            "balanceCoins": "100",
            "committedCoins": "0",
            "availableCoins": "100",
        },
    }


def metadata(controller=True):
    return dict(
        sessionId=SESSION if controller else None,
        connectionGeneration="1" if controller else None,
        isController=controller,
        isSpectator=not controller,
        leaderId=ACTOR,
        graceUntil=None,
        place="isle_abc23_" + "a" * 24,
        topicGeneration="1",
        breakPaused=False,
        autoNext=False,
        countdownSeconds=10,
    )


def wave():
    return dict(
        status="started",
        waveId=WAVE,
        place="island",
        islandOwner=OWNER,
        wave=1,
        seed=42,
        startsAt=NOW,
        minimumSeconds=0,
        maximumSeconds=900,
        countdownSeconds=0,
        weather=dict(kind="calm", label="Calm", ships=1, fog=0),
        boss=False,
        flagship=False,
        rules=[],
        repeat=False,
        historical=False,
        recoveryVersion=1,
        waveProtocol=2,
        initialSnapshot=dict(
            economy=deepcopy(ORIGIN),
            waveId=WAVE,
            islandEpoch=EPOCH,
            weatherLabel="Calm",
            createWave={"boss": False},
            recoveryVersion=1,
            waveProtocol=2,
            wave=1,
            seed=42,
            startsAt=NOW,
            participants=[
                dict(participantToken=TOKEN, captain=dict(level=1, skills=[], weapon="musket"))
            ],
            rosterSize=1,
        ),
        participantToken=TOKEN,
        lastActorCounter=0,
        economy=economy(),
        session=metadata(),
        serverNow=NOW,
        closed=False,
    )


class Admin:
    def __init__(self, replies):
        self.replies, self.calls = list(replies), []

    async def call_function(self, name, arguments):
        self.calls.append((name, deepcopy(arguments)))
        assert self.replies, "Unexpected RPC"
        return self.replies.pop(0)


@pytest.mark.parametrize("change", ["both_roles", "hidden_proof", "half_proof"])
def test_spectator_and_controller_metadata_are_mutually_exclusive(change):
    value = metadata(False)
    if change == "both_roles":
        value["isController"] = True
        value.update(sessionId=SESSION, connectionGeneration="1")
    elif change == "hidden_proof":
        value.update(sessionId=SESSION, connectionGeneration="1")
    else:
        value["sessionId"] = SESSION
    with pytest.raises(ValidationError):
        SessionData.model_validate(value)


@pytest.mark.parametrize("field", ["accountId", "runEpoch"])
def test_immutable_snapshot_origin_ids_are_validated_even_without_fresh_projection(field):
    value = wave()
    value.update(
        historical=True,
        repeat=True,
        economy=None,
        session=None,
        participantToken=None,
        lastActorCounter=None,
    )
    value["initialSnapshot"]["economy"][field] = "not-an-id"
    with pytest.raises(ValidationError):
        NativeWave.model_validate(value)


def test_native_revival_input_is_refused_before_rpc():
    admin = Admin([dict(status="accepted", accepted=[], headSeq=0)])
    item = RecoveryInput(
        inputUid="input_001",
        actorCounter=1,
        tick=0,
        command=dict(type="captain_revive", targetId=TOKEN, x=0, z=0),
    )
    with pytest.raises(ApiError):
        asyncio.run(api.append_inputs(admin, ACTOR, WAVE, OWNER, EPOCH, SESSION, "1", [item]))
    assert admin.calls == []


def test_hold_start_validates_exact_uuid_payload_before_rpc():
    admin = Admin([dict(status="accepted", accepted=[], headSeq=0)])
    item = RecoveryInput(
        inputUid="input_001",
        actorCounter=1,
        tick=0,
        command=dict(type="captain_revive_hold_start", targetId=TOKEN, fallId="invalid", price=1),
    )
    with pytest.raises(ApiError):
        asyncio.run(api.append_inputs(admin, ACTOR, WAVE, OWNER, EPOCH, SESSION, "1", [item]))
    assert admin.calls == []


def test_supplied_spectator_proof_remains_nullable_for_event_reads():
    admin = Admin([dict(headSeq=0, sealedThroughTick=-1, through=0, events=[], closed=False)])
    result = asyncio.run(api.read_events(admin, ACTOR, UUID(WAVE), OWNER, EPOCH, None, None))
    assert result["events"] == []
    assert admin.calls[0][1]["p_session_id"] is None


def test_foreign_run_cannot_be_returned_as_start_replay():
    value = wave()
    value.update(
        historical=True,
        repeat=True,
        economy=None,
        session=None,
        participantToken=None,
        lastActorCounter=None,
    )
    value["initialSnapshot"]["economy"]["runEpoch"] = ACCOUNT
    admin = Admin([value])
    with pytest.raises(SupabaseRejected):
        asyncio.run(
            api.start_wave(
                admin, None, None, ACTOR, OWNER, EPOCH, SESSION, "1", "bell_001", rules=[]
            )
        )
    assert len(admin.calls) == 1


def historical_wave():
    value = wave()
    value.update(
        historical=True,
        repeat=True,
        economy=None,
        session=None,
        participantToken=None,
        lastActorCounter=None,
    )
    return value


def finish_row():
    fingerprint = dict(
        mode="island_shared",
        version=1,
        waveId=WAVE,
        accountId=ACCOUNT,
        runEpoch=EPOCH,
        playedWave=1,
        outcome="won",
        earnedBonuses=[],
    )
    completion = dict(
        id=TOKEN,
        playerId=ACTOR,
        waveId=WAVE,
        playedWave=1,
        outcome="won",
        confirmedParticipation=True,
        engineerCommitmentId=None,
        accountId=ACCOUNT,
        runEpoch=EPOCH,
        terminalFingerprint=fingerprint,
    )
    return dict(
        status="done",
        waveId=WAVE,
        outcome="won",
        repeat=True,
        origin=deepcopy(ORIGIN),
        completion=completion,
        economy=None,
        session=None,
    )


def test_owned_start_replay_precedes_catalogue_template_and_controller_work():
    admin = Admin([historical_wave()])
    answer = asyncio.run(
        api.start_wave(
            admin, None, None, ACTOR, OWNER, EPOCH, SESSION, "1", "saved_bell_001", rules=[]
        )
    )
    assert answer["waveId"] == WAVE and answer["economy"] is None
    assert [name for name, _ in admin.calls] == ["shared_session_wave_replay"]


@pytest.mark.parametrize("change", ["owner", "epoch", "wave", "session", "generation"])
def test_join_reply_cannot_substitute_requested_origin_or_controller(change):
    value = wave()
    if change == "owner":
        value["islandOwner"] = ACTOR
        value["initialSnapshot"]["economy"]["islandOwner"] = ACTOR
        value["economy"]["islandOwner"] = ACTOR
    elif change == "epoch":
        value["initialSnapshot"]["economy"]["runEpoch"] = ACCOUNT
        value["economy"]["runEpoch"] = ACCOUNT
    elif change == "wave":
        value["waveId"] = value["initialSnapshot"]["waveId"] = TOKEN
    elif change == "session":
        value["session"]["sessionId"] = TOKEN
    else:
        value["session"]["connectionGeneration"] = "2"
    with pytest.raises(SupabaseRejected):
        asyncio.run(api.join_wave(Admin([value]), ACTOR, UUID(WAVE), OWNER, EPOCH, SESSION, "1"))


def test_owned_completion_replay_returns_no_fresh_money_or_other_players():
    admin = Admin([finish_row()])
    answer = asyncio.run(
        api.finish_wave(
            admin,
            None,
            ACTOR,
            UUID(WAVE),
            OWNER,
            EPOCH,
            SESSION,
            "1",
            dict(survived=False, shipsSunk=0),
        )
    )
    assert answer["completion"]["playerId"] == ACTOR
    assert answer["economy"] is None and answer["session"] is None
    assert "completions" not in answer and "coins" not in answer
    assert admin.calls[0][0] == "shared_session_wave_finish"


@pytest.mark.parametrize("change", ["actor", "owner", "epoch", "account", "projection"])
def test_completion_response_is_bound_to_original_actor_wave_and_origin(change):
    value = finish_row()
    if change == "actor":
        value["completion"]["playerId"] = OWNER
    elif change == "owner":
        value["origin"]["islandOwner"] = ACTOR
    elif change == "epoch":
        value["origin"]["runEpoch"] = ACCOUNT
    elif change == "account":
        value["origin"]["accountId"] = TOKEN
    else:
        value.update(economy=economy(), session=metadata())
        value["economy"]["accountId"] = TOKEN
    with pytest.raises(SupabaseRejected):
        asyncio.run(
            api.finish_wave(
                Admin([value]),
                None,
                ACTOR,
                WAVE,
                OWNER,
                EPOCH,
                SESSION,
                "1",
                dict(survived=True, shipsSunk=7),
            )
        )


@pytest.mark.parametrize("change", ["unknown", "extra", "no_status"])
def test_unknown_or_malformed_database_refusals_fail_closed(change):
    value = {"status": "refused", "reason": "stale_controller"}
    if change == "unknown":
        value["reason"] = "do_something_else"
    elif change == "extra":
        value["authority"] = True
    else:
        value.pop("status")
    with pytest.raises(SupabaseRejected):
        asyncio.run(api.current_wave(Admin([value]), ACTOR, OWNER))


def test_session_read_preserves_required_spectator_null_fields():
    value = dict(status="done", economy=economy(), session=metadata(False))
    answer = asyncio.run(api.read_session(Admin([value]), ACTOR, OWNER, EPOCH))
    assert answer["session"]["sessionId"] is None
    assert answer["session"]["connectionGeneration"] is None


def test_public_replay_probe_returns_none_only_for_exact_new_reply():
    admin = Admin([{"status": "new"}])
    assert asyncio.run(api.replay_wave_start(admin, ACTOR, OWNER, EPOCH, "saved_bell_001")) is None
    assert admin.calls[0][0] == "shared_session_wave_replay"


@pytest.mark.parametrize(
    "value", [{"status": "new", "extra": True}, {}, {"status": "another_success"}]
)
def test_public_replay_probe_refuses_noncanonical_new_states(value):
    with pytest.raises(SupabaseRejected):
        asyncio.run(api.replay_wave_start(Admin([value]), ACTOR, OWNER, EPOCH, "saved_bell_001"))


def test_public_replay_probe_returns_only_owned_original_wave_without_current_authority():
    value = historical_wave()
    answer = asyncio.run(
        api.replay_wave_start(Admin([value]), ACTOR, OWNER, EPOCH, "saved_bell_001")
    )
    assert answer["historical"] is True and answer["economy"] is None and answer["session"] is None
