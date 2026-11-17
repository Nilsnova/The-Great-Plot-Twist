# WALL-38 — production HTTP to private PostgreSQL

For Johannes Franz Lang (`frcola`), [issue #312](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/312). Base: aggregate `dc6f80ef`; isolated test branch. This uses the existing real app, mock sign-in transport and narrow ScratchRecoveryAdmin with the private Unix-socket PostgreSQL fixture. No live credentials/network client are used.

Plan: fund a declared owner fixture with all original IDs unlocked; actual HTTP enable; purchase the measured 102-piece ring in four canonical bounded batches; verify exact real wallet/contribution/receipt/GET/retry state; pause new offers while retaining paid state; negotiate actual public start/join/current with frozen config 2/pathing and explicit old-client refusal. If bounded, exercise actual double reset with identical empty layout/role/wave and stale quote epoch without expense. Keep the adapter whitelist explicit and preserve W32's negotiated start support.

WALL-36 owns direct-SQL V1 build/repair/refund/instance lifecycle; this task checks the production HTTP/RPC boundary and first wave. No new QA platform, runtime package, live migration application, activation, deployment or merge. Tests/checks pending; physical devices, Safari and final visual acceptance are separate.

## Implemented and verified

Draft [#319](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/319) adds two bounded actual HTTP/private-SQL tests and six explicit RPC whitelist entries. The W40 decoder dependency is separately reviewed in #321; it is needed to consume the real 102-row health response rather than the old 50-row limit.

The first test funds a declared stage-100 fixture and purchases the measured 102-piece ring through the production APIs in four bounded batches. It verifies 1,020 coins debited, 102 contribution rows, four immutable receipts, GET coordinate identity, same-UID no-charge replay, paused-offer refusal and an existing wall moved out/back without charge under the complete 116-row layout CAS. Its first public supported start/join/current agrees on config 2, pathing, perimeter mode and all 102 frozen structures. Old-client start/join refuses explicitly. The real 102-row recovery HTTP response and frozen snapshot also pass the production JavaScript validators/client decoder under Node; no browser renderer is implied.

The second test performs actual HTTP reset twice. Empty layout, role and wave can match across the resets, but an old quoted epoch still refuses with quote_changed before any expense/receipt.

Executed from backend with workspace uv cache and the existing project environment:

```sh
CASE_PG_SCRATCH=1 uv run --frozen --no-env-file --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_perimeter_http_pg.py -x
uv run --frozen --no-env-file ruff check .
uv run --frozen --no-env-file ruff format --check server/tests/structure_recovery_pg.py server/tests/island_sql/test_perimeter_http_pg.py
```

Final result: **2 passed in 5.23s**, Ruff **All checks passed!**, format **2 files already formatted**; diff/content checks passed. The private fixture applies repository migrations twice in its disposable Unix-socket database; no live URL/credential is used. Mock sign-in/weather are declared; production HTTP handlers and SQL replies remain real. A small Node transport wrapper only feeds the actual captured health response into the production client read method.

Not verified here: physical devices, Safari, actual browser interaction/performance, live database rollout, final art quality or the separate damaged-V1 repair/refund lifecycle owned by WALL-36. No live migration application, activation, deployment or merge.

Explain-back: I used the same API routes the app calls with a real disposable database, so wrong arguments or database constraints cannot hide behind a fake reply. I bought the ring in four runs because each quote/build is bounded to 32 pieces. Then I checked that the first wave and the client actually receive every paid piece. These are test funds and declared progress, not a production account.

Questions: What does this catch that a fake RPC test cannot? Why test added IDs before another wave/template exists? Why does the private migration fixture not authorize a production migration?

## Combined Node graph follow-up

The later aggregate client graph imports campaign JSON in the Vite style. Plain Node 24 requires JSON import attributes, so the combined check exposed ERR_IMPORT_ATTRIBUTE_MISSING before it could run the unchanged decoder assertions. The test now uses the same registerHooks JSON-attribute pattern as frontend/scripts/balance-rules.mjs and dynamically imports production modules after hook registration. No assertion, actual HTTP action or actual health payload is removed/replaced. The full aggregate decoder graph import smoke passed; the coordinated owner reruns the combined HTTP/SQL lane. This writer's prior 2-test result remains scoped to its stated base rather than being relabeled as a new aggregate pass.
