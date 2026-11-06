# G21 checkpoint 1 — Act 1 correctness

Prepared for Nils on 6 November 2026 on `test/g21-backend`, based on `origin/main`.

## Changed

Added backend-only graph helpers, an offline Node parity runner, story tests and referee tests.
No existing tests, application code, case content, dependencies or protected files changed.

- Exhaustive reachable graph: 122 semantic states, 254 accepted edges, eight terminal states.
- Every declared scene/ending is reachable. Reverse reachability proves every state can finish,
  including states inside cycles; a nonempty action list alone would not prove this.
- Every state is probed with all 17 declared action IDs plus an unknown ID: 2,196 probes.
  Independent content interpretation checks action availability and complete state transitions;
  rejected moves preserve state. Python/browser states, messages, choices, notes and browser
  save/resume agree. Another 32 seeded histories exercise longer order-dependent traces.
- The referee checks 141 complete edge-covering routes plus 64 seeded walks against an independent
  four-kit oracle, covering every edge and all eight ending/decision/logbook profiles. Every
  nonterminal canonical prefix is refused as incomplete.

Cycles permit infinitely many move logs. Coverage exhausts the finite semantic graph, not every
possible length of history. No source bug was demonstrated; no source fix was made.

## Verified

Before this checkpoint: `git fetch origin main && git merge --no-edit origin/main` reported
already up to date at `c26f3032b150af970d57fbbcd6eea439eb26f4c4`.

From `backend/`, with `UV_CACHE_DIR=/workspace/.cache/uv` and `UV_OFFLINE=true`:

```sh
uv run pytest -q && uv run ruff check .
```

Result: **3,105 passed in 17.10s; All checks passed!** No skipped or xfailed tests.
Tests use no external network or credentials; Node imports only the existing public story engine.

Staged-change credential-pattern scan: **zero findings** across this checkpoint's six files.
The standard-library scan checks private keys, GitHub tokens, AWS access-key IDs, service tokens,
JWTs and credential-bearing HTTP URLs without printing matching values. It does not inspect
private case content or claim a full-history/entropy audit. The scanner's patterns are recorded
in the final G21 report.

## Remaining

C2 settings/weather/names/market arithmetic and C3 report follow. Current `main` contains the old
spot/amplified-price Exchange: the requested 10× position and zero-close APIs do not exist yet.
Their coverage must follow the Exchange implementation; G21 will not add that feature.
No PR or merge into `main` is part of this checkpoint.
