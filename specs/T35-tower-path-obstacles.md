# T35 Tower path obstacles

> **What this is:** standing damageable towers become obstacles to boarder movement and routing while the wave rule is enabled.
> **Who uses it:** the wave simulation, battle guide, wave-rule server and reviewers of issue #84.

- **Status:** implementation in progress on `feat/tower-path-obstacles`; draft PR pending. Decision D054 is proposed; implementation is authorized for review, while team balance/review remain open.
- **Issue:** [#84](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/84)
- **Responsible teammate:** Ianno (`Iannomh123456`)

## Contract

- The off-by-default `tower_obstacles` wave rule is present only when both `pathing` and `tower_health` are enabled. The existing frozen-wave table carries the rule set to every client. The additive migration extends its known-name check; disabling the flag is the rollback.
- Under the rule, a standing cannon, mortar, harpoon or culverin blocks boarder movement over its T36 tower-slot square. The size comes from `frontend/src/island/placement.js` `FOOTPRINTS.tower`, which mirrors `backend/content/island_layout.json`. Houses and watchtowers remain passable. Tower hit points, including breaks, repairs and rebuilds during a wave, determine whether the shape blocks.
- The path field compares detour cost with breaking a tower, using the same live-HP hack cost used for walls. A route that chooses a tower reaches its boundary and attacks it. Its square opens when hp reaches zero and blocks again when hp rises above zero. A boarder enclosed by a rebuild can leave through a legal neighboring cell. Movement collision also prevents corner cuts.
- Target order remains captain, wall, tower, heart. Tower reach and approach use distance to the footprint edge. Walls retain their current footprint, breach cost and decision logic.
- The battle guide uses the same path function, tower positions and wave HP snapshot as the sim. A preview uses the most recent known wave rule set. Without `tower_obstacles`, the current route preview is unchanged.
- In a live wave, `controller.js` filters culverins from the shared `current.defenses` array unless the frozen `defenses_v2` rule is enabled, and passes that same array into `createWave`; `sim.js` applies the same gate before exposing `state.towers`. The guide's full-HP fallback is used only for between-wave previews where `stateTowers` is null, so the live guide cannot add a culverin omitted by the simulation.
- The feature adds no between-wave tower persistence, repair policy or payment behavior. Existing T33 in-wave tower rules remain in force; a later separately reviewed feature can change them.

## Verification

- Focused tests: T36 footprint parity; actual routing through a cheap tower breach; opened routes after break and restored blocking after rebuild; collision and boundary-target cases; guide/sim route parity; deterministic replay; feature-off event equality.
- `cd frontend && npm test -- --reporter=verbose`: 274 files, 3,348 tests passed. `npm run build` passes including the spoiler guard.
- Focused tower performance case: 300 boarders × 3,000 ticks, 1,546 ms total (0.515 ms/tick), 115 field builds, 5,379 tower-target ticks, 37 rebuilds, 8,498 heart arrivals, 886,123 movement steps, zero stuck outcomes.
- `npm run test:rules`: both desktop clients enabled `tower_health`, `pathing`, and `tower_obstacles`; matching deterministic state for 451 ticks, 80/80 initial tower HP, matching repairs, and a frozen rule set after pathing was switched off for later waves. Captures: [two-client evidence](../docs/evidence/T35-tower-obstacles/README.md).
- `npm run test:mp -- /tmp/tgpt-mp/T35-recheck` reaches and passes the two-client captain revive (1.6 s Medic hold and 75/100 HP on both clients), then times out on a pause control detached from the DOM. An unchanged `e8c61c64` run also passed the revive and timed out later in the pause/break flow; this does not count as a passing full multiplayer check. No browser errors were recorded.
- Backend: `UV_CACHE_DIR=/tmp/tower-path-uv-cache uv run pytest -x -q` reports 536,584 passed and 282 skipped in 765.32 s. Ruff passes. Disposable PostgreSQL scratch suite applies all migrations twice and reports 221 passed, including the new tower-rule allowlist/freeze case.
- `node scripts/report-budget.js --check`: passes; cold title is 18,723 JavaScript bytes and 8,550 CSS bytes, below the 21,080 / 12,000 byte limits; no title image or unshipped assets.
- A 3-seed balance smoke comparison at waves 15, 30 and 60 (wall spots and ring layouts): at waves 15/30 both rule sets win with 100 hp. At wave 60, the spots layout is 67% wins / 42 mean hp both ways; with obstacles, mean towers broken is 0.7 vs 0.3, wall hacks 498 vs 516.7 and boarders landed 174.7 vs 176. For the ring, both sets lose with 0 hp; obstacles result in 2.3 towers broken vs 0, wall hacks 347 vs 385.3 and both have 188.3 landed. This sample confirms the new behavior is exercised but is not enough seeds for balance approval; no retuning was made.

## Current limits

This branch is not approved for release. The feature flag remains off in code and no database has been changed. The small balance sample and desktop browser checks do not approve flag-on balance, phone performance, or production realtime behavior.
