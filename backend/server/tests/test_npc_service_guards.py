"""NPC services keep player/partner boundaries, fail closed on bank errors and tolerate hints."""

import asyncio
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.errors import ApiError
from server.flags import parse_flags
from server.game.case_service import case_or_none
from server.game.npc_lines import LineBank
from server.settings import Settings
from server.tests.case_api_helpers import HEADER, TestVerifier
from server.tests.npc_service_helpers import call, scenario


@pytest.mark.parametrize("seat_no", [1, 3])
def test_a_player_seat_is_not_an_orderable_partner(seat_no):
    service, store, sender, _, target = scenario()
    with pytest.raises(ApiError) as error:
        asyncio.run(call(service, seat_no, target))
    assert error.value.code == "not_a_partner" and store.writes == [] and sender.events == []


def test_an_empty_seat_is_not_an_orderable_partner():
    service, store, _, _, target = scenario()
    store.current = replace(
        store.current, seats=tuple(seat for seat in store.current.seats if seat.seat_no != 2)
    )
    with pytest.raises(ApiError) as error:
        asyncio.run(call(service, 2, target))
    assert error.value.code == "not_a_partner" and store.writes == []


@pytest.mark.parametrize(
    "status,code", [("forming", "crew_not_started"), ("finished", "crew_finished")]
)
def test_only_active_crews_can_start_new_orders(status, code):
    service, store, _, seat_no, target = scenario()
    store.current = replace(store.current, status=status)
    with pytest.raises(ApiError) as error:
        asyncio.run(call(service, seat_no, target))
    assert error.value.code == code and store.writes == []


def test_an_outsider_has_no_crew_to_order():
    service, store, _, seat_no, target = scenario()
    store.current = None
    with pytest.raises(ApiError) as error:
        asyncio.run(call(service, seat_no, target))
    assert error.value.code == "no_crew" and store.writes == []


def test_factory_injects_the_validated_canonical_bank():
    assert isinstance(case_or_none(Settings()).lines, LineBank)


def test_a_broken_bank_disables_case_routes_but_not_health(monkeypatch, caplog):
    def broken():
        raise ValueError("private dialogue sentinel")

    monkeypatch.setattr("server.game.case_service.load_lines", broken)
    app = create_app(Settings(flags=parse_flags("case"), demo_mode=True), verifier=TestVerifier())
    client = TestClient(app)
    assert client.get("/api/health").status_code == 200
    response = client.get("/api/case", headers=HEADER)
    assert response.status_code == 503 and response.json()["error"]["code"] == "case_unavailable"
    assert "private dialogue sentinel" not in caplog.text


@pytest.mark.parametrize("behavior", ["error", "false", "slow"])
def test_failed_hints_do_not_fail_a_committed_npc_order(behavior, monkeypatch):
    monkeypatch.setattr("server.game.case_nudges.NUDGE_TIMEOUT_SECONDS", 0.01)
    service, store, _, seat_no, target = scenario()

    class FailingSender:
        async def send(self, *args):
            if behavior == "error":
                raise RuntimeError("private transport sentinel")
            if behavior == "slow":
                await asyncio.Event().wait()
            return False

    service.broadcaster = FailingSender()
    answer = asyncio.run(asyncio.wait_for(call(service, seat_no, target), 1))
    assert answer["accepted"] and len(store.writes) == 1
