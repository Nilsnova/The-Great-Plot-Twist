"""Local route latency with repository fakes; no environment settings or network access.

Run from backend/: uv run --locked python tools/benchmark_routes.py --output /tmp/result.json
Repeated writes reset only fake state, outside each timed request. Every API operation must
have a successful scenario; route coverage is checked against FastAPI's registered routes.
"""

import argparse
import json
import logging
import math
import socket
import statistics
import subprocess
import sys
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from time import perf_counter
from unittest.mock import patch

SAMPLES = 200


def deny_network(*args, **kwargs):
    raise AssertionError("Network connections are forbidden in route benchmarks")


@dataclass
class Scenario:
    method: str
    template: str
    client: object
    path: str | None = None
    headers: dict = field(default_factory=dict)
    body: dict | None = None
    reset: Callable = lambda: None
    requests: list = field(default_factory=list)
    notes: str = ""

    def request(self):
        options = {"headers": self.headers}
        if self.body is not None:
            options["json"] = self.body
        return self.client.request(self.method, self.path or self.template, **options)


def scenarios():
    from fastapi.testclient import TestClient

    from server.app import create_app
    from server.tests import account_helpers as accounts
    from server.tests import crew_helpers as crews
    from server.tests import test_auth_exchange as exchange
    from server.tests import test_crew_routes as crew_routes
    from server.tests import test_intro_route as intro
    from server.tests import test_keepalive as keepalive
    from server.tests import test_market_routes as market
    from server.tests import test_me as me
    from server.tests import test_weather_route as weather
    from server.tests.helpers import CONFIGURED_SETTINGS
    from server.tests.story_states import WARNED_RESCUE
    from server.tests.weather_helpers import answer_with_sample

    public = TestClient(create_app(CONFIGURED_SETTINGS))
    yield Scenario("GET", "/api/health", public)
    yield Scenario("GET", "/api/config", public)
    yield Scenario("GET", "/api/content/{name}", public, "/api/content/intro-story")
    client, seen, _ = weather.make_client(answer_with_sample("rain"))
    yield Scenario("GET", "/api/weather", client, requests=seen,
                   notes="Warm source cache; MockTransport supplies first weather answer")
    client, seen = keepalive.make_client()
    yield Scenario("GET", "/api/keepalive", client, headers=keepalive.RIGHT_HEADER,
                   requests=seen)
    client, seen = exchange.make_client()
    yield Scenario("POST", "/api/auth/exchange", client, body=exchange.BODY,
                   requests=seen, notes="Mock exchange returns a scripted fake session each call")
    client, seen = me.make_client()
    yield Scenario("GET", "/api/me", client, headers=me.RIGHT_HEADER, requests=seen)

    for method, path, body in [
        ("POST", "/api/me/name", None),
        ("POST", "/api/me/name/reroll", {"actionUid": "benchmark-click"}),
        ("GET", "/api/save", None),
        ("PUT", "/api/save", {"version": 1, "data": {"intro": {"scene": "shore"}}}),
        ("DELETE", "/api/me", {"confirm": True}),
    ]:
        database = accounts.AccountsDatabase()
        client, seen = accounts.make_client(database)

        def reset(database=database):
            database.add_player(accounts.PLAYER_ID, display_name="Brave Puffin 17")
            database.rerolls.clear()
            database.deleted.clear()

        yield Scenario(method, path, client, headers=accounts.RIGHT_HEADER, body=body,
                       reset=reset, requests=seen,
                       notes="Account rows reset outside timing; successful write, not conflict")

    database = intro.EntryDatabase()
    client, seen = accounts.make_client(database)
    yield Scenario("POST", "/api/intro/complete", client, headers=accounts.RIGHT_HEADER,
                   body={"actions": WARNED_RESCUE}, requests=seen,
                   reset=lambda database=database: (
                       database.profiles.clear(), database.balances.clear(),
                       database.ledger.clear(), database.calls.clear()),
                   notes="Fake entry grant reset each call; replays complete valid move log")

    for method, path, body in [
        ("GET", "/api/market", None),
        ("GET", "/api/market/portfolio", None),
        ("POST", "/api/market/trade", {"companyId": "harbor-trust", "side": "buy",
                                       "units": 5, "actionUid": "benchmark-click"}),
    ]:
        world = market.World()
        yield Scenario(method, path, world.client, headers=market.AUTH, body=body,
                       requests=world.database.requests,
                       reset=lambda world=world: world.service.limiter.recent_trades.clear(),
                       notes="Scripted successful trade; fake limiter reset outside timing")

    for method, path in [("POST", "/api/crews"), ("POST", "/api/crews/join"),
                         ("POST", "/api/crews/me/start"), ("GET", "/api/crews/me")]:
        database = crews.FakeCrewDatabase()
        row = crews.crew_row([crew_routes.ME])
        database.seat_rows = [crews.seat_of_player()]
        database.script("crew_create", {"status": "created", "crewId": crews.CREW_ID})
        database.script("crew_find_by_code", crews.found_reply([]))
        database.script("crew_take_seat", {"status": "joined", "seatNo": 1,
                                           "replacedPartner": None})
        database.script("crew_start", {"status": "started"})

        def reset(database=database, row=row, path=path):
            if path.endswith("/start"):
                database.set_crew(crews.CREW_ID, row, crew_routes.sailed_crew())
            else:
                database.set_crew(crews.CREW_ID, row)

        client = crews.make_crew_client(database)
        yield Scenario(method, path, client, headers=crews.AUTH,
                       body={"code": crews.CODE} if path.endswith("/join") else None,
                       requests=database.requests, reset=reset,
                       notes="Crew RPC success scripted; crew row sequence reset outside timing")


def cold_import(backend: Path):
    code = """
import json, socket, time
def denied(*args, **kwargs):
    raise AssertionError('Network forbidden in cold import benchmark')
socket.socket.connect = denied
socket.socket.connect_ex = denied
socket.create_connection = denied
start = time.perf_counter()
from server.app import create_app
elapsed = (time.perf_counter() - start) * 1000
print(json.dumps({'import_server_app_ms': elapsed}))
"""
    times = []
    for _ in range(5):
        result = subprocess.run([sys.executable, "-c", code], cwd=backend,
                                check=True, text=True, capture_output=True)
        times.append(json.loads(result.stdout)["import_server_app_ms"])
    return {"processes": len(times), "median_ms": round(statistics.median(times), 3),
            "samples_ms": [round(value, 3) for value in times],
            "scope": "Fresh process imports server.app; excludes startup; no app/env load"}


def measure(scenario: Scenario):
    samples = []
    outgoing = Counter()
    with scenario.client:
        scenario.reset()
        response = scenario.request()
        assert response.status_code == 200, (scenario.template, response.status_code)
        for _ in range(SAMPLES):
            scenario.reset()
            before = len(scenario.requests)
            start = perf_counter()
            response = scenario.request()
            samples.append((perf_counter() - start) * 1000)
            assert response.status_code == 200, (scenario.template, response.status_code)
            for request in scenario.requests[before:]:
                # Only fake service table/function route names; no ids, params or payloads.
                if "/rest/v1/" in request.url.path:
                    kind = request.url.path.split("/rest/v1/", 1)[1]
                else:
                    kind = "fake-service"
                outgoing[f"{request.method} {kind}"] += 1
    samples.sort()
    return {"method": scenario.method, "route": scenario.template, "status": 200,
            "calls": SAMPLES, "p50_ms": round(statistics.median(samples), 3),
            "p95_ms": round(samples[math.ceil(.95 * len(samples)) - 1], 3),
            "fake_service_calls_per_request": {key: count / SAMPLES
                                               for key, count in sorted(outgoing.items())},
            "notes": scenario.notes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    backend = args.backend.resolve()
    sys.path.insert(0, str(backend))
    cold = cold_import(backend)
    logging.disable(logging.CRITICAL)
    with patch.object(socket.socket, "connect", deny_network), \
         patch.object(socket.socket, "connect_ex", deny_network), \
         patch.object(socket, "create_connection", deny_network):
        targets = list(scenarios())
        # Coverage excludes generated documentation routes, which are absent in production.
        registered = {(method.upper(), path)
                      for path, operations in targets[0].client.app.openapi()["paths"].items()
                      for method in operations}
        actual = {(target.method, target.template) for target in targets}
        assert registered == actual, {"missing": sorted(registered - actual),
                                      "extra": sorted(actual - registered)}
        results = []
        for scenario in targets:
            result = measure(scenario)
            results.append(result)
            print(f"{result['method']:6} {result['route']:26} "
                  f"p50={result['p50_ms']:7.3f}ms p95={result['p95_ms']:7.3f}ms", flush=True)
    report = {"samples_per_route": SAMPLES, "warmup_calls_per_route": 1,
              "route_count": len(results),
              "timing_scope": "TestClient request roundtrip; fake resets excluded",
              "p95_method": "Nearest rank (ceil(0.95*n)-1); sequential calls, no network",
              "cold_import": cold, "routes": results}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(results)} successful API route benchmarks to {args.output}")


if __name__ == "__main__":
    main()
