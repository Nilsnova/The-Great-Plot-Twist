# B2 — Entry and lobby on phones

Johannes Franz Lang (@frcola), assisted by Codex. Claim: https://github.com/Nilsnova/The-Great-Plot-Twist/issues/60

## Scope

Audit entry/Continue/Create/Join and full lobby at 375x812 / 390x844, with a
1280x720 desktop check. Use existing models, generated names and browser helpers.
Reproduce a layout defect before making one small CSS fix. Keep controls reachable,
callbacks/disabled states intact and document the remainder of B2 honestly.
No login, API, Start/join permission, backend or dependency changes. Independent of #58.

## Plan and risks

1. Capture/measure baseline entry and lobby with generated names and roles.
2. Add a focused regression and verify it fails before the fix.
3. Correct only the owning CSS rules.
4. Check full names/status, scroll/focus/Escape and host/member behavior.
5. Run frontend tests/build/budget/text/a11y/demo; attach before/after evidence.
6. Update task/status/walkthrough/test map; keep draft for human review, no merge.

Wrapped names can make rows taller: confirm Start/Done remain reachable. Browser
viewport resizing is not a physical-phone/software-keyboard or live-network proof.

## Confirmed defect and implementation

Independent draft [PR #61](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/61),
branch `fix/b2-entry-lobby`, from main `4d83dcd`; issue #60. All ten generated fixture
names were visually clipped at both phone sizes. A six-line mobile CSS block now
lets names wrap, keeps presence/colour/role beside them and places status beneath.
The desktop fixture stays unchanged; no game rules, callbacks, login or APIs changed.

Seven focused browser cases cover full names, role/no-role rows, online/away/you,
last-member scrolling, focus/Escape, host Start and disabled member Start, plus
Continue/Create/Join on both phones and desktop. A separate CLI tool replays the
real fake-game title → intro/tutorial → choice → goal → lobby path, opening title
Join without submitting it. It checks seven panels at each size and saves evidence.

## Results

- [x] `npm install`: 48 packages audited, 0 vulnerabilities; dependency/lockfile unchanged.
- [x] Red before CSS fix: `Tests 2 failed | 5 passed (7)`; name-clipping assertion false on both phones.
- [x] Final focused run: `Tests 7 passed (7)`; 3.38s.
- [x] `npm test`: `Test Files 260 passed (260)` / `Tests 3209 passed (3209)`; 117.36s.
- [x] `npm run build`: `built in 420ms`; `Spoiler guard: 233 text files, 12 protected lines, no suspect elimination data.`
- [x] `node scripts/report-budget.js --check`: exit 0; initial JavaScript 18,208 B / CSS 8,550 B within limits.
- [x] `node scripts/text-lint/index.mjs`: 3957 candidate strings in 443 source files; 0 errors, 8 existing report-only findings.
- [x] `npm run test:a11y`: 33 screens, failures [], errors [].
- [x] `npm run test:demo`: 33 checks, errors [], external [].
- [x] `node scripts/check-phone-entry.js`: `Phone entry: 21 screens passed; browser errors: 0; external requests: 0.`
- [x] [Before/after, entry audit and measurements](../docs/evidence/B2-entry-lobby/README.md), walkthrough/test map and task/status handover.
- [ ] Author diff review and independent human review before any merge.

The later focused assertions also exercise Continue after Join/Create. Frontend
checks were rerun on that final test/tool version; player CSS stayed unchanged.
Accessibility/demo results apply to the same player CSS. QA outputs are outside
tracked captures; original accessibility captures restored. The QA tool is not a
production entry. Backend/Ruff/multiplayer not run: no Python/network/rules changes.
Physical phones, software keyboard, screen readers, Safari and actual room/login/
purchases remain unverified. Full B2 outside this slice and independent draft #58
remain separate; no combined-branch result or merge is claimed.
