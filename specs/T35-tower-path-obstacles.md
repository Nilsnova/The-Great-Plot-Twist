# T35 Tower path obstacles

> **What this is:** standing damageable towers become obstacles to boarder movement and routing while the wave rule is enabled.
> **Who uses it:** the wave simulation, battle guide, wave-rule server and reviewers of issue #84.

- **Status:** implementation in progress on `feat/tower-path-obstacles`; draft PR #84. Decision D058 is proposed; implementation is authorized for review, while team balance/review remain open.
- **Issue:** [#84](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/84)
- **Responsible teammate:** Ianno (`Iannomh123456`)

## Contract

- The off-by-default `tower_obstacles` wave rule is present only when both `pathing` and `tower_health` are enabled. The existing frozen-wave table carries the rule set to every client. The additive migration extends its known-name check; disabling the flag is the rollback.
- Under the rule, a standing cannon, mortar, harpoon, culverin or swivel nest blocks boarder movement over its T36 tower-slot square. The size comes from `frontend/src/island/placement.js` `FOOTPRINTS.tower`, which mirrors `backend/content/island_layout.json`. Houses and watchtowers remain passable. Tower hit points, including breaks, repairs and rebuilds during a wave, determine whether the shape blocks. The accepted D055 swivel nest is included because it is a damageable tower in a tower slot.
- The path field compares detour cost with breaking a tower, using the same live-HP hack cost used for walls. A route that chooses a tower reaches its boundary and attacks it. Its square opens when hp reaches zero and blocks again when hp rises above zero. A boarder enclosed by a rebuild can leave through a legal neighboring cell. Movement collision also prevents corner cuts.
- Target order remains captain, wall, tower, heart. Tower reach and approach use distance to the footprint edge. Walls retain their current footprint, breach cost and decision logic.
- The battle guide uses the same path function, tower positions and wave HP snapshot as the sim. A preview uses the most recent known wave rule set. Without `tower_obstacles`, the current route preview is unchanged.
- D056's server wall lanes remain static placement guidance derived from baseline paths. T35 changes live route fields for a wave carrying the frozen rule; it does not rewrite or regenerate wall-lane data.
- In a live wave, `controller.js` filters culverins from the shared `current.defenses` array unless the frozen `defenses_v2` rule is enabled, and passes that same array into `createWave`; `sim.js` applies the same gate before exposing `state.towers`. The guide's full-HP fallback is used only for between-wave previews where `stateTowers` is null, so the live guide cannot add a culverin omitted by the simulation.
- The feature adds no between-wave tower persistence, repair policy or payment behavior. Existing T33 in-wave tower rules remain in force; a later separately reviewed feature can change them.

## Verification

### Historical results before mainline reconciliation

The following measurements were made on the original T35 branch based on `e8c61c64`, before its merge with current main at `a9386656`. They document the original implementation; they are not current full-suite, multiplayer, performance, or balance sign-off for the reconciled branch.

- Focused cases covered T36 footprint parity; routing through a cheap tower breach; opening a route after break and restoring blocking after rebuild; collision and boundary-target cases; guide/sim route parity; deterministic replay; and feature-off event equality.
- Before the final enclosed-boarder edge fix, `cd frontend && npm test -- --reporter=verbose` passed 274 files and 3,348 tests. After that fix, the affected suite `npm test -- --reporter=verbose tests/pirates/pathing-wiring.test.js tests/pirates/pathing.test.js tests/pirates/wall-blocking.test.js tests/pirates/tower-health.test.js tests/pirates/battle-guide.test.js tests/pirates/tower-obstacles.test.js tests/pirates/tower-obstacle-performance.test.js tests/pirates/wave-rules.test.js` passed 8 files and 76 tests. `npm run build` and the bundle budget passed on that pre-reconciliation branch.
- The original focused workload simulated 300 boarders × 3,000 ticks in 1,897 ms (0.632 ms/tick), with 111 field builds, 5,547 tower-target ticks, 37 rebuilds, 7,071 heart arrivals, 887,382 movement steps, and no stuck outcomes. This is a pre-reconciliation workload result, not a quiet-machine benchmark for the current branch.
- `npm run test:rules` matched both desktop clients for 451 ticks, with 80/80 initial tower HP, matching repairs, and a frozen rule set after pathing was switched off for later waves. Captures: [two-client evidence](../docs/evidence/T35-tower-obstacles/README.md).
- The original multiplayer attempt passed the two-client captain revive (1.6 s Medic hold and 75/100 HP on both clients), then timed out on a pause control detached from the DOM. The unchanged `e8c61c64` comparison also passed the revive and timed out later in the pause/break flow. These are historical results only.
- Original backend results were 536,584 passed and 282 skipped; Ruff passed; the scratch PostgreSQL suite applied migrations twice and passed 221 tests. The original build budget reported a cold title of 18,723 JavaScript bytes and 8,550 CSS bytes against 21,080 / 12,000 byte limits.
- The original three-seed smoke at waves 15, 30 and 60 confirmed that obstacles were exercised, but was explicitly not enough seeds for balance approval. No balance sign-off was granted.
- Red/green regressions showed the closed-ring breach fail before tower-aware fields and pass afterward; the five-tower cross case reached the heart without crossing another footprint after the enclosed-boarder fallback fix.

### Reconciled branch results

Reconciled code is on `feat/tower-path-obstacles`, with main integrated through `a9386656` and the docs-only update through `937b1b56`. The feature flag remains off. These are the checks run on the reconciled branch; entries marked pending have not been rerun.

- Focused T35/mainline Vitest coverage passed 9 files and 98 tests: tower-obstacle geometry, battle guide, wall lanes, tower health, pathing wiring, pathing, wall blocking, wave rules, and tower trees.
- Root's independent T35 check passed 4 files and 33 tests, including a performance exercise. It took 17.89 s while other suites were running, so that runtime is not a quiet-machine performance measurement.
- Full backend: `UV_CACHE_DIR=/tmp/tower-path-uv-cache uv run pytest -q` passed 536,623 tests and skipped 283 in 1,356.42 s.
- Disposable PostgreSQL scratch suite: `CASE_PG_SCRATCH=1 UV_CACHE_DIR=/tmp/tower-path-uv-cache uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql` passed 246 tests in 14.39 s.
- `UV_CACHE_DIR=/tmp/tower-path-uv-cache uv run ruff check .` passed. The documented pglast parse command parsed all 50 migration files.
- The latest multiplayer integration attempt passed pause/resume, upgrade, and next-wave checks, then failed a later musket-pose assertion (0/2). A controlled rerun/diagnosis is pending; this outcome is unresolved and is not counted as a passing multiplayer check.
- Full frontend suite, a fresh build/budget check, balance run, final multiplayer/browser run, and a quiet-machine performance measurement on the reconciled branch remain pending. The old full frontend/build/budget, two-client rule, balance, and workload numbers above are historical only.

## Current limits

This branch is not approved for release. The feature flag remains off in code and no database has been changed. The small balance sample and desktop browser checks do not approve flag-on balance, phone performance, or production realtime behavior.

## Review and handover

Keep PR #84 as a draft until reconciled verification and documentation are complete. Franz (`@frcola`) is the required human reviewer; Ianno manually reviews every PR. Approval must cover the current revision and required checks must pass. The agent must not merge or enable auto-merge. Franz may merge manually after the approvals and checks are complete.
