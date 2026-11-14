# B3 Connection retry feedback

Johannes Franz Lang (@frcola), with Codex assistance. Parent: issue #30.

## Scope

Catch a rejected Retry connection callback, show a plain recovery message and keep
Retry usable. A stale rejection must not replace a newer adapter view or update a
disposed banner. Pending clicks still issue one read-only continueGame intent.
No login, adapter, API, game-rule, backend or dependency changes.

## Proof

Real DOM regression, duplicate click, retry success, state-change and disposal cases;
before/after 1280x720 and 375x812 captures and applicable frontend checks. Keep draft;
no merge without Johannes explicit OK.

## Results (14 Nov)

Draft [PR #38](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/38), branch
`fix/b3-connection-retry`, based on main `908d376`. Implemented, not merged.

- [x] Pending label, recoverable rejection, duplicate-click and stale/disposal guards.
- [x] Six real-DOM cases in `frontend/tests/ui/connection-retry.test.js`.
- [x] Red check before implementation: 5 failed, 1 passed; focused green: 6 passed.
- [x] Full frontend: `Test Files 244 passed (244)` / `Tests 3042 passed (3042)`; 111.92s.
- [x] Build: `built in 348ms`; spoiler guard: 230 text files, 12 protected lines, no suspect elimination data.
- [x] Budget `--check`: exit 0; initial JavaScript 18,174 B / CSS 8,550 B, both within limits.
- [x] Text lint: 3777 candidate strings in 420 source files; 0 errors, 8 existing report-only findings.
- [x] Accessibility: 33 screens, failures [], errors []; demo: 33 checks, errors [], external [].
- [x] [Before/after evidence](../docs/evidence/B3-connection/README.md), walkthrough and test map.
- [ ] Author diff review and independent human review before any merge.

Backend/Ruff and multiplayer checks not run: no backend, combat, room or API
changes. No combined-branch check with drafts #31/#32. Original tracked a11y
captures restored; generated audit/demo output retained outside this checkout.

## Main integration and conflict resolution (14 Nov 2026)

Merged main `53a59d4` into this task branch using a merge commit, preserving both histories. No PR was merged into main.

Conflict resolution changed shared documentation only. The task production files are byte-for-byte identical to their pre-sync versions; current main changes and teammate handovers are retained.

Commands below ran against the integrated working tree, from `frontend/` unless stated otherwise, with installed Chrome.

| Command | Actual result |
|---|---|
| `npm install` | Exit 0; existing package manifest and lockfile retained. |
| `npm test` | Test Files  260 passed (260); Tests  3210 passed (3210); Duration  130.66s (tests 86%, import 12%, transform 1%, worker 1%) |
| `npm run build` | ✓ built in 428ms |
| `node scripts/report-budget.js --check` | Exit 0; initial JS 18208 / 21080 bytes; CSS 8550 / 12000 bytes; title image None. |
| `node scripts/text-lint/index.mjs (repository root)` | Text lint: 3960 candidate strings in 443 source files; 0 errors, 8 report-only findings. |
| `npm run test:a11y` | Exit 0; 33 screens; failures: []; errors: []. |
| `npm run test:demo` | Exit 0; 33 checks; errors: []; external: []. |

Documentation: local link targets and conflict markers checked; no unresolved index entries; `git diff --check` clean. Earlier screenshots and verification above/in the original PR describe the original feature baseline, not a new before/after capture of this synchronization. Fresh browser checks ran against the integrated state; generated output stayed outside tracked evidence.

Not verified: real Supabase/login/Realtime, actual database payments, physical phones, backend pytest/Ruff (no task changes to backend), or all eight pending PRs combined. The four-page T19 run uses the existing fake server and BroadcastChannel, not real Realtime. The multiplayer runner was not rerun on this branch. Remaining: independent human review of the updated diff; existing draft status is retained. No approval, force push, deployment or main merge was performed.
