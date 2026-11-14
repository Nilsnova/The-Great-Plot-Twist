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
