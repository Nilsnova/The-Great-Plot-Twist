# WALL-16 · Refresh the route guide after durability changes

> **What this is:** A focused correction to the battle guide's route-cache identity.
>
> **Who uses it:** Players comparing wall upgrades and tower obstacles before a wave.

- **Status:** in progress; reproduction comes before the correction.
- **Branch:** `fix/wall-16-durability-guide`
- **Issue:** [WALL-16 #257](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/257)
- **Responsible teammate:** Johannes Franz Lang (`frcola`).
- **Reviewer:** a different human teammate; not requested automatically.

## Why

The guide's key includes each obstacle's position and quarter-health band, but absolute maximum HP also changes breach time. A full-health wall upgrade or HP modifier can therefore keep the old key while changing the actual route cost. The shared tower key has the same risk. Active-wave simulation inputs are normally frozen; this task does not claim a simulation-cache bug.

## Scope and plan

1. Reproduce a same-position/full-band upgrade through real guide inputs and cache updates.
2. Compare the updated cached guide with a fresh route calculation.
3. Include the minimal durability input in the guide key for walls and towers.
4. Verify skill-derived wall HP and preserve within-band cache reuse.
5. Run focused guide/path-grid/pathing tests and report exact results.

Likely files: `frontend/src/pirates/battle-guide.js`, `frontend/tests/pirates/battle-guide.test.js`, this spec and the roadmap handover. No API, database, geometry, balance, wallet or public content contract changes. No new dependency, migration application, live activation or merge.

## Acceptance and evidence

- [ ] The regression fails on unchanged source before the fix.
- [ ] A full-health level upgrade changes the key and updates a real guide to the fresh result.
- [ ] A wall HP modifier and shared tower durability change invalidate the key.
- [ ] Ordinary HP changes within one quarter band reuse the key; crossings invalidate it.
- [ ] Focused relevant tests pass; full-suite/build/browser evidence is coordinated with the integration owner.
- [ ] A different human reviews the current change after Johannes's explain-back.

## Explain-back

A health percentage alone does not say how long a pirate must hack: 100% of 60 HP differs from 100% of 420 HP. Maximum HP belongs in the route identity while exact HP changes stay grouped into existing quarter bands. The correction affects guide invalidation, not combat rules or upgrade authority.

Questions: Why is a percentage insufficient? Which input changes after an HP upgrade? Why preserve quarter-band reuse and the active-wave frozen-input contract?
