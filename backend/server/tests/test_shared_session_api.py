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


@pytest.mark.parametrize(
    "value",
    [
        dict(reason="captain_context_required"),
        dict(status="done", reason="captain_context_required"),
        dict(status="refused", reason="captain_context_required", extra=True),
    ],
)
def test_malformed_prerequisite_refusal_never_initializes_a_captain(value):
    from server.island.shared_session_models import SessionAttach

    body = SessionAttach(
        economy={key: value for key, value in ORIGIN.items() if key != "accountId"},
        sessionId=SESSION,
        expectedGeneration="0",
        actionUid="attach_001",
    )
    admin = Admin([value])
    with pytest.raises(SupabaseRejected):
        asyncio.run(api.session_call(admin, ACTOR, "attach", body))
    assert len(admin.calls) == 1


def test_large_exact_connection_generation_does_not_fail_after_committed_attach():
    from server.island.shared_session_models import SessionAttach

    before, after = "9" * 5001, "1" + "0" * 5001
    body = SessionAttach(
        economy={key: value for key, value in ORIGIN.items() if key != "accountId"},
        sessionId=SESSION,
        expectedGeneration=before,
        actionUid="attach_001",
    )
    result = dict(status="done", economy=economy(), session=metadata())
    result["session"]["connectionGeneration"] = after
    admin = Admin([result])
    answer = asyncio.run(api.session_call(admin, ACTOR, "attach", body))
    assert answer["session"]["connectionGeneration"] == after
    assert admin.calls[0][1]["p_expected_generation"] == before


@pytest.mark.parametrize("extra", ["envelope", "money"])
def test_fresh_economy_projection_rejects_unknown_fields(extra):
    value = dict(status="done", economy=economy(), session=metadata(False))
    target = value["economy"] if extra == "envelope" else value["economy"]["treasury"]
    target["privateCoins"] = "5"
    with pytest.raises(SupabaseRejected):
        asyncio.run(api.read_session(Admin([value]), ACTOR, OWNER, EPOCH))


def captain_report():
    from server.island.shared_session_models import CaptainReport

    return CaptainReport.model_validate(
        dict(
            economy={key: value for key, value in ORIGIN.items() if key != "accountId"},
            sessionId=SESSION,
            connectionGeneration="1",
            waveProtocol=2,
            checkpointUid="captains_001",
            throughTick=10,
            inputHeadSeq=2,
            captains={TOKEN: dict(hpUnits=0, downAtTick=7, reviveBasisSeq=0)},
        )
    )


def captain_reply():
    return dict(
        accepted=True,
        repeated=False,
        throughTick=10,
        inputHeadSeq=2,
        captains={TOKEN: dict(hpUnits=0, downAtTick=7, reviveBasisSeq=0, fallId=SESSION)},
    )


def test_captain_checkpoint_keeps_actual_server_fall_nonce_and_exact_controller_source():
    admin = Admin([captain_reply()])
    answer = asyncio.run(
        api.report_captains(admin, ACTOR, WAVE, OWNER, EPOCH, SESSION, "1", captain_report())
    )
    assert answer["captains"][TOKEN]["fallId"] == SESSION
    name, args = admin.calls[0]
    assert name == "shared_session_wave_captains"
    assert set(args["p_report"]) == {"checkpointUid", "throughTick", "inputHeadSeq", "captains"}
    assert "fallId" not in args["p_report"]["captains"][TOKEN]


@pytest.mark.parametrize("change", ["accepted", "fall", "token", "hp", "prefix"])
def test_captain_checkpoint_response_cannot_substitute_prefix_or_reported_state(change):
    value = captain_reply()
    if change == "accepted":
        value["accepted"] = 1
    elif change == "fall":
        value["captains"][TOKEN]["fallId"] = None
    elif change == "token":
        value["captains"][OWNER] = value["captains"].pop(TOKEN)
    elif change == "hp":
        value["captains"][TOKEN]["downAtTick"] = 8
    else:
        value["throughTick"] = 11
    with pytest.raises(SupabaseRejected):
        asyncio.run(
            api.report_captains(
                Admin([value]), ACTOR, WAVE, OWNER, EPOCH, SESSION, "1", captain_report()
            )
        )


@pytest.mark.parametrize(
    "reason",
    [
        "input_tick_ahead",
        "page_watermark_invalid",
        "page_incomplete",
        "captain_hp_increase",
        "captain_down",
    ],
)
def test_known_native_refusals_remain_explicit_without_legacy_fallback(reason):
    with pytest.raises(ApiError) as error:
        api.checked({"status": "refused", "reason": reason})
    assert error.value.status_code == 409 and error.value.code == reason


def test_too_early_preserves_the_trusted_retry_after_delay():
    with pytest.raises(ApiError) as error:
        api.checked({"status": "refused", "reason": "too_early", "waitSeconds": 3})
    assert error.value.code == "wave_too_early" and error.value.headers == {"Retry-After": "3"}


@pytest.mark.parametrize("wait", [True, "3", 0, -1, 86401])
def test_malformed_native_retry_delay_is_not_interpreted_as_authority(wait):
    with pytest.raises(SupabaseRejected):
        api.checked({"status": "refused", "reason": "too_early", "waitSeconds": wait})


def test_native_away_command_is_not_a_disconnect_authority():
    admin = Admin([])
    item = RecoveryInput(
        inputUid="input_001",
        actorCounter=1,
        tick=0,
        command=dict(type="captain_move", x=0, z=0, away=True),
    )
    with pytest.raises(ApiError):
        asyncio.run(api.append_inputs(admin, ACTOR, WAVE, OWNER, EPOCH, SESSION, "1", [item]))
    assert admin.calls == []


def withdrawal_event():
    return dict(
        serverSeq=1,
        effectiveTick=10,
        type="captain_withdrawn",
        participantToken=TOKEN,
        payload=dict(participantToken=TOKEN, reason="disconnect_expired"),
    )


def test_native_journal_accepts_only_server_bound_withdrawal_identity():
    event = withdrawal_event()
    result = asyncio.run(
        api.read_events(
            Admin([dict(headSeq=1, sealedThroughTick=9, through=1, events=[event], closed=False)]),
            ACTOR,
            WAVE,
            OWNER,
            EPOCH,
            None,
            None,
        )
    )
    assert result["events"] == [event]


@pytest.mark.parametrize("change", ["token", "missing_outer", "client_counter", "reason", "actor"])
def test_native_journal_rejects_malformed_withdrawal_authority(change):
    event = withdrawal_event()
    if change == "token":
        event["payload"]["participantToken"] = OWNER
    elif change == "missing_outer":
        event["participantToken"] = None
    elif change == "client_counter":
        event["payload"]["actorCounter"] = 1
    elif change == "reason":
        event["payload"]["reason"] = "presence_timeout"
    else:
        event["payload"]["actorId"] = ACTOR
    with pytest.raises(SupabaseRejected):
        asyncio.run(
            api.read_events(
                Admin(
                    [dict(headSeq=1, sealedThroughTick=9, through=1, events=[event], closed=False)]
                ),
                ACTOR,
                WAVE,
                OWNER,
                EPOCH,
                None,
                None,
            )
        )


def test_browser_cannot_submit_a_canonical_withdrawal_event_as_an_input():
    item = RecoveryInput(
        inputUid="input_001",
        actorCounter=1,
        tick=0,
        command=dict(type="captain_withdrawn", participantToken=TOKEN, reason="leave"),
    )
    admin = Admin([])
    with pytest.raises(ApiError):
        asyncio.run(api.append_inputs(admin, ACTOR, WAVE, OWNER, EPOCH, SESSION, "1", [item]))
    assert admin.calls == []
