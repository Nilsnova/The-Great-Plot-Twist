# B3 Feedback audit for the current island game

For players and reviewers of Johannes Franz Lang's feedback changes, with Codex assistance.

## Scope

Audit existing current-game rejection feedback and fix confirmed gaps in small PRs.
Login, APIs, server rules, dependencies and migrations stay unchanged. Retired mystery/class-demo
paths are not reintroduced. No merge without Johannes's explicit approval.

## Delivery

- [x] PR 1 (draft #31): How to play loading, failure, retry and cancellation (`fix/b3-help-feedback`).
- PR 2: Shortcuts recovery tracked independently in [draft #32](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/32).
- Current-game audit table and handover tracked independently in #32; this spec records the first PR.

## Checks

Real Chromium fixtures exercise the normal path, failed loads, retry, duplicate open,
cancellation and disposal. UI evidence uses 1280x720 and 375x812. Run frontend tests,
build, budget, house text lint, accessibility and demo checks; document exact results and limits.

## References

Issue [#30](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/30); help draft [#31](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/31).

## Risks

A stale response must not reopen a closed view. Focus must return to the game, and
waiting or failed views must not leave movement blocked after cancellation.

## Main integration and conflict resolution (14 Nov 2026)

Merged main `53a59d4` into this task branch using a merge commit, preserving both histories. No PR was merged into main.

Conflict resolution changed shared documentation only. The task production files are byte-for-byte identical to their pre-sync versions; current main changes and teammate handovers are retained.

Commands below ran against the integrated working tree, from `frontend/` unless stated otherwise, with installed Chrome.

| Command | Actual result |
|---|---|
| `npm install` | Exit 0; existing package manifest and lockfile retained. |
| `npm test` | Test Files  260 passed (260); Tests  3211 passed (3211); Duration  123.93s (tests 86%, import 12%, transform 1%, worker 1%) |
| `npm run build` | ✓ built in 447ms |
| `node scripts/report-budget.js --check` | Exit 0; initial JS 18208 / 21080 bytes; CSS 8550 / 12000 bytes; title image None. |
| `node scripts/text-lint/index.mjs (repository root)` | Text lint: 3961 candidate strings in 443 source files; 0 errors, 8 report-only findings. |
| `npm run test:a11y` | Exit 0; 33 screens; failures: []; errors: []. |
| `npm run test:demo` | Exit 0; 33 checks; errors: []; external: []. |

Documentation: local link targets and conflict markers checked; no unresolved index entries; `git diff --check` clean. Earlier screenshots and verification above/in the original PR describe the original feature baseline, not a new before/after capture of this synchronization. Fresh browser checks ran against the integrated state; generated output stayed outside tracked evidence.

Not verified: real Supabase/login/Realtime, actual database payments, physical phones, backend pytest/Ruff (no task changes to backend), or all eight pending PRs combined. The four-page T19 run uses the existing fake server and BroadcastChannel, not real Realtime. The multiplayer runner was not rerun on this branch. Remaining: independent human review of the updated diff; existing draft status is retained. No approval, force push, deployment or main merge was performed.
