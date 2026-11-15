# Keep late arsenal answers on their original island

- Task: B3 follow-up; https://github.com/Nilsnova/The-Great-Plot-Twist/issues/87.
- Responsible: Johannes Franz Lang (@frcola), with Codex assistance.
- Branch: `fix/b3-arsenal-context`, based on main `e8c61c6`.
- Status: implemented and checked with the known main accessibility limitation; author and independent human review pending.

## Goal

Prevent a delayed arsenal move from assigning island A inventory, messages or loadout to island B after travel. Preserve completed server purchases and existing action ids.

## Acceptance

Delayed success/refusal after travel; normal same-island buy/return/take; current island remains authoritative.

## Scope and limits

frontend/src/island/arsenal.js; focused controller/browser tests. Reuse existing helpers. Login, APIs, backend, database, dependencies and game rules unchanged. Browser fixtures are not live-server or physical-device proof. No PR merge is authorized.

## Implementation and limits

`arsenal.js` saves the island key before a move. After each awaited answer, including a refusal-triggered refresh, it checks that key before applying UI state. Initial reads also discard old-island errors. The existing busy state is released even when a reply is ignored.

The controller already has a current-island key and refresh tickets. A few checks reuse those boundaries; there is no second cache, request queue or API change.

Eleven controlled cases cover delayed success/refusal for buy/take/return, late read success/error, travel during refusal refresh, normal delayed success and a completed fake-server purchase surviving the ignored answer.

These are controlled controller replies. The persistent-purchase case uses the in-memory fake, not SQL or real Realtime. Returning to the same island before a reply finishes is not a new navigation-generation protocol.

## Verification (15 Nov 2026)

Commands ran from `frontend/` unless stated otherwise, on main `e8c61c6` plus this change, using Node 24 and installed Chrome. The focused command is `npx vitest run tests/island/arsenal-context.test.js` with existing Arsenal/Harbor tests added for the green run.

| Check | Actual result |
|---|---|
| `npm install` | Exit 0; manifest and lockfile unchanged. |
| `focused regression (before fix)` | ⎯⎯⎯⎯⎯⎯ Failed Tests 10 ⎯⎯⎯⎯⎯⎯⎯; Test Files  1 failed (1); Tests  10 failed | 1 passed (11) |
| `focused regression + existing checks (after fix)` | Test Files  2 passed (2); Tests  27 passed (27) |
| `npm test` | Test Files  273 passed (273); Tests  3345 passed (3345); Duration  174.24s (tests 87%, import 11%, transform 2%) |
| `npm run build` | ✓ built in 378ms |
| `node scripts/report-budget.js --check` | Exit 0; initial JS 18723 / 21080 bytes; CSS 8550 / 12000 bytes; no title image. |
| `node scripts/text-lint/index.mjs (repository root)` | Text lint: 4002 candidate strings in 445 source files; 0 errors, 8 report-only findings. |
| `npm run test:a11y` | Exit 1; 33 screens; market-placed/contrast at 1280px; market-placed/contrast at 375px; market-placed/contrast at 320px; lobby/keyboard; page errors: []. |
| `npm run test:demo` | Exit 0; 33 checks; errors: []; external: []. |
| `npm run test:mp -- <local-output-folder>` | check-multiplayer: OK (4 pages) |

The accessibility command is **not green**. An unchanged main worktree reproduced market-placed contrast at 1280/375/320px (ratio 3.9664 for the step button); see [baseline record](../docs/evidence/B3-arsenal-context/baseline-a11y.json). This branch also reported the existing intermittent lobby keyboard audit: a refreshed control lost its audit-order marker while focus remained inside/visible. No test was changed or bypassed. Market code/styles and the audit script are unchanged. These findings remain outside this scoped fix.

Screenshots: four controlled real-UI captures at 1280x720 and 375x812, [before/after](../docs/evidence/B3-arsenal-context/README.md); fixture report has zero page errors/external requests. Documentation links and whitespace checked.

Not verified: backend pytest/Ruff (no backend edits), live login/Supabase/Realtime, actual SQL settlement or physical phones. The multiplayer command uses the existing four-page fake server and BroadcastChannel, not real Realtime. The three sibling PRs were tested independently, not as a combined release.

Remaining: Johannes reviews/rehearses the current diff; a different human reviews it. Keep draft; do not merge automatically. Codex assistance is recorded; author understanding is not asserted.
