# B3 Shortcuts loading and failure recovery

For players and reviewers of Johannes Franz Lang's second B3 PR, with Codex assistance.
Parent issue: [#30](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/30).

## Scope

Make pending and failed shortcut loads visible with Retry and Back to game controls
usable on touch screens. Repeated menu/keyboard opens must not stack notices or
load duplicate overlays. Close/dispose must ignore late responses and remove feedback.
Reuse the native modal and the existing shortcuts overlay; no login/API/game-rule changes.
This branch starts independently from main; it does not include the help PR #31.

## Proof

Before/after captures at 1280x720 and 375x812, real Chromium pending/retry/cancel/dispose
regressions, applicable frontend checks and an audit handover. Keep draft for author
review; never merge without Johannes's explicit OK.

## Delivered

Implemented in draft [#32](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/32).
Seven new browser cases and the full 3,036-test frontend run pass, as do build, budgets,
text lint, accessibility (33 screens) and demo (33 checks).
[Audit and limits](../docs/B3-FEEDBACK-AUDIT.md); [captures](../docs/evidence/B3-shortcuts/README.md).
Author review, explain-back and independent human review remain; no merge performed.

## Main integration and conflict resolution (14 Nov 2026)

Merged main `53a59d4` into this task branch using a merge commit, preserving both histories. No PR was merged into main.

Conflict resolution changed shared documentation only. The task production files are byte-for-byte identical to their pre-sync versions; current main changes and teammate handovers are retained.

Commands below ran against the integrated working tree, from `frontend/` unless stated otherwise, with installed Chrome.

| Command | Actual result |
|---|---|
| `npm install` | Exit 0; existing package manifest and lockfile retained. |
| `npm test` | Test Files  260 passed (260); Tests  3211 passed (3211); Duration  122.05s (tests 86%, import 12%, transform 1%, worker 1%) |
| `npm run build` | ✓ built in 434ms |
| `node scripts/report-budget.js --check` | Exit 0; initial JS 18208 / 21080 bytes; CSS 8550 / 12000 bytes; title image None. |
| `node scripts/text-lint/index.mjs (repository root)` | Text lint: 3960 candidate strings in 443 source files; 0 errors, 8 report-only findings. |
| `npm run test:a11y` | Exit 0; 33 screens; failures: []; errors: []. |
| `npm run test:demo` | Exit 0; 33 checks; errors: []; external: []. |

The first accessibility run failed the lobby keyboard audit because the live lobby rerendered after controls were marked (the expected Start/Done controls lost audit markers). An unchanged rerun passed all 33 screens. This intermittent check is reported rather than hidden; no test or lobby behavior was changed.

Documentation: local link targets and conflict markers checked; no unresolved index entries; `git diff --check` clean. Earlier screenshots and verification above/in the original PR describe the original feature baseline, not a new before/after capture of this synchronization. Fresh browser checks ran against the integrated state; generated output stayed outside tracked evidence.

Not verified: real Supabase/login/Realtime, actual database payments, physical phones, backend pytest/Ruff (no task changes to backend), or all eight pending PRs combined. The four-page T19 run uses the existing fake server and BroadcastChannel, not real Realtime. The multiplayer runner was not rerun on this branch. Remaining: independent human review of the updated diff; existing draft status is retained. No approval, force push, deployment or main merge was performed.
