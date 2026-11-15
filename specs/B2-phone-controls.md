# B2 — Thumb-sized island actions

Johannes Franz Lang (@frcola), assisted by Codex. Task: https://github.com/Nilsnova/The-Great-Plot-Twist/issues/57

## Scope and agreement

Current-v3 first B2 slice, authorized by Johannes: measure the game/players chip
and secondary Hire crew, Move and Tear down buttons at 375x812 / 390x844,
then make undersized targets at least 44x44 CSS pixels. Retain desktop layout,
callbacks, disabled states and card scrolling. Login, APIs and rules unchanged.

Expected files: island.css, focused browser tests, walkthrough/test-map/task/status
and before/after evidence. No packages, file deletions or backend changes.

## Proof plan

1. Capture and measure current targets at both phone sizes and 1280x720.
2. Run a failing size regression before correcting CSS.
3. Change only the confirmed size overrides.
4. Verify enabled callbacks, disabled actions, focus/scroll and no horizontal overflow.
5. Run frontend tests/build/budget/text lint/a11y/demo and record actual results.

The larger targets may add a little height; verify the building card can still
scroll and the game chip stays clear of goals. This slice does not complete the
entire B2 audit or claim a physical-device/keyboard/login review. Keep draft; no merge.

## Implementation and evidence

Draft [PR #58](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/58), branch
`fix/b2-phone-controls`, based on main `4d83dcd`. Four `min-height:40px` declarations
removed; the existing shared 44px rule applies again. One related position comment
updated. No JavaScript game behavior or API change.

- [x] All four targets: 40px before / 44px after at 375x812, 390x844 and 1280x720.
- [x] Phone game chip/goal gap remains 4px; no horizontal overflow in captures.
- [x] Focus/scroll/Escape, one enabled callback per action, disabled wave actions.
- [x] [Before/after pictures and measurements](../docs/evidence/B2-phone-targets/README.md).
- [x] Red: `3 failed | 1 passed (4)`, `expected 40 to be greater than or equal to 44`; focused green: `4 passed (4)` in 2.40s.
- [x] `npm install`: 48 packages audited, 0 vulnerabilities; dependency/lockfile unchanged.
- [x] `npm test`: `Test Files 260 passed (260)` / `Tests 3206 passed (3206)`; 120.94s.
- [x] `npm run build`: `built in 361ms`; `Spoiler guard: 233 text files, 12 protected lines, no suspect elimination data.`
- [x] `node scripts/report-budget.js --check`: exit 0; initial JavaScript 18,208 B / CSS 8,550 B within limits.
- [x] `node scripts/text-lint/index.mjs`: 3957 candidate strings in 443 source files; 0 errors, 8 existing report-only findings.
- [x] `npm run test:a11y`: 33 screens, failures [], errors [].
- [x] `npm run test:demo`: 33 checks; errors [], external [].
- [ ] Author review and independent human review before any merge.

Backend pytest/Ruff and multiplayer not run: no Python, network, rules or combat
changes. Physical touch accuracy, software keyboard, screen readers and the full B2
journey remain unverified. Both captures use the local fake game. Generated a11y
artifacts are retained outside the checkout and the original tracked files restored.

## Main integration and conflict resolution (14 Nov 2026)

Merged main `53a59d4` into this task branch using a merge commit, preserving both histories. No PR was merged into main.

Conflict resolution changed shared documentation only. The task production files are byte-for-byte identical to their pre-sync versions; current main changes and teammate handovers are retained.

Commands below ran against the integrated working tree, from `frontend/` unless stated otherwise, with installed Chrome.

| Command | Actual result |
|---|---|
| `npm install` | Exit 0; existing package manifest and lockfile retained. |
| `npm test` | Test Files  260 passed (260); Tests  3208 passed (3208); Duration  123.93s (tests 86%, import 12%, transform 1%, worker 1%) |
| `npm run build` | ✓ built in 516ms |
| `node scripts/report-budget.js --check` | Exit 0; initial JS 18208 / 21080 bytes; CSS 8550 / 12000 bytes; title image None. |
| `node scripts/text-lint/index.mjs (repository root)` | Text lint: 3957 candidate strings in 443 source files; 0 errors, 8 report-only findings. |
| `npm run test:a11y` | Exit 0; 33 screens; failures: []; errors: []. |
| `npm run test:demo` | Exit 0; 33 checks; errors: []; external: []. |

Documentation: local link targets and conflict markers checked; no unresolved index entries; `git diff --check` clean. Earlier screenshots and verification above/in the original PR describe the original feature baseline, not a new before/after capture of this synchronization. Fresh browser checks ran against the integrated state; generated output stayed outside tracked evidence.

Not verified: real Supabase/login/Realtime, actual database payments, physical phones, backend pytest/Ruff (no task changes to backend), or all eight pending PRs combined. The four-page T19 run uses the existing fake server and BroadcastChannel, not real Realtime. The multiplayer runner was not rerun on this branch. Remaining: independent human review of the updated diff; existing draft status is retained. No approval, force push, deployment or main merge was performed.
