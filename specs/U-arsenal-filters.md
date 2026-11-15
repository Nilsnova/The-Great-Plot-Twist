# Filter and group the shared arsenal inventory

- Lane: U, approved addition; https://github.com/Nilsnova/The-Great-Plot-Twist/issues/97.
- Responsible: Johannes Franz Lang (@frcola), with Codex assistance.
- Branch: `feat/u-arsenal-filters`, main `e8c61c6`.
- Status: implemented and checked; existing main accessibility findings and human review remain.

## Goal

Add All, Available and Carried filters with counts and group the rack by weapon type. Preserve every copy id, holder and existing Take/Swap rules. Filters are local view state only, with clear empty states.

## Acceptance

Empty/full 20-slot rack, carried copies, stable ordering and ids, repeat renders, empty filtered results, pending/wave restrictions, keyboard and phone target/overflow checks; no reads/writes from changing filters.

## Scope

frontend/src/island/arsenal-model.js, arsenal-ui.js, arsenal.js and island.css; focused model/controller and browser tests. No login/API/backend/database/dependency/game-rule changes. Reuse current helpers; one small feature per PR. Controlled fixtures are not live-server or physical-phone evidence. No merge authorized.

## Implementation

rackView computes counts and a new ordered array without mutating the server answer. arsenalModel keeps the legacy rack model order and adds sorted groups for the UI. arsenal.js retains only a local filter id; its handler redraws without a GET or write. arsenal-ui.js renders native pressed-state buttons, grouping and a Show all recovery for empty filtered results.

A rack with 20 stored copies can additionally have carried copies, so All and Carried counts must not be storage-slot counts. Grouped display preserves individual ownership and ids; every financial/availability restriction remains in the existing model/server.

## Test map and limits

10 new cases: 20 stored plus carried copies, stable ordering and immutable input, all empty views, bad optional filters/input, pending/wave restrictions, retained filter on refresh, keyboard/phone controls, no request from filtering, exact copy id for intentional Take and recovery when the chosen filter becomes empty.

Filters last for this controller session, not browser storage. They do not change stock, reclaim another captain weapon or grant permission. Real multi-client races/SQL, physical phones and screen readers are not covered by these controlled UI tests.

## Verification (15 Nov 2026)

Main `e8c61c6` plus this feature; Node 24 and installed Chrome. Commands ran from `frontend/` unless noted.

| Check | Exact result |
|---|---|
| `npm install` | Exit 0; existing manifest and lockfile retained. |
| `npx vitest run tests/island/arsenal-filters.test.js tests/island/arsenal-filters-dom.test.js (with existing card/arsenal tests)` | Test Files  4 passed (4); Tests  29 passed (29) |
| `npm test` | Test Files  274 passed (274); Tests  3344 passed (3344); Duration  242.12s (tests 87%, import 10%, transform 2%) |
| `npm run build` | ✓ built in 445ms |
| `node scripts/report-budget.js --check` | Exit 0; initial JS 18723/21080 bytes; CSS 8550/12000 bytes; no title image. |
| `node scripts/text-lint/index.mjs (repository root)` | Text lint: 4010 candidate strings in 445 source files; 0 errors, 8 report-only findings. |
| `npm run test:a11y` | Exit 1; 33 screens; market-placed contrast at 1280/375/320px; page errors: []. |
| `npm run test:demo` | Exit 0; 33 checks; errors: []; external: []. |

The legacy rack model keeps server order so its existing ownership/action assertions remain unchanged. Only the added groups view changes presentation order. No existing test was changed.

The accessibility command is **not green**: an unchanged main worktree reproduced exactly the same three contrast findings (market step button, ratio 3.9664). [Baseline proof](../docs/evidence/U-arsenal-filters/baseline-a11y.json). Market code/styles and the audit script are unchanged. No attempt was made to bypass this check or absorb that separate issue into this feature.

Four before/after screenshots at 1280x720 and 375x812 use real UI with synthetic snapshots, the game's shared stylesheet order and original/main versus changed modules/styles; [evidence and limits](../docs/evidence/U-arsenal-filters/README.md). Fixture reports: zero page errors / external requests. Relative documentation targets, conflict markers, whitespace, unchanged API files and screenshot dimensions checked.

Not verified: backend pytest/Ruff (no backend edits), physical phones, screen readers, live login/Supabase/Realtime or real database settlement. The multiplayer command was not rerun for this read-only arsenal display branch. These sibling features are based on main and tested independently, not as a combined release. Their shared Arsenal/docs files must be reconciled and rechecked as individual PRs are reviewed/merged.

Remaining: author review and independent human review; keep draft. No main push, force push, deleted file, migration, game-rule change or merge.
