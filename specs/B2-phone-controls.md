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
