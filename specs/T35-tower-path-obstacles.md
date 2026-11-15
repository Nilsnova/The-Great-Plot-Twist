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
- The feature adds no between-wave tower persistence, repair policy or payment behavior. Existing T33 in-wave tower rules remain in force; a later separately reviewed feature can change them.

## Verification plan

- Focused tests: T36 footprint parity; actual routing through a cheap tower breach; opened routes after break and restored blocking after rebuild; collision and boundary-target cases; guide/sim route parity; deterministic replay; feature-off event equality.
- Check disabled-rule fingerprints against main. Do not rederive a fingerprint unless the enabled behavior is the direct cause and the reason is recorded.
- Run `npm test`, `npm run build`, performance case for a representative late wave and `npm run test:mp` when the frontend branch is coherent. Run backend wave-rule and migration contract tests; use the scratch PostgreSQL check if available.
- Before enabling any flag: review balance on representative islands and seeds, test two clients together and inspect a battle-guide screenshot.

## Current limits

This branch is not approved for release. The feature flag remains off in code and no database has been changed. Balance and phone performance need separate measurements before anyone enables it.
