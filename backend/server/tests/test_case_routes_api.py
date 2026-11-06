"""Case HTTP contracts, safe repeats, refusal order, retry budgets and host isolation."""

from dataclasses import replace

import pytest

from server.game.case_snapshot import Formed
from server.tests.case_api_helpers import FRIEND_HEADER, HEADER, client_and_store
from server.tests.helpers import assert_error

SEARCH = {"routeId": "C1.notice_board", "actionUid": "search0001"}


def ready(store, service):
    store.current = replace(
        store.current,
        schooner_found_second=0,
        formed=tuple(Formed(value, 0) for value in service.data.accusation.needs_deductions),
    )


def test_flag_off_refuses_every_case_route():
    client, store, _, _ = client_and_store(enabled=False)
    for method, url, body in (
        ("GET", "/api/case", None),
        ("POST", "/api/case/search", SEARCH),
        ("POST", "/api/case/accuse", {"suspect": "unknown", "actionUid": "accuse0001"}),
        ("POST", "/api/host/case/clock", {"seconds": 60, "actionUid": "clock0001"}),
    ):
        assert_error(client.request(method, url, headers=HEADER, json=body), 404, "feature_off")
    assert store.calls == []


def test_no_token_is_unauthorized_and_get_without_a_crew_is_null():
    client, store, _, _ = client_and_store()
    assert_error(client.get("/api/case"), 401, "unauthorized")
    store.current = None
    assert client.get("/api/case", headers=HEADER).json() == {"case": None}
    assert_error(client.post("/api/case/search", headers=HEADER, json=SEARCH), 404, "no_crew")


@pytest.mark.parametrize(
    ("status", "code"), [("forming", "crew_not_started"), ("finished", "crew_finished")]
)
def test_writes_require_an_active_crew(status, code):
    client, store, _, _ = client_and_store()
    store.current = replace(store.current, status=status)
    assert_error(client.post("/api/case/search", headers=HEADER, json=SEARCH), 409, code)
    assert store.calls == []


def test_the_same_action_uid_twice_acts_once_even_after_the_crew_finishes():
    client, store, _, _ = client_and_store()
    first = client.post("/api/case/search", headers=HEADER, json=SEARCH)
    assert first.status_code == 200 and first.json()["accepted"]
    store.current = replace(store.current, status="finished")
    second = client.post("/api/case/search", headers=HEADER, json=SEARCH)
    assert second.status_code == 200 and second.json()["repeat"] and second.json()["accepted"]
    assert "readyIn" not in second.json() and store.calls == ["search"]


def test_a_repeat_of_a_wrong_accusation_is_still_a_refusal():
    client, store, service, _ = client_and_store()
    ready(store, service)
    wrong = next(
        item.id for item in service.data.suspects if item.id != service.data.accusation.culprit
    )
    body = {"suspect": wrong, "actionUid": "accuse0001"}
    first = client.post("/api/case/accuse", headers=HEADER, json=body).json()
    second = client.post("/api/case/accuse", headers=HEADER, json=body).json()
    assert first["reason"] == second["reason"] == "accusation_refused"
    assert first["accepted"] is False and second["accepted"] is False and second["repeat"]
    assert store.calls == ["accuse"]


def test_a_repeat_is_answered_before_any_rule_or_target_validation():
    client, store, _, _ = client_and_store()
    client.post("/api/case/search", headers=HEADER, json=SEARCH)
    body = {"routeId": "C8.missing_route", "actionUid": SEARCH["actionUid"]}
    assert client.post("/api/case/search", headers=HEADER, json=body).json()["repeat"]
    assert store.calls == ["search"]


def test_a_rule_refusal_calls_no_write_rpc_and_unknown_routes_are_404():
    client, store, _, _ = client_and_store()
    refusal = client.post(
        "/api/case/search",
        headers=HEADER,
        json={"routeId": "C5.yard_shift", "actionUid": "search0002"},
    )
    assert refusal.json()["reason"] == "lead_locked"
    assert store.calls == []
    unknown = {"routeId": "C8.missing_route", "actionUid": "search0003"}
    assert_error(
        client.post("/api/case/search", headers=HEADER, json=unknown), 404, "no_such_route"
    )


@pytest.mark.parametrize(
    "extra",
    [
        {"playerId": "untrusted"},
        {"expectedPrice": True},
        {"paidConfirmed": "true"},
        {"actionUid": "short"},
    ],
)
def test_extra_or_wrongly_typed_fields_are_refused(extra):
    client, store, _, _ = client_and_store()
    assert_error(
        client.post("/api/case/search", headers=HEADER, json={**SEARCH, **extra}),
        422,
        "validation_error",
    )
    assert store.calls == []


def test_case_open_runs_once_for_missing_state_and_starting_cards():
    client, store, _, _ = client_and_store()
    store.current = replace(store.current, write_revision=0)
    for _ in range(2):
        assert client.get("/api/case", headers=HEADER).status_code == 200
    assert store.open_count == 1
    assert any(find.seat_no == 4 and find.ready_second == 0 for find in store.current.finds)


def test_a_finished_crew_still_reads_the_reveal_and_a_second_crew_payment_can_be_zero():
    client, store, service, _ = client_and_store()
    ready(store, service)
    store.paid = 0
    body = {"suspect": service.data.accusation.culprit, "actionUid": "accuse0002"}
    response = client.post("/api/case/accuse", headers=HEADER, json=body)
    assert response.status_code == 200 and response.json()["accepted"]
    assert response.json()["coinsPaid"] == 0
    assert response.json()["case"]["reveal"]["available"]
    assert client.get("/api/case", headers=HEADER).json()["case"]["reveal"]["available"]


def test_a_stale_accusation_snapshot_is_retried_once():
    client, store, service, _ = client_and_store()
    ready(store, service)
    store.scripted["accuse"] = [{"status": "refused", "reason": "state_changed"}]
    body = {"suspect": service.data.accusation.culprit, "actionUid": "accuse0003"}
    response = client.post("/api/case/accuse", headers=HEADER, json=body)
    assert response.status_code == 200 and response.json()["accepted"]
    assert store.calls == ["accuse", "accuse"]


def test_a_second_stale_accusation_snapshot_is_crew_busy():
    client, store, service, _ = client_and_store()
    ready(store, service)
    store.scripted["accuse"] = [{"status": "refused", "reason": "state_changed"}] * 2
    body = {"suspect": service.data.accusation.culprit, "actionUid": "accuse0004"}
    assert_error(client.post("/api/case/accuse", headers=HEADER, json=body), 409, "crew_busy")
    assert store.calls == ["accuse", "accuse"]


def test_crew_not_active_from_sql_is_mapped_by_crew_status():
    client, store, _, _ = client_and_store()
    store.scripted["search"] = [
        {"status": "refused", "reason": "crew_not_active", "crewStatus": "finished"}
    ]
    assert_error(client.post("/api/case/search", headers=HEADER, json=SEARCH), 409, "crew_finished")


def test_more_than_ten_writes_in_ten_seconds_is_rate_limited():
    client, store, _, clock = client_and_store()
    for _ in range(10):
        assert client.post("/api/case/search", headers=HEADER, json=SEARCH).status_code == 200
    response = client.post("/api/case/search", headers=HEADER, json=SEARCH)
    assert_error(response, 429, "too_many_requests")
    assert response.headers["retry-after"] == "10" and store.calls == ["search"]
    clock.advance(10)
    assert client.post("/api/case/search", headers=HEADER, json=SEARCH).status_code == 200


def test_reads_have_a_separate_budget_of_thirty_per_ten_seconds():
    client, _, _, _ = client_and_store()
    for _ in range(30):
        assert client.get("/api/case", headers=HEADER).status_code == 200
    assert_error(client.get("/api/case", headers=HEADER), 429, "too_many_requests")


def test_the_host_clock_moves_only_the_hosts_own_crew():
    client, store, _, _ = client_and_store()
    body = {"seconds": 600, "actionUid": "clock0001"}
    assert_error(
        client.post("/api/host/case/clock", headers=FRIEND_HEADER, json=body), 403, "forbidden"
    )
    response = client.post("/api/host/case/clock", headers=HEADER, json=body)
    assert response.status_code == 200 and response.json()["now"] == 600
    assert store.calls == ["clock"]
    assert client.post("/api/host/case/clock", headers=HEADER, json=body).json()["repeat"]


@pytest.mark.parametrize("seconds", [0, 3601, True, "60"])
def test_invalid_clock_moves_are_refused(seconds):
    client, store, _, _ = client_and_store()
    body = {"seconds": seconds, "actionUid": "clock0002"}
    assert_error(
        client.post("/api/host/case/clock", headers=HEADER, json=body), 422, "validation_error"
    )
    assert store.calls == []


def test_answers_are_private_and_never_cached():
    client, _, _, _ = client_and_store()
    for response in (
        client.get("/api/case", headers=HEADER),
        client.get("/api/case"),
        client.post("/api/case/search", headers=HEADER, json={}),
    ):
        assert response.headers["cache-control"] == "private, no-store"


def test_unexpected_case_errors_are_private_and_hide_details():
    from fastapi.testclient import TestClient

    client, _, _, _ = client_and_store()

    @client.app.get("/api/case/test-crash")
    async def crash():
        raise RuntimeError("private diagnostic detail")

    response = TestClient(client.app, raise_server_exceptions=False).get("/api/case/test-crash")
    assert_error(response, 500, "server_error")
    assert response.headers["cache-control"] == "private, no-store"
    assert "private diagnostic detail" not in response.text


def test_case_not_open_retries_the_write_only_once():
    client, store, _, _ = client_and_store()
    client.get("/api/case", headers=HEADER)
    before = store.open_count
    store.scripted["search"] = [{"status": "refused", "reason": "case_not_open"}]
    response = client.post("/api/case/search", headers=HEADER, json=SEARCH)
    assert response.status_code == 200 and response.json()["accepted"]
    assert store.calls == ["search", "search"] and store.open_count == before + 1


def test_a_case_that_stays_closed_after_one_reopen_is_database_error():
    client, store, _, _ = client_and_store()
    store.scripted["search"] = [{"status": "refused", "reason": "case_not_open"}] * 2
    assert_error(
        client.post("/api/case/search", headers=HEADER, json=SEARCH), 502, "database_error"
    )
    assert store.calls == ["search", "search"]


def test_accusation_retries_share_one_reopen_budget():
    client, store, service, _ = client_and_store()
    ready(store, service)
    client.get("/api/case", headers=HEADER)
    before = store.open_count
    store.scripted["accuse"] = [
        {"status": "refused", "reason": "case_not_open"},
        {"status": "refused", "reason": "state_changed"},
        {"status": "refused", "reason": "case_not_open"},
    ]
    body = {"suspect": service.data.accusation.culprit, "actionUid": "accuse0010"}
    assert_error(client.post("/api/case/accuse", headers=HEADER, json=body), 502, "database_error")
    assert store.calls == ["accuse"] * 3 and store.open_count == before + 1


@pytest.mark.parametrize("payouts", [None, [None], {}, [{"playerId": "fixture", "paid": True}]])
def test_malformed_solve_payments_are_generic_database_errors(payouts):
    client, store, service, _ = client_and_store()
    ready(store, service)
    store.scripted["accuse"] = [
        {"status": "solved", "world": {"world": "unchanged"}, "payouts": payouts, "revision": 2}
    ]
    body = {"suspect": service.data.accusation.culprit, "actionUid": "accuse0011"}
    response = client.post("/api/case/accuse", headers=HEADER, json=body)
    assert_error(response, 502, "database_error")
    assert response.headers["cache-control"] == "private, no-store"


def test_broken_case_data_disables_only_the_case_api(monkeypatch):
    from server.game import case_service

    def broken():
        raise ValueError("private broken content")

    client, _, _, _ = client_and_store()
    monkeypatch.setattr(case_service, "load_case", broken)
    client.app.state.case = case_service.case_or_none(client.app.state.settings)
    assert_error(client.get("/api/case", headers=HEADER), 503, "case_unavailable")
    assert client.get("/api/health").status_code == 200
