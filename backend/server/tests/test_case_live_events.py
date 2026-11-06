"""Committed case writes send version-only hints; reads, repeats and failed hints stay safe."""

import asyncio
from dataclasses import replace

import pytest

from server.crew_broadcast import CREW_EVENT_KINDS
from server.game.case_nudges import NUDGE_KINDS, nudge
from server.game.case_snapshot import Formed
from server.tests.case_api_helpers import HEADER, client_and_store
from server.tests.case_rule_helpers import PLAYER
from server.tests.case_service2_helpers import Sender, intent, scenario


@pytest.mark.parametrize("kind", ["search", "accuse", "clock"])
def test_phase1_writes_use_the_same_sender_and_repeats_and_reads_are_silent(kind):
    client, store, service, _ = client_and_store()
    service.broadcaster = sender = Sender()
    if kind == "search":
        path = "/api/case/search"
        body = {"routeId": "C1.notice_board", "actionUid": "event0001"}
    elif kind == "accuse":
        store.current = replace(
            store.current,
            schooner_found_second=0,
            formed=tuple(Formed(value, 0) for value in service.data.accusation.needs_deductions),
        )
        wrong = next(
            suspect.id
            for suspect in service.data.suspects
            if suspect.id != service.data.accusation.culprit
        )
        path = "/api/case/accuse"
        body = {"suspect": wrong, "actionUid": "event0001"}
    else:
        path = "/api/host/case/clock"
        body = {"seconds": 1, "actionUid": "event0001"}
    first = client.post(path, headers=HEADER, json=body)
    assert first.status_code == 200
    assert len(sender.events) == 1
    assert sender.events == [
        (store.current.crew_id, "case_changed", {"version": store.current.write_revision})
    ]
    assert client.post(path, headers=HEADER, json=body).json()["repeat"]
    assert client.get("/api/case", headers=HEADER).status_code == 200
    assert len(sender.events) == 1


def test_ordinary_phase1_refusals_send_nothing():
    client, store, service, _ = client_and_store()
    service.broadcaster = sender = Sender()
    wrong_kit = next(
        route
        for route in service.data.active_routes
        if route.kind == "kit" and route.kit != store.current.seat_for_player(PLAYER).kit
    )
    answer = client.post(
        "/api/case/search", headers=HEADER, json={"routeId": wrong_kit.id, "actionUid": "event0001"}
    )
    assert answer.status_code == 200 and not answer.json()["accepted"]
    assert sender.events == []


@pytest.mark.parametrize("behavior", ["error", "false", "slow"])
def test_a_failed_or_slow_hint_keeps_the_committed_service_result(behavior, monkeypatch, caplog):
    monkeypatch.setattr("server.game.case_nudges.NUDGE_TIMEOUT_SECONDS", 0.01)
    service, store, _, targets = scenario("pin", {"status": "done", "coinsPaid": 50, "revision": 5})

    class FailingSender:
        async def send(self, *args):
            if behavior == "error":
                raise RuntimeError("private transport sentinel")
            if behavior == "slow":
                await asyncio.Event().wait()
            return False

    service.broadcaster = FailingSender()
    answer = asyncio.run(asyncio.wait_for(intent(service, "pin", targets), 1))
    assert answer["accepted"] and answer["coinsPaid"] == 50 and len(store.writes) == 1
    assert "private transport sentinel" not in caplog.text


def test_nudge_preserves_request_cancellation():
    async def check():
        entered = asyncio.Event()

        class WaitingSender:
            async def send(self, *args):
                entered.set()
                await asyncio.Event().wait()

        task = asyncio.create_task(nudge(WaitingSender(), "crew", "pin", 5))
        await entered.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(check())


def test_nudge_kinds_are_supported_by_the_shared_a4_sender():
    assert set(NUDGE_KINDS.values()) <= set(CREW_EVENT_KINDS)
    assert NUDGE_KINDS["order"] == "partner_changed"


def test_disabled_optional_sender_is_a_quiet_noop():
    asyncio.run(nudge(None, "crew", "pin", 5))
