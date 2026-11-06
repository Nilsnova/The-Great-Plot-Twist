"""Committed writes send one bounded hint; failures never alter the game answer."""

import asyncio
import logging
from dataclasses import replace
from time import monotonic

import pytest

from server.crew_broadcast import CREW_EVENT_KINDS
from server.game.case_nudges import NUDGE_KINDS, nudge
from server.game.case_snapshot import Formed
from server.tests.case_api_helpers import HEADER, client_and_store
from server.tests.test_board_routes_api import Recorder


def test_nudge_kinds_use_the_existing_crew_contract():
    assert set(NUDGE_KINDS.values()).issubset(CREW_EVENT_KINDS)


@pytest.mark.parametrize("mode", ["false", "raises", "slow"])
def test_nudge_errors_and_timeout_leave_no_ids_in_logs(mode, caplog):
    class FailingBroadcaster:
        cancelled = False

        async def send(self, crew_id, kind, data):
            if mode == "raises":
                raise RuntimeError("private crew and state detail")
            if mode == "slow":
                try:
                    await asyncio.sleep(2)
                finally:
                    self.cancelled = True
            return False

    broadcaster = FailingBroadcaster()
    start = monotonic()
    with caplog.at_level(logging.WARNING):
        asyncio.run(nudge(broadcaster, "private-crew", "pin", 3))
    assert monotonic() - start < 1.5
    assert "private-crew" not in caplog.text and "state detail" not in caplog.text
    if mode == "slow":
        assert broadcaster.cancelled


def test_search_accusation_and_clock_nudge_once_and_refusals_do_not():
    client, store, service, _ = client_and_store()
    recorder = Recorder()
    service.broadcaster = recorder
    search = {"routeId": "C1.notice_board", "actionUid": "search0001"}
    for _ in range(2):
        assert client.post("/api/case/search", headers=HEADER, json=search).status_code == 200
    refusal = {"routeId": "C5.yard_shift", "actionUid": "search0002"}
    assert client.post("/api/case/search", headers=HEADER, json=refusal).json()["accepted"] is False
    store.current = replace(
        store.current,
        schooner_found_second=0,
        formed=tuple(Formed(value, 0) for value in service.data.accusation.needs_deductions),
    )
    wrong = next(
        item.id for item in service.data.suspects if item.id != service.data.accusation.culprit
    )
    accusation = {"suspect": wrong, "actionUid": "accuse0001"}
    for _ in range(2):
        assert (
            client.post("/api/case/accuse", headers=HEADER, json=accusation).json()["reason"]
            == "accusation_refused"
        )
    clock = {"seconds": 60, "actionUid": "clock0001"}
    for _ in range(2):
        assert client.post("/api/host/case/clock", headers=HEADER, json=clock).status_code == 200
    assert recorder.events == [
        (store.current.crew_id, "case_changed", {"version": version}) for version in (2, 3, 4)
    ]
