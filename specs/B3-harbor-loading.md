# Respect closing the harbor while it loads

- Task: B3 follow-up; https://github.com/Nilsnova/The-Great-Plot-Twist/issues/91.
- Responsible: Johannes Franz Lang (@frcola), with Codex assistance.
- Branch: `fix/b3-harbor-loading`, based on main `e8c61c6`.
- Status: implemented and checked with the known main accessibility limitation; author and independent human review pending.

## Goal

Do not open a harbor card after the player closes it during a delayed module load. Keep later explicit opens working and resolve overlapping opens to the most recent intent.

## Acceptance

Close before load resolves, repeated opens, latest overview/weather intent, retry after failed load, disposal before completion.

## Scope and limits

frontend/src/harbor/host.js; focused host/browser tests. Reuse existing helpers. Login, APIs, backend, database, dependencies and game rules unchanged. Browser fixtures are not live-server or physical-device proof. No PR merge is authorized.

## Implementation and limits

`harbor/host.js` increments a local request number for each show and close. After the shared download it compares the saved number and disposal state. Only the current intent opens its card or reports a load failure; a later explicit open reuses successfully loaded cards.

Keep the existing shared lazy import. Cancel the opening intent rather than the download, using one counter instead of a new loading manager. Card factories, copy and APIs stay unchanged.

Eight controlled host cases cover close/reopen, repeated opens, both view orders, load rejection/retry, obsolete failure and success/failure after disposal. Existing Harbor card browser tests exercise real rendering.

The focused tests control module resolution and use card-factory spies. Screenshots separately use the real cards with a controlled module delay. Network throttling, physical phones and a full live journey are not claimed.

## Verification (15 Nov 2026)

Commands ran from `frontend/` unless stated otherwise, on main `e8c61c6` plus this change, using Node 24 and installed Chrome. The focused command is `npx vitest run tests/harbor/host-loading.test.js` with existing Arsenal/Harbor tests added for the green run.

| Check | Actual result |
|---|---|
| `npm install` | Exit 0; manifest and lockfile unchanged. |
| `focused regression (before fix)` | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯; Test Files  1 failed (1); Tests  6 failed | 2 passed (8) |
| `focused regression + existing checks (after fix)` | Test Files  2 passed (2); Tests  17 passed (17) |
| `npm test` | Test Files  273 passed (273); Tests  3342 passed (3342); Duration  173.77s (tests 87%, import 11%, transform 2%) |
| `npm run build` | ✓ built in 404ms |
| `node scripts/report-budget.js --check` | Exit 0; initial JS 18723 / 21080 bytes; CSS 8550 / 12000 bytes; no title image. |
| `node scripts/text-lint/index.mjs (repository root)` | Text lint: 4002 candidate strings in 445 source files; 0 errors, 8 report-only findings. |
| `npm run test:a11y` | Exit 1; 33 screens; market-placed/contrast at 1280px; market-placed/contrast at 375px; market-placed/contrast at 320px; page errors: []. |
| `npm run test:demo` | Exit 0; 33 checks; errors: []; external: []. |

The accessibility command is **not green**. An unchanged main worktree reproduced market-placed contrast at 1280/375/320px (ratio 3.9664 for the step button); see [baseline record](../docs/evidence/B3-harbor-loading/baseline-a11y.json). Market code/styles and the audit script are unchanged. These findings remain outside this scoped fix.

Screenshots: four controlled real-UI captures at 1280x720 and 375x812, [before/after](../docs/evidence/B3-harbor-loading/README.md); fixture report has zero page errors/external requests. Documentation links and whitespace checked.

Not verified: backend pytest/Ruff (no backend edits), live login/Supabase/Realtime, actual SQL settlement or physical phones. The multiplayer command was not rerun on this branch. The three sibling PRs were tested independently, not as a combined release.

Remaining: Johannes reviews/rehearses the current diff; a different human reviews it. Keep draft; do not merge automatically. Codex assistance is recorded; author understanding is not asserted.
