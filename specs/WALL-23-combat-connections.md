# WALL-23: wall connections during combat

Responsible teammate: Johannes Franz Lang (`frcola`). Task: [WALL-23 #264](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/264). Base: `569d8fda3474cb84af36af190853d1a0e02b7abf`. Branch: `feat/wall-23-combat-connections`.

Johannes authorized implementation of the reference-village/wall roadmap. This slice reuses the existing exact full-side 2×2 topology and material helper in the combat renderer. It introduces no barrier, collision, repair or payment authority.

## Bounded plan

1. Adapt frozen defense posts and current simulation wall HP to standing wall inputs for the existing topology helper.
2. Add one owned connection group to the wave renderer; world connections already step aside during battle.
3. Open a span at actual zero HP and restore only when accepted simulation state is positive. Visual events alone cannot restore it.
4. Preserve the renderer's explicit between-wave `setDefenses` health override, while active waves continue to use frozen geometry and live HP.
5. Cache the standing identity/layout/level signature so ordinary positive HP changes do not rebuild topology or geometry; keep joins outside picking.
6. Test exact contacts, real gap/breach/repair transitions, wrong-instance recovery rejection and visibility/disposal; hand actual captures to the shared verification lane.

## State and lifetime contract

Simulation wall state currently exposes ID, HP and maxHP but no instance ID. Its `applyRecoveryEvent` validates frozen instance, maxHP and repair sequence before changing HP. The connection layer therefore consumes actual simulation state and never independently trusts a repair animation/event payload. Tests exercise that actual state authority. Future frozen-input/cohort work remains in its owning tasks.

The renderer's existing `setDefenses` contract is called only after the wave is done, when paid repairs/rebuilds in the break may override the old final HP. This handoff does not reread live village coordinates during an active wave. Material restyling belongs to VIS-14; this task preserves the existing level-color ordering and old twelve-piece support while new free-grid/cohort work proceeds separately.

## Required evidence

- Mixed-level full-side lines/corners connect; partial, diagonal, overlapping and separated pieces do not.
- Real zero HP opens both adjacent spans. A refused/wrong-instance repair and a visual repair event do not close it; an accepted positive simulation state does.
- Ordinary positive HP damage retains the same geometry. Movement/level/standing changes rebuild only the affected topology presentation, without mutating simulation inputs.
- Hidden/removed wave views leave no visible or pickable joins. Dispose is idempotent; geometries/materials are released once.
- Actual-game before/after at 1280×720 and 375×812 is required from the coordinated capture lane; unit scene objects are not a production/browser capture.

No new dependencies, migrations, recovery activation, deployment or merge. Keep Draft pending actual evidence, explain-back and a different human review.

## Implemented and verified scope

`pirates/wall-connections.js` adapts frozen post geometry and accepted live HP, then calls the existing full-side topology/material helper. `pirates/render.js` owns one connection group. Its positive/zero membership signature ignores ordinary HP amounts, joins are excluded from raycasting, and teardown releases geometry/material once. The existing explicit post-wave health handoff remains supported.

Executed from `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/pirates/wall-connections.test.js tests/island/wall-connections.test.js tests/pirates/render.test.js tests/pirates/recovery-snapshot.test.js
```

Exact result: `Test Files  4 passed (4)`, `Tests  31 passed (31)`, `Duration  1.79s`, exit 0. New cases cover exact mixed-level contacts, 119 positive HP ticks without geometry replacement, both adjacent spans opening at zero, tiny-positive restoration, actual V1 wrong-instance/repeated-repair rejection, ignored animation-only repairs, explicit break/visibility handoff, raycast exclusion and idempotent disposal. The renderer's precise root-object count increases by one owned group.

JavaScript syntax and `git diff --check` also passed. Browser captures and combined build/budget/UI checks remain with the coordinated verification lane; the unit scenes are not production or actual-browser evidence. Human explain-back and independent review remain pending.
