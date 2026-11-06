# G16 checkpoint 1 — server reliability

- Responsible teammate: Nils; branch `chore/g16-reliability`, based on and merged with `origin/main` (`c26f303`). No main push.
- Measured all 20 production API method/template pairs with TestClient: 1 warmup + 200 successful calls each, sockets blocked, supplied settings and existing fakes only. Generated local-only docs routes excluded.
- Repeat: `cd backend && UV_CACHE_DIR=/workspace/.cache/uv uv run --locked python tools/benchmark_routes.py --output /tmp/g16-routes.json`.
- Full per-route p50/p95 and fake-service counts: [before](g16-server-before.json), [after](g16-server-after.json). Fake state reset outside timing; logging sinks disabled in both runs. These are Python/TestClient timings, not live-network latency.
- Public story p50/p95: **1.761/2.290 → 1.255/1.740 ms**. Bounded revision-keyed public byte cache removes repeated JSON parsing/serialization; update/removal regression tests pass.
- `/me` p50/p95: **2.970/4.652 → 2.730/3.351 ms**; its four distinct DB reads remain fresh and fail-fast, not cached. The variation on unchanged routes is measurement noise, not an optimization claim.
- Portfolio p50/p95: **3.135/4.534 → 2.782/3.456 ms**; four distinct fake reads remain. Crew join uses four calls; pre/post-start crew reads are intentional. No duplicate query eliminated or private response cached.
- Cold app import measured in five fresh processes per run; see reports. FastAPI/Pydantic dominate; defer import refactoring rather than hide work on a first gameplay request. No cold-start speedup claimed.
- G10 cache default is absent on this main: added app-wide `private, no-store`, including 401/404/422/500, preserving explicit short public cache headers. Successful private market responses also covered.
- JSON request logs contain only effective route template, status, duration_ms. Unmatched paths become `unmatched`; raw Uvicorn access logging and httpx URL logging are suppressed. Unexpected exceptions keep the standard 500 without raw exception/path/traceback disclosure.
- Gates (`set -o pipefail`): backend **3109 passed** plus **9 request-policy tests passed** after the independent review addition; Ruff clean; frontend **288 passed**; build + 51-file spoiler guard passed. Full backend total is now 3110 tests.
- Post-commit secret gate: `UV_CACHE_DIR=/workspace/.cache/uv uv run --no-project --with detect-secrets python scripts/check-diff-secrets.py`; requires zero findings on `git diff origin/main...HEAD` before push. Scanner lives only in uv cache.
- Independent read-only server review found no blocking issue; its successful private-response cache suggestion was added and passed.
- No live Supabase, `.env`, credentials, outside load test, dependency/lockfile, migration, `vercel.json`, STATUS or DECISIONS changes. Public header/config proposals follow in checkpoint 3.
