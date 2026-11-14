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
