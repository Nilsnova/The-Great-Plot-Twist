"""The local benchmark reports honest scope and does not time refusals as successful writes."""

import json
import logging
import socket

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tools import benchmark_routes as benchmark
from tools.benchmark_scenarios import restore_fake


def client():
    app = FastAPI()

    @app.get("/api/read")
    def read():
        return {"accepted": False}

    @app.post("/api/write")
    def write():
        return {"accepted": True}

    return TestClient(app)


def test_configurable_samples_reset_warmup_and_nearest_rank(monkeypatch):
    resets, outgoing = [], []
    scenario = benchmark.Scenario(
        "POST",
        "/api/write",
        client(),
        success_key="accepted",
        reset=lambda: resets.append(True),
        requests=outgoing,
    )
    original = scenario.request

    def request():
        outgoing.extend(
            [
                httpx.Request(
                    "POST",
                    "https://fake.invalid/rest/v1/rpc/write?private=query",
                    headers={"Authorization": "private-header"},
                    json={"private": "body"},
                ),
                httpx.Request("GET", "https://fake.invalid/rest/v1/profiles/private-player"),
            ]
        )
        return original()

    scenario.request = request
    ticks = iter((0, 0.001, 1, 1.004))
    monkeypatch.setattr(benchmark, "perf_counter", lambda: next(ticks))
    result = benchmark.measure(scenario, 2)
    assert len(resets) == 3 and result["calls"] == 2
    assert result["p50_ms"] == 2.5 and result["p95_ms"] == 4
    assert result["fake_service_calls_per_request"] == {"GET fake-service": 1, "POST rpc/write": 1}
    assert "private" not in json.dumps(result)


def test_function_fakes_have_null_transport_metrics_and_refusals_are_rejected():
    scenario = benchmark.Scenario("GET", "/api/read", client())
    assert benchmark.measure(scenario, 1)["fake_service_calls_per_request"] is None
    scenario.success_key = "accepted"
    with pytest.raises(AssertionError, match="successful intent"):
        benchmark.measure(scenario, 1)
    for count in (0, -1, True, 1.5):
        with pytest.raises(ValueError):
            benchmark.measure(scenario, count)


def test_registry_reports_uncovered_obsolete_and_duplicate_operations():
    scenario = benchmark.Scenario("GET", "/api/read", client())
    result = benchmark.coverage([scenario])
    assert result == {
        "registered_route_count": 2,
        "measured_route_count": 1,
        "uncovered": [{"method": "POST", "route": "/api/write"}],
        "obsolete": [],
    }
    obsolete = benchmark.Scenario("GET", "/api/retired", scenario.client)
    assert benchmark.coverage([obsolete])["obsolete"] == [
        {"method": "GET", "route": "/api/retired"}
    ]
    with pytest.raises(AssertionError, match="duplicate"):
        benchmark.coverage([scenario, scenario])
    with pytest.raises(ValueError):
        benchmark.coverage([])


def test_cli_blocks_network_reports_coverage_and_restores_logging(monkeypatch, tmp_path):
    app_client = client()
    attempts = []

    def scenarios():
        for action in (
            lambda: socket.socket().connect(("127.0.0.1", 9)),
            lambda: socket.create_connection(("127.0.0.1", 9)),
            lambda: socket.getaddrinfo("fake.invalid", 443),
        ):
            with pytest.raises(AssertionError, match="forbidden"):
                action()
            attempts.append(True)
        yield benchmark.Scenario("GET", "/api/read", app_client)
        yield benchmark.Scenario("POST", "/api/write", app_client, success_key="accepted")

    monkeypatch.setattr(benchmark, "scenarios", scenarios)
    before = logging.root.manager.disable
    output = tmp_path / "result.json"
    benchmark.main(
        ["--output", str(output), "--samples", "2", "--cold-processes", "0", "--require-all"]
    )
    result = json.loads(output.read_text())
    assert attempts == [True] * 3 and logging.root.manager.disable == before
    assert result["coverage"]["uncovered"] == result["coverage"]["obsolete"] == []
    assert result["route_count"] == 2 and result["samples_per_route"] == 2
    assert result["cold_import"]["processes"] == 0
    assert "not SLO" in result["limitations"]


@pytest.mark.parametrize(
    "arguments",
    [
        ("--samples", "0"),
        ("--samples", "1001"),
        ("--cold-processes", "-1"),
        ("--cold-processes", "11"),
    ],
)
def test_cli_bounds_reject_before_any_benchmark(arguments, tmp_path):
    with pytest.raises(SystemExit) as error:
        benchmark.main(["--output", str(tmp_path / "never.json"), *arguments])
    assert error.value.code == 2


def test_fake_reset_preserves_request_list_clock_and_restores_mutations():
    class Fake:
        pass

    fake = Fake()
    fake.clock, fake.requests, fake.coins = object(), [], {"player": 100}
    clock, outgoing = fake.clock, fake.requests
    reset = restore_fake(fake)
    fake.coins["player"] = 0
    fake.receipt = True
    fake.requests.append("recorded")
    reset()
    assert fake.clock is clock and fake.requests is outgoing and outgoing == []
    assert fake.coins == {"player": 100} and not hasattr(fake, "receipt")
