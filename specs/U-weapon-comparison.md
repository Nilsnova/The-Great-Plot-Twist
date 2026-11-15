# Compare arsenal weapons with the carried weapon

- Lane: U, approved addition; https://github.com/Nilsnova/The-Great-Plot-Twist/issues/95.
- Responsible: Johannes Franz Lang (@frcola), with Codex assistance.
- Branch: `feat/u-weapon-comparison`, main `e8c61c6`.
- Status: implemented and checked; existing main accessibility findings and human review remain.

## Goal

Offer an optional direct comparison of damage per hit, range, reload time and firing mode against the carried weapon. Reuse captainStats with the current level, learned skills and role. Do not rank a different firing mode as universally better.

## Acceptance

All weapon types, level/skill/role effects, same type and rounding; native keyboard comparison disclosure at desktop/phone widths; no buy/take side effects.

## Scope

frontend/src/island/arsenal-model.js, arsenal-ui.js, arsenal.js, ui.js, island.css and index.js; focused model and browser tests. No login/API/backend/database/dependency/game-rule changes. Reuse current helpers; one small feature per PR. Controlled fixtures are not live-server or physical-phone evidence. No merge authorized.

## Implementation

index.js supplies the existing learned skills/role to the arsenal controller. arsenal-model.js calls the same captainStats calculator for both weapons and formats rounded differences. arsenal-ui.js draws native details/summary and a definition list; ui.js preserves open comparisons/focus by stable copy/shop keys on redraw.

Reuse the real combat calculator, not a parallel formula or a universal weapon score: cone, pierce and area shots are not comparable by per-hit damage alone. Details remain optional so the card stays compact. No comparison opens or sends a transaction.

## Test map and limits

10 new cases: all five types, exact deltas, same type, invalid ids, learned skills/role/level, minimum reload and rounding, immutable server answer, native comparison at desktop/phone widths, actual fake-server learned skill, retained disclosure after refresh and no write from comparison.

Per-hit numbers do not predict fleet outcomes, aim, pierce alignment or total area damage. Real provider/login/database behavior, physical phones and a screen-reader session are not covered. The UI word compare was checked in the macOS word dictionary before adding it to the house list.

## Verification (15 Nov 2026)

Main `e8c61c6` plus this feature; Node 24 and installed Chrome. Commands ran from `frontend/` unless noted.

| Check | Exact result |
|---|---|
| `npm install` | Exit 0; existing manifest and lockfile retained. |
| `npx vitest run tests/island/weapon-comparison.test.js tests/island/weapon-comparison-dom.test.js (with existing card/arsenal tests)` | Test Files  4 passed (4); Tests  29 passed (29) |
| `npm test` | Test Files  274 passed (274); Tests  3344 passed (3344); Duration  238.34s (tests 88%, import 11%, transform 1%, worker 1%) |
| `npm run build` | ✓ built in 506ms |
| `node scripts/report-budget.js --check` | Exit 0; initial JS 18723/21080 bytes; CSS 8550/12000 bytes; no title image. |
| `node scripts/text-lint/index.mjs (repository root)` | Text lint: 4010 candidate strings in 445 source files; 0 errors, 8 report-only findings. |
| `npm run test:a11y` | Exit 1; 33 screens; market-placed contrast at 1280/375/320px; page errors: []. |
| `npm run test:demo` | Exit 0; 33 checks; errors: []; external: []. |

The first full run reported 1 failed / 3343 passed: the house text test rejected the new word compare. Its spelling was checked against `/usr/share/dict/words` (exact match), then that single word was added to the sorted house list. The unchanged test passes in the final full run above. No test was weakened or skipped.

The accessibility command is **not green**: an unchanged main worktree reproduced exactly the same three contrast findings (market step button, ratio 3.9664). [Baseline proof](../docs/evidence/U-weapon-comparison/baseline-a11y.json). Market code/styles and the audit script are unchanged. No attempt was made to bypass this check or absorb that separate issue into this feature.

Four before/after screenshots at 1280x720 and 375x812 use real UI with synthetic snapshots, the game's shared stylesheet order and original/main versus changed modules/styles; [evidence and limits](../docs/evidence/U-weapon-comparison/README.md). Fixture reports: zero page errors / external requests. Relative documentation targets, conflict markers, whitespace, unchanged API files and screenshot dimensions checked.

Not verified: backend pytest/Ruff (no backend edits), physical phones, screen readers, live login/Supabase/Realtime or real database settlement. The multiplayer command was not rerun for this read-only arsenal display branch. These sibling features are based on main and tested independently, not as a combined release. Their shared Arsenal/docs files must be reconciled and rechecked as individual PRs are reviewed/merged.

Remaining: author review and independent human review; keep draft. No main push, force push, deleted file, migration, game-rule change or merge.
