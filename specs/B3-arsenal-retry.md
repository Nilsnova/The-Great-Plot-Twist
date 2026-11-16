# Retry a failed arsenal load from its card

- Task: B3 follow-up; https://github.com/Nilsnova/The-Great-Plot-Twist/issues/89.
- Responsible: Johannes Franz Lang (@frcola), with Codex assistance.
- Branch: `fix/b3-arsenal-retry`, based on main `e8c61c6`.
- Status: implemented and checked with the known main accessibility limitation; author and independent human review pending.

## Goal

Offer a native Try again control when the initial arsenal read fails. Show pending feedback and suppress repeated retry clicks, using the existing read method.

## Acceptance

Initial failure, repeated failed retry, successful retry, pending duplicate clicks, keyboard/phone control.

## Scope and limits

frontend/src/island/arsenal.js, arsenal-model.js, arsenal-ui.js; focused controller/DOM tests. Reuse existing helpers. Login, APIs, backend, database, dependencies and game rules unchanged. Browser fixtures are not live-server or physical-device proof. No PR merge is authorized.

## Implementation and limits

`arsenal-model.js` supplies the recovery button label and disabled state. `arsenal-ui.js` draws a native button with a stable focus id. `arsenal.js` calls its existing refresh method once while loading is false, clears the old load error, and sets loading before the initial card opens.

Reuse the existing model, renderer, read method and UI kit. Retry performs a read only; buy/take/return and their existing action ids are unchanged.

Three native Chrome cases use the full shared stylesheet order at 1280x720 and 375x812: keyboard activation, 44px target, duplicate retry suppression, repeated failure then success, and closing before completion.

The replies are controlled at the controller boundary. These tests do not exercise a live account, real timeout duration, physical phone or server/database rules.

## Verification (15 Nov 2026)

Commands ran from `frontend/` unless stated otherwise, on main `e8c61c6` plus this change, using Node 24 and installed Chrome. The focused command is `npx vitest run tests/island/arsenal-retry.test.js` with existing Arsenal/Harbor tests added for the green run.

| Check | Actual result |
|---|---|
| `npm install` | Exit 0; manifest and lockfile unchanged. |
| `focused regression (before fix)` | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯; Test Files  1 failed (1); Tests  3 failed (3) |
| `focused regression + existing checks (after fix)` | Test Files  3 passed (3); Tests  22 passed (22) |
| `npm test` | Test Files  273 passed (273); Tests  3337 passed (3337); Duration  204.45s (tests 90%, import 8%, transform 1%) |
| `npm run build` | ✓ built in 401ms |
| `node scripts/report-budget.js --check` | Exit 0; initial JS 18723 / 21080 bytes; CSS 8550 / 12000 bytes; no title image. |
| `node scripts/text-lint/index.mjs (repository root)` | Text lint: 4003 candidate strings in 445 source files; 0 errors, 8 report-only findings. |
| `npm run test:a11y` | Exit 1; 33 screens; market-placed/contrast at 1280px; market-placed/contrast at 375px; market-placed/contrast at 320px; lobby/keyboard; page errors: []. |
| `npm run test:demo` | Exit 0; 33 checks; errors: []; external: []. |

The accessibility command is **not green**. An unchanged main worktree reproduced market-placed contrast at 1280/375/320px (ratio 3.9664 for the step button); see [baseline record](../docs/evidence/B3-arsenal-retry/baseline-a11y.json). This branch also reported the existing intermittent lobby keyboard audit: a refreshed control lost its audit-order marker while focus remained inside/visible. No test was changed or bypassed. Market code/styles and the audit script are unchanged. These findings remain outside this scoped fix.

Screenshots: four controlled real-UI captures at 1280x720 and 375x812, [before/after](../docs/evidence/B3-arsenal-retry/README.md); fixture report has zero page errors/external requests. Documentation links and whitespace checked.

Not verified: backend pytest/Ruff (no backend edits), live login/Supabase/Realtime, actual SQL settlement or physical phones. The multiplayer command was not rerun on this branch. The three sibling PRs were tested independently, not as a combined release.

Remaining: Johannes reviews/rehearses the current diff; a different human reviews it. Keep draft; do not merge automatically. Codex assistance is recorded; author understanding is not asserted.
