"""Strict revival intents and receipt projection; fixture replies are not combat authority."""

import asyncio
from copy import deepcopy
from uuid import UUID

import pytest
from pydantic import ValidationError

from server.errors import ApiError
from server.island.shared_revival import read_reply, revive_shared
from server.island.shared_revival_models import SharedRevivalRequest
from server.supabase_admin import SupabaseRejected

ACTOR, OWNER, ACCOUNT, EPOCH, WAVE, TARGET, FALL, HOLD, SESSION, OPERATION = (
    str(UUID(int=number)) for number in range(2101, 2111)
)


def body(**changes):
    value = {
        "economy": {"mode": "island_shared", "version": 1,
                    "islandOwner": OWNER, "runEpoch": EPOCH},
        "actionUid": "free-revival-01", "waveId": WAVE, "targetToken": TARGET,
        "fallId": FALL, "holdId": HOLD, "sessionId": SESSION, "connectionGeneration": "0",
    }
    value.update(changes)
    return value


def receipt(**changes):
    value = {
        "receiptId": OPERATION, "actionUid": "free-revival-01", "action": "wave_revive",
        "actorId": ACTOR, "origin": {"mode": "island_shared", "version": 1,
                                   "islandOwner": OWNER, "accountId": ACCOUNT, "runEpoch": EPOCH},
        "result": {"waveId": WAVE, "targetToken": TARGET, "fallId": FALL, "holdId": HOLD,
                   "downAtTick": 10, "eventSeq": 21, "reviveSeq": 21, "restoredHPUnits": 500000},
    }
    value.update(changes)
    return value


def reply(*, repeat=True):
    return {"status": "done", "repeat": repeat, "receipt": receipt()}


class HistoricalOnlyAdmin:
    def __init__(self):
        self.calls = []

    async def call_function(self, name, arguments):
        self.calls.append((name, deepcopy(arguments)))
        assert name == "island_shared_revival_replay", "History must not read current authority."
        return reply()


@pytest.mark.parametrize("field", ["elapsedMs", "hpUnits", "downAt", "x", "z", "skills",
                                   "role", "quotedPrice", "accountId", "code"])
def test_completion_body_rejects_claimed_authority_and_navigation(field):
    with pytest.raises(ValidationError):
        SharedRevivalRequest.model_validate(body(**{field: 1}))


@pytest.mark.parametrize("generation", [0, True, 1.0, "01", "-1", "1.5", "1e3"])
def test_controller_generation_is_an_exact_unsigned_decimal_string(generation):
    with pytest.raises(ValidationError):
        SharedRevivalRequest.model_validate(body(connectionGeneration=generation))


def test_version_boolean_cannot_authorize_a_shared_intent():
    value = body()
    value["economy"]["version"] = True
    with pytest.raises(ValidationError):
        SharedRevivalRequest.model_validate(value)


def test_owned_receipt_precedes_membership_current_fall_hold_and_wallet_reads():
    admin = HistoricalOnlyAdmin()
    request = SharedRevivalRequest.model_validate(body(holdId=str(UUID(int=2200)),
                                                       connectionGeneration="900719925474099312345"))
    answer = asyncio.run(revive_shared(admin, ACTOR, request))
    assert answer.repeat is True and answer.receipt.result.holdId == UUID(HOLD)
    assert len(admin.calls) == 1
    assert admin.calls[0][1]["p_account_id"] is None
    assert admin.calls[0][1]["p_fingerprint"] == {
        "islandOwner": OWNER, "waveId": WAVE, "targetToken": TARGET, "fallId": FALL,
    }


def test_reserved_root_is_rejected_before_any_database_access():
    admin = HistoricalOnlyAdmin()
    with pytest.raises(ApiError) as caught:
        asyncio.run(revive_shared(admin, ACTOR, SharedRevivalRequest.model_validate(
            body(actionUid="fx_untrusted_01")
        )))
    assert caught.value.code == "invalid_transaction"
    assert admin.calls == []


@pytest.mark.parametrize("change", ["actor", "origin", "fall", "wave", "event", "coins"])
def test_unrelated_or_financial_reply_is_not_a_success(change):
    value = reply()
    if change == "actor":
        value["receipt"]["actorId"] = OWNER
    elif change == "origin":
        value["receipt"]["origin"]["runEpoch"] = FALL
    elif change == "fall":
        value["receipt"]["result"]["fallId"] = WAVE
    elif change == "wave":
        value["receipt"]["result"]["waveId"] = FALL
    elif change == "event":
        value["receipt"]["result"]["reviveSeq"] = 20
    else:
        value["coins"] = 100
    with pytest.raises(SupabaseRejected):
        read_reply(value, ACTOR, SharedRevivalRequest.model_validate(body()))


def test_fresh_effect_must_match_the_current_hold_but_history_can_refresh_guards():
    request = SharedRevivalRequest.model_validate(body(holdId=str(UUID(int=2200))))
    with pytest.raises(SupabaseRejected):
        read_reply(reply(repeat=False), ACTOR, request)
    assert read_reply(reply(), ACTOR, request).receipt.result.holdId == UUID(HOLD)


@pytest.mark.parametrize(("reason", "status"), [
    ("hold_incomplete", 409), ("hold_invalidated", 409), ("fall_mismatch", 409),
    ("not_controller", 403), ("not_in_wave", 403), ("path_unavailable", 409),
])
def test_known_refusal_does_not_invent_paid_fallback(reason, status):
    with pytest.raises(ApiError) as caught:
        read_reply({"status": "refused", "reason": reason}, ACTOR,
                   SharedRevivalRequest.model_validate(body()))
    assert caught.value.status_code == status


@pytest.mark.parametrize("header", [None, "2"])
def test_completion_route_requires_common_capability_before_dispatch(monkeypatch, header):
    from server.island import shared_revival
    from server.tests.island_helpers import PLAYER, World

    world = World()

    async def unexpected(*_args):
        raise AssertionError("Capability refusal must precede the completion adapter.")

    monkeypatch.setattr(shared_revival, "revive_shared", unexpected)
    headers = {**PLAYER, **({"X-Island-Economy-Version": header} if header else {})}
    answer = world.client.post("/api/island/revive", headers=headers, json=body())
    assert answer.status_code == 409


def test_completion_route_is_authenticated_and_returns_no_payment_or_current_hp(monkeypatch):
    from server.island import shared_revival
    from server.island.shared_revival_models import SharedRevivalReply
    from server.tests.island_helpers import PLAYER, PLAYER_ID, World

    world = World()
    value = reply()
    value["receipt"]["actorId"] = PLAYER_ID
    old_call = world.app.state.admin.call_function
    lifecycle = []

    async def call(name, arguments):
        if name == "island_lifecycle_actor_status":
            lifecycle.append(arguments)
            return {"status": "active"}
        return await old_call(name, arguments)

    world.app.state.admin.call_function = call

    async def complete(_admin, actor, _body):
        assert actor == PLAYER_ID
        assert lifecycle == [{"p_player_id": PLAYER_ID}]
        return SharedRevivalReply.model_validate(value)

    monkeypatch.setattr(shared_revival, "revive_shared", complete)
    assert world.client.post("/api/island/revive", json=body()).status_code == 401
    answer = world.client.post("/api/island/revive", json=body(),
                               headers={**PLAYER, "X-Island-Economy-Version": "1"})
    assert answer.status_code == 200, answer.text
    assert answer.json() == value
    forbidden = {"coins", "financialReceipt", "currentState", "currentEconomy"}
    assert not forbidden & answer.json().keys()


def test_deleted_cached_actor_is_denied_after_budget_and_before_domain(monkeypatch):
    from types import SimpleNamespace

    from server.island import shared_revival
    from server.tests.island_helpers import PLAYER, World

    world = World()
    order = []
    world.app.state.wave_budget = SimpleNamespace(spend=lambda _actor: order.append("budget"))

    async def status(name, _arguments):
        assert name == "island_lifecycle_actor_status"
        order.append("lifecycle")
        return {"status": "deleted"}

    async def unexpected(*_args):
        raise AssertionError("A deleted actor cannot reach domain history or mutation.")

    world.app.state.admin.call_function = status
    monkeypatch.setattr(shared_revival, "revive_shared", unexpected)
    headers = {**PLAYER, "X-Island-Economy-Version": "1"}
    malformed = world.client.post("/api/island/revive", headers=headers, json=body(elapsedMs=2000))
    assert malformed.status_code == 422
    assert order == []
    denied = world.client.post("/api/island/revive", headers=headers, json=body())
    assert denied.status_code == 401 and order == ["budget", "lifecycle"]
    assert denied.headers["WWW-Authenticate"] == "Bearer"
