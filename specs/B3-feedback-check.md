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
