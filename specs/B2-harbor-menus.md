# B2 — Harbor and menus on phones

Johannes Franz Lang (@frcola), assisted by Codex. Claim: https://github.com/Nilsnova/The-Great-Plot-Twist/issues/65

## Scope and proof

Audit the current Harbor and pause/settings/help/credits at 375x812, 390x844 and
1280x720 using existing models/components/fixtures. Add focused layout/interaction
checks, then correct only a reproduced defect. If a view already works, preserve
it and report the evidence. Login/account, APIs, adapters, backend, game rules,
dependencies and migrations stay unchanged; no file deletions.

Plan: capture baseline; measure bounds/readability/44px targets; verify scroll,
focus/Escape and controlled selections; fix the smallest confirmed issue; run
applicable frontend gates; publish screenshots, walkthrough/test map and results.
Any larger content needs more vertical room, so preserve dismissal and reachable
actions. Keep draft, no merge; independent of #58/#61/B3. Physical devices and real
provider/settlement/multiplayer behavior are outside this local browser pass.

## Confirmed issue and implementation

Draft [PR #66](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/66), branch
`test/b2-harbor-menus`, from main `86b01d9`; issue #65. With the full game sheets
in the main-entry/world order, the match buttons broke “Nottingham” and
“Manchester” inside words on both phones. One new property inside the existing
<=480px block gives match-side choices a 100% flex basis. Coin choices retain a
row; desktop, labels, callbacks and rules are unchanged.

The 36 browser cases reuse the existing harness, fakeCalls/fakeSports, campaign,
card, shell and tutorial components. Thirty cases cover ten views at three sizes;
six cover interactions and all help pages on each phone. Original CSS is checked
before the fix; final CSS is restored and all checks rerun. Earlier fixture-only
style/return-route issues were corrected before the final regression proof.

## Results

- [x] `npm install`: 48 packages audited, 0 vulnerabilities; dependency/lockfile unchanged.
- [x] Original CSS regression: `Tests 2 failed | 34 passed (36)` in 13.43s, both phone word-fragmentation cases.
- [x] Final focused: `Tests 36 passed (36)`; 13.25s.
- [x] Final `npm test`: `Test Files 260 passed (260)` / `Tests 3240 passed (3240)`; 128.48s.
- [x] `npm run build`: `built in 359ms`; `Spoiler guard: 233 text files, 12 protected lines, no suspect elimination data.`
- [x] `node scripts/report-budget.js --check`: exit 0; initial JavaScript 18,208 B / CSS 8,550 B within limits.
- [x] `node scripts/text-lint/index.mjs`: 3957 candidate strings in 443 source files; 0 errors, 8 existing report-only findings.
- [x] `npm run test:a11y`: 33 screens, failures [], errors [].
- [x] `npm run test:demo`: 33 checks, errors [], external [].
- [x] [Before/after and 30-view matrix](../docs/evidence/B2-harbor-menus/README.md), walkthrough/test map and task/status handover.
- [ ] Author diff review and independent human review before merge.

Player CSS exactly matches the build/budget/text/a11y/demo version; the refined
fixture ordering was verified by the final focused/full test rerun. Original
tracked a11y files restored, generated QA output outside checkout. No backend,
Python, auth, API, adapter or rule changes; backend/Ruff/multiplayer not run.
Physical phones/keyboard, VoiceOver/Safari, real link/clipboard use, provider
accuracy/settlement and game cards outside this pass remain unverified. No combined
check with #58/#61/B3; keep draft, no merge, reconcile current main before a later merge.

## Main integration and conflict resolution (14 Nov 2026)

Merged main `53a59d4` into this task branch using a merge commit, preserving both histories. No PR was merged into main.

Conflict resolution changed shared documentation only. The task production files are byte-for-byte identical to their pre-sync versions; current main changes and teammate handovers are retained.

Commands below ran against the integrated working tree, from `frontend/` unless stated otherwise, with installed Chrome.

| Command | Actual result |
|---|---|
| `npm install` | Exit 0; existing package manifest and lockfile retained. |
| `npm test` | Test Files  260 passed (260); Tests  3240 passed (3240); Duration  142.90s (tests 89%, import 10%, transform 1%) |
| `npm run build` | ✓ built in 420ms |
| `node scripts/report-budget.js --check` | Exit 0; initial JS 18208 / 21080 bytes; CSS 8550 / 12000 bytes; title image None. |
| `node scripts/text-lint/index.mjs (repository root)` | Text lint: 3957 candidate strings in 443 source files; 0 errors, 8 report-only findings. |
| `npm run test:a11y` | Exit 0; 33 screens; failures: []; errors: []. |
| `npm run test:demo` | Exit 0; 33 checks; errors: []; external: []. |

Documentation: local link targets and conflict markers checked; no unresolved index entries; `git diff --check` clean. Earlier screenshots and verification above/in the original PR describe the original feature baseline, not a new before/after capture of this synchronization. Fresh browser checks ran against the integrated state; generated output stayed outside tracked evidence.

Not verified: real Supabase/login/Realtime, actual database payments, physical phones, backend pytest/Ruff (no task changes to backend), or all eight pending PRs combined. The four-page T19 run uses the existing fake server and BroadcastChannel, not real Realtime. The multiplayer runner was not rerun on this branch. Remaining: independent human review of the updated diff; existing draft status is retained. No approval, force push, deployment or main merge was performed.
