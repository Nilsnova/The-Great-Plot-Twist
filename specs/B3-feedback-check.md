# B3 — Repeatable feedback check

Johannes Franz Lang (@frcola), assisted by Codex. Parent issue #30.

## Goal and scope

Make the eight existing current-v3 feedback fixtures repeatable with one local
command, using the existing Chromium helper and fake API. Check desktop and phone
sizes, useful messages, usable recovery controls, disabled purchases and callback
counts. Save screenshots plus a small report. No product, login, adapter, API,
dependency or database change; independent of drafts #31/#32/#38.

## Acceptance

- Eight component cases at 1280x720 and 375x812.
- Invalid code does not call join; refused join and failed create restore controls.
- Poor/locked/pending build controls do not call build; valid cannon still works.
- Leaderboard retry and connection retry call their existing callbacks.
- Assertions fail the command; console/page errors and external traffic fail it.
- Evidence explicitly distinguishes controlled components from real online play.

Likely files: `frontend/scripts/check-feedback.mjs`, a small fixture module,
this spec, walkthrough, test map, status, task-board and evidence instructions.

## Results (14 Nov)

Implemented in independent draft [PR #39](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/39),
branch `test/b3-feedback-check`, from main `908d376`. No product source changed.

- [x] `npm install`: 48 packages audited, 0 vulnerabilities; lockfile unchanged.
- [x] `node scripts/check-feedback.mjs`: `Feedback audit: 16 cases passed; browser errors: 0; external requests: 0.`
- [x] Negative control: temporarily enabled normally disabled build buttons in a browser response; exit 1 at the first build-coins assertion after six passing cases. Repository source untouched.
- [x] `npm test`: `Test Files 243 passed (243)` / `Tests 3036 passed (3036)`; 108.27s.
- [x] `npm run build`: `built in 341ms`; spoiler guard: 230 text files, 12 protected lines, no suspect elimination data.
- [x] `node scripts/report-budget.js --check`: exit 0; initial JavaScript 18,174 B, CSS 8,550 B, within limits.
- [x] `node scripts/text-lint/index.mjs`: 3774 candidate strings in 420 source files; 0 errors, 8 existing report-only findings.
- [x] QA page/scripts absent from production dist; whitespace/scope/local-documentation-link checks.
- [ ] Author diff review and independent human review before any merge.

The initial full-test attempt lacked CHROME_PATH: 33 files failed browser setup
and 159 cases were skipped by failed hooks. The corrected full rerun uses installed
Chrome and passes all 3,036 cases. No test was weakened or intentionally skipped.

Accessibility/demo and backend/Ruff/multiplayer checks not rerun: test tools/docs
only; no shipped UI, Python or room changes. No combined-branch check with
#31/#32/#38. Physical phones, screen readers and real provider/database behavior
remain outside this component audit. [Reproduction and samples](../docs/evidence/B3-repeatable/README.md).

## Main integration and conflict resolution (14 Nov 2026)

Merged main `53a59d4` into this task branch using a merge commit, preserving both histories. No PR was merged into main.

Conflict resolution changed shared documentation only. The task production files are byte-for-byte identical to their pre-sync versions; current main changes and teammate handovers are retained.

Commands below ran against the integrated working tree, from `frontend/` unless stated otherwise, with installed Chrome.

| Command | Actual result |
|---|---|
| `npm install` | Exit 0; existing package manifest and lockfile retained. |
| `npm test` | Test Files  259 passed (259); Tests  3204 passed (3204); Duration  119.94s (tests 86%, import 12%, transform 1%, worker 1%) |
| `npm run build` | ✓ built in 440ms |
| `node scripts/report-budget.js --check` | Exit 0; initial JS 18208 / 21080 bytes; CSS 8550 / 12000 bytes; title image None. |
| `node scripts/text-lint/index.mjs (repository root)` | Text lint: 3957 candidate strings in 443 source files; 0 errors, 8 report-only findings. |
| `npm run test:a11y` | Exit 1 on both attempts; 33 screens; failures: lobby / keyboard; errors: []. |
| `npm run test:demo` | Exit 0; 33 checks; errors: []; external: []. |
| `node scripts/check-feedback.mjs` | Feedback audit: 16 cases passed; browser errors: 0; external requests: 0. |

The accessibility audit failed twice at lobby / keyboard: the Done control was replaced during the polling refresh and lost its audit marker; focus remained inside and visible. The production lobby, its stylesheet and the accessibility script are identical to main. This unrelated timing issue is left visible, not fixed or bypassed in the conflict sync. The independent feedback audit passed all 16 cases.

Documentation: local link targets and conflict markers checked; no unresolved index entries; `git diff --check` clean. Earlier screenshots and verification above/in the original PR describe the original feature baseline, not a new before/after capture of this synchronization. Fresh browser checks ran against the integrated state; generated output stayed outside tracked evidence.

Not verified: real Supabase/login/Realtime, actual database payments, physical phones, backend pytest/Ruff (no task changes to backend), or all eight pending PRs combined. The four-page T19 run uses the existing fake server and BroadcastChannel, not real Realtime. The multiplayer runner was not rerun on this branch. Remaining: independent human review of the updated diff; existing draft status is retained. No approval, force push, deployment or main merge was performed.
