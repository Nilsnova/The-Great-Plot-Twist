# G16 benchmark reconciliation for the current API

The original before/after reports remain historical and unchanged. This integration updates
the runnable benchmark from base `6c81d82` to the current 55 API operations, including Exchange
v2 open/close, case and NPC intents, world, festival, host console, and sports.

## Reproduce

From `backend/`:

```sh
uv run --locked python tools/benchmark_routes.py --samples 2 --cold-processes 1 --require-all --output /tmp/g16-current-routes.json
uv run pytest -q server/tests/test_route_benchmark_tool.py --tb=no
uv run ruff check tools/benchmark_routes.py tools/benchmark_scenarios.py server/tests/test_route_benchmark_tool.py
```

The bounded current run completed all **55 of 55** registered operations, with **no uncovered
or obsolete scenarios**, one warmup and two timed requests per operation, and one fresh import
process. The JSON report was written to `/tmp/g16-current-routes.json`. All nine focused
benchmark-tool tests passed. The normal default is now 20 samples per operation, with an
explicit `--samples` range of 1–1000 and `--cold-processes` range of 0–10. Zero cold processes
explicitly records that imports were not measured.

The documented repository command `uv run ruff check .` was also run. It identified an
inherited unused `is_case_path` import in `server/errors.py:22` at this base. That runtime file
belongs to the parent reliability integration and is unchanged in this benchmark commit.
The focused benchmark files pass Ruff.

## Interpretation and safeguards

This is a successful-route smoke measurement under shared-host contention. Two samples do
not estimate a stable p95, demonstrate an improvement, or establish a production SLO. The
report uses the nearest-rank p95 formula and describes its measurement scope explicitly.

Requests go through the production FastAPI app, routes and services, using existing repository
fake authentication, database and provider ports. Exchange prices and read caches are warm;
fake write state and memory rate limits are reset outside each timed request. Case, NPC,
festival and sports database ports are partly function-level fakes. The sports settlement
scenario reads a fresh mocked final result, and its fake source request budget is reset for
each sample. The sports-mine scenario has no stakes; the festival join scenario queues an
unpaired player. These scenarios do not replace SQL, concurrency, provider or browser proofs.

The tool refuses HTTP failures, and intents that encode a game refusal inside HTTP 200 must
return `accepted: true` (or sports settlement `settled: true`). It lists missing and obsolete
method/path pairs against OpenAPI; `--require-all` refuses missing operations. It never logs
request bodies, credentials, player identifiers or case content. Captured fake-port counters
include only normalized table/function route names and explicitly exclude warmup traffic.
Counters describe the selected instrumented fake port, not total external calls; function-level
fakes without transport instrumentation report `null`, not an invented zero.

Socket connects and DNS resolution are blocked during fixture construction and requests.
Cold imports run in fresh processes with an empty environment and the same network blocks;
they import `server.app` without constructing an app or reading deployment settings. Logging
suppression is restored when the benchmark exits or fails. No live database, provider,
credentials, deployment settings, dependencies or historical timing reports changed.
