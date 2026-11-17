# WALL-03: bounded perimeter-wall catalogue and recognition

Responsible human: Johannes Franz Lang (`frcola`). Draft implementation authorized on 17 November 2026 by the request for walls around the buildable island perimeter. Tracks [WALL-03 #244](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/244). No merge, migration application or live activation.

## Scope and plan

1. Preserve the existing 22 legacy spots and D060 tower behavior.
2. Add a pure catalogue adapter for the trusted capacity selected by the service: 12 legacy or 128 perimeter walls, reusing wall rules/prices/unlocks.
3. Keep added IDs inventory-only: no unpaid world positions or fallbacks to `(0,0)`.
4. Read the complete bounded whole-island building set and refuse overflow rather than silently truncate it.
5. Recognize only exact stable IDs `wall_1` through `wall_128` in the browser; show added pieces only from built, positioned authoritative answer rows.
6. Exercise identity boundaries, missing coordinates, legacy behavior, complete reads and overflow; hand over exact checks and limits.

Likely implementation files: `backend/server/island/catalogue.py`, `backend/server/island/store.py`, `frontend/src/island/spots.js`, new `frontend/src/island/wall-cohort.js`, and focused backend/frontend tests. The layout writer owns shared Python identity constants; service/policy/placement/recovery/SQL and builder controls are separate tasks.

## Evidence and limits

Read-only measurement found a 102-piece edge-sharing coast-following ring on current land, clear of fixed keep-outs and all default non-wall sites including D060. A bounded 128 pieces leaves 26 for compartments. Fixed shoreline services may lie outside the inset enclosure; no claim encloses every protected coastal object. The ring needs actual persisted construction and combat evidence in the integration gate.

This slice does not enable the policy, sell new pieces, apply migrations, change geometry/health/economy, create reserved empty sites or implement the complete builder. Invalid IDs, wrong types, missing positions and over-capacity reads must fail or remain absent safely. Proposed free-grid rules must not relocate paid old walls on read.

## Implemented slice and handoff

Draft [#276](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/276) is stacked on trusted-layout Draft [#271](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/271), using its shared Python identity constants. Earlier claim #272 is closed unmerged and its branch retained; no force push was needed.

`with_wall_capacity` adds exactly the 116 admitted identities by copying the legacy wall template. It preserves existing prices, campaign rules, D060 kinds and the original catalogue. The full selected island has 142 spots; building reads include those plus four home plots. A 147th sentinel row or duplicate identity refuses the read rather than returning a partial or overwritten paid island.

Browser definitions for additional walls have no default coordinates. Only built, correctly typed, finite-position answer rows become offered spots, interaction zones or defenses; malformed and duplicate identities do not fall back to `(0,0)`. The original 22 legacy spots and four conditional tower definitions remain unchanged.

Exact focused checks, using the existing installed backend environment:

```sh
# From backend/
/workspace/The-Great-Plot-Twist/backend/.venv/bin/python -m pytest -q server/tests/test_wall_cohort.py server/tests/test_more_tower_spots.py server/tests/test_wall_policy_layout.py
/workspace/The-Great-Plot-Twist/backend/.venv/bin/ruff check server/island/catalogue.py server/island/store.py server/tests/test_wall_cohort.py
# From frontend/
npm test -- --maxWorkers=1 tests/island/wall-cohort.test.js tests/island/spots.test.js tests/island/extra-spots.test.js tests/island/placement.test.js
```

Results: **55 passed in 1.85s**; Ruff **All checks passed!**; Vitest **Test Files 4 passed (4), Tests 55 passed (55), Duration 3.83s**. `git diff --check` passed. A new-test expectation initially compared against the unflagged catalogue; it was corrected to assert preservation of the actual D060/culverin-enabled input.

Remaining: service selection/filtering, trusted atomic layout reads, database admission, positioned construction, recovery/frozen-wave integration and the actual builder/world presentation belong to their separate tasks. In particular, world rendering still needs its static spot loops adapted by the integration owner. No full build/budget/browser or actual new-world screenshot is claimed for this data-only slice; the coordinated integration gate must provide them before release. The external measured ring also exposed a real near-shore boarder-spawn-inside-wall case; combat entry needs its own regression and fix before perimeter acceptance.
