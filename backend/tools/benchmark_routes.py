"""Local route latency with repository fakes; no environment settings or network access.

Run from backend/: uv run --locked python tools/benchmark_routes.py --output /tmp/result.json
Repeated writes reset only fake state, outside each timed request.
Coverage lists every registered API operation and any missing scenario explicitly.
Use --require-all to fail when coverage is incomplete; small samples are smoke checks, not SLOs.
"""

import argparse
import json
import logging
import math
import re
import socket
import statistics
import subprocess
import sys
from collections import Counter
from collections.abc import Callable
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from time import perf_counter
from unittest.mock import patch

SAMPLES = 20


def deny_network(*args, **kwargs):
    raise AssertionError("Network connections are forbidden in route benchmarks")


@contextmanager
def quiet_logs():
    previous = logging.root.manager.disable
    logging.disable(logging.CRITICAL)
    try:
        yield
    finally:
        logging.disable(previous)


@dataclass
class Scenario:
    method: str
    template: str
    client: object
    path: str | None = None
    headers: dict = field(default_factory=dict)
    body: dict | None = None
    reset: Callable = lambda: None
    requests: list | None = None
    success_key: str | None = None
    notes: str = ""

    def request(self):
        options = {"headers": self.headers}
        if self.body is not None:
            options["json"] = self.body
        return self.client.request(self.method, self.path or self.template, **options)


def scenarios():
    """Repository helper clients exercise current production routes with fake external ports."""
    from tools.benchmark_scenarios import scenarios as current_scenarios

    yield from current_scenarios(Scenario)


def cold_import(backend: Path, processes: int = 3):
    code = """
import json, socket, time
def denied(*args, **kwargs):
    raise AssertionError('Network forbidden in cold import benchmark')
socket.socket.connect = denied
socket.socket.connect_ex = denied
socket.create_connection = denied
socket.getaddrinfo = denied
start = time.perf_counter()
from server.app import create_app
elapsed = (time.perf_counter() - start) * 1000
print(json.dumps({'import_server_app_ms': elapsed}))
"""
    times = []
    for _ in range(processes):
        result = subprocess.run(
            [sys.executable, "-c", code],
            cwd=backend,
            check=True,
            text=True,
            capture_output=True,
            env={},
        )
        times.append(json.loads(result.stdout)["import_server_app_ms"])
    if not times:
        return {"processes": 0, "scope": "Cold imports not measured"}
    return {
        "processes": len(times),
        "median_ms": round(statistics.median(times), 3),
        "samples_ms": [round(value, 3) for value in times],
        "scope": "Fresh process imports server.app; excludes startup; no app/env load",
    }


def successful(scenario: Scenario, response) -> None:
    assert response.status_code == 200, (scenario.method, scenario.template, response.status_code)
    if scenario.success_key is not None:
        assert response.json().get(scenario.success_key) is True, (
            scenario.method,
            scenario.template,
            "did not exercise a successful intent",
        )


def coverage(targets: list[Scenario]) -> dict:
    if not targets:
        raise ValueError("At least one scenario is required to inspect the app registry.")
    registered = {
        (method.upper(), path)
        for path, operations in targets[0].client.app.openapi()["paths"].items()
        for method in operations
    }
    actual = {(target.method, target.template) for target in targets}
    assert len(actual) == len(targets), "A method/template pair has duplicate benchmark scenarios"
    return {
        "registered_route_count": len(registered),
        "measured_route_count": len(actual),
        "uncovered": [
            {"method": method, "route": path} for method, path in sorted(registered - actual)
        ],
        "obsolete": [
            {"method": method, "route": path} for method, path in sorted(actual - registered)
        ],
    }


def measure(scenario: Scenario, count: int = SAMPLES):
    if type(count) is not int or count < 1:
        raise ValueError("A benchmark needs at least one timed request.")
    samples = []
    outgoing = Counter()
    with scenario.client:
        scenario.reset()
        response = scenario.request()
        successful(scenario, response)
        for _ in range(count):
            scenario.reset()
            before = len(scenario.requests) if scenario.requests is not None else 0
            start = perf_counter()
            response = scenario.request()
            samples.append((perf_counter() - start) * 1000)
            successful(scenario, response)
            for request in (scenario.requests or [])[before:]:
                # Only fake service table/function route names; no ids, params or payloads.
                if "/rest/v1/" in request.url.path:
                    kind = request.url.path.split("/rest/v1/", 1)[1]
                    if re.fullmatch(r"(?:rpc/)?[a-z_]+", kind) is None:
                        kind = "fake-service"
                else:
                    kind = "fake-service"
                outgoing[f"{request.method} {kind}"] += 1
    samples.sort()
    return {
        "method": scenario.method,
        "route": scenario.template,
        "status": 200,
        "calls": count,
        "p50_ms": round(statistics.median(samples), 3),
        "p95_ms": round(samples[math.ceil(0.95 * len(samples)) - 1], 3),
        "fake_service_calls_per_request": None
        if scenario.requests is None
        else {key: total / count for key, total in sorted(outgoing.items())},
        "notes": scenario.notes,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--samples",
        type=int,
        default=SAMPLES,
        help="Timed requests per route (1..1000, default 20)",
    )
    parser.add_argument(
        "--cold-processes", type=int, default=3, help="Fresh import processes (0..10, default 3)"
    )
    parser.add_argument(
        "--require-all",
        action="store_true",
        help="Fail if a registered API operation has no successful scenario",
    )
    args = parser.parse_args(argv)
    if not 1 <= args.samples <= 1000 or not 0 <= args.cold_processes <= 10:
        parser.error("--samples must be 1..1000 and --cold-processes 0..10")
    backend = args.backend.resolve()
    sys.path.insert(0, str(backend))
    cold = cold_import(backend, args.cold_processes)
    with (
        quiet_logs(),
        patch.object(socket.socket, "connect", deny_network),
        patch.object(socket.socket, "connect_ex", deny_network),
        patch.object(socket, "create_connection", deny_network),
        patch.object(socket, "getaddrinfo", deny_network),
    ):
        targets = list(scenarios())
        route_coverage = coverage(targets)
        assert not route_coverage["obsolete"], route_coverage["obsolete"]
        if args.require_all:
            assert not route_coverage["uncovered"], route_coverage["uncovered"]
        results = []
        for scenario in targets:
            result = measure(scenario, args.samples)
            results.append(result)
            print(
                f"{result['method']:6} {result['route']:26} "
                f"p50={result['p50_ms']:7.3f}ms p95={result['p95_ms']:7.3f}ms",
                flush=True,
            )
    report = {
        "samples_per_route": args.samples,
        "coverage": route_coverage,
        "warmup_calls_per_route": 1,
        "route_count": len(results),
        "timing_scope": (
            "TestClient roundtrip with repository fakes; resets and construction excluded"
        ),
        "limitations": (
            "No live-network/SQL/provider latency. Null fake-call metrics mean "
            "not instrumented. Small samples are smoke coverage, not SLO estimates."
        ),
        "p95_method": "Nearest rank (ceil(0.95*n)-1); sequential calls, no network",
        "cold_import": cold,
        "routes": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(results)} successful API route benchmarks to {args.output}")


if __name__ == "__main__":
    main()
