# WALL-16 · Refresh the route guide after durability changes

> **What this is:** A focused correction to the battle guide's route-cache identity.
>
> **Who uses it:** Players comparing wall upgrades and tower obstacles before a wave.

- **Status:** implementation and focused regressions complete; coordinated browser/full checks and human review pending.
- **Branch:** `fix/wall-16-durability-guide`
- **Issue and draft:** [WALL-16 #257](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/257), [Draft PR #268](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/268)
- **Responsible teammate:** Johannes Franz Lang (`frcola`).
- **Reviewer:** a different human teammate; not requested automatically.

## Why

The guide's key includes each obstacle's position and quarter-health band, but absolute maximum HP also changes breach time. A full-health wall upgrade or HP modifier can therefore keep the old key while changing the actual route cost. The shared tower key has the same risk. Active-wave simulation inputs are normally frozen; this task does not claim a simulation-cache bug.

## Scope and plan

1. Reproduce a same-position/full-band upgrade through real guide inputs and cache updates.
2. Compare the updated cached guide with a fresh route calculation.
3. Include the minimal durability input in the guide key for walls and towers.
4. Match research-derived wall HP to the simulation and preserve within-band cache reuse.
5. Run focused guide/path-grid/pathing tests and report exact results.

Likely files: `frontend/src/pirates/battle-guide.js`, `frontend/tests/pirates/battle-guide.test.js`, this spec and the roadmap handover. No API, database, geometry, balance, wallet or public content contract changes. No new dependency, migration application, live activation or merge.

## Acceptance and evidence

- [x] The regression fails on unchanged source before the fix.
- [x] A full-health level upgrade changes the key and updates a real guide to the fresh result.
- [x] A wall HP modifier and shared tower durability change invalidate the key.
- [x] Ordinary HP changes within one quarter band reuse the key; crossings invalidate it.
- [x] Focused relevant tests pass.
- [ ] Full-suite/build/browser evidence and paired desktop/phone captures are coordinated with the integration owner.
- [ ] A different human reviews the current change after Johannes's explain-back.

## Explain-back

A health percentage alone does not say how long a pirate must hack: 100% of 60 HP differs from 100% of 420 HP. Maximum HP belongs in the route identity while exact HP changes stay grouped into existing quarter bands. The correction affects guide invalidation, not combat rules or upgrade authority.

Questions: Why is a percentage insufficient? Which input changes after an HP upgrade? Why preserve quarter-band reuse and the active-wave frozen-input contract?

## Executed evidence

Base source: `569d8fda3474cb84af36af190853d1a0e02b7abf`. With the new regressions and unchanged production code, the guide test returned **7 failed / 22 passed (29)**. The failures reproduced stale level/skill/tower route updates, the missing research HP input and absolute-HP key reuse. No existing assertion was weakened or skipped.

The correction includes maximum HP in the existing wall/tower key and uses the simulation's existing research HP multiplier in preview input, in the same multiplication/rounding order. A closed ring's south route changes its first wall from `wall_r02` to `wall_r01` after upgrading that wall; the updated cached guide now equals a fresh guide. The shared tower case switches from `cannon_2` to `cannon_1`. Skill and research parity cases use actual simulation results.

Executed from `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/pirates/battle-guide.test.js tests/pirates/pathing.test.js tests/pirates/pathing-wiring.test.js tests/pirates/research-tiers.test.js
```

Result: **Test Files 4 passed (4); Tests 68 passed (68); Duration 4.94s; exit 0**. `git diff --check` passed. Full application/build/budget/a11y/demo/overlap checks and required actual-game before/after at 1280×720 and 375×812 are not claimed here; the integration verification lane owns them. No production/Safari/physical-device proof or merge.
