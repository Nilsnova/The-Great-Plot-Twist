# WALL-37 · Fine touch positioning for unpaid wall drafts

> **What this is:** An optional touch-sized control for moving the entire unpaid draft by one half-grid step.
>
> **Who uses it:** Players placing walls precisely on narrow phone screens.

- **Status:** implemented with focused and phone component evidence; combined acceptance and human review remain.
- **Responsible teammate:** Johannes Franz Lang (`frcola`).
- **Issue:** [WALL-37 #315](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/315).
- **Branch:** `feat/wall-37-fine-position`, stacked on final WALL-27.

## Contract

`controller.shift(dx,dz)` accepts one cardinal direction only when the draft is unpaid/editable. Every ordered cell moves by GRID=0.5; translation preserves connectivity, and an out-of-bounds cell refuses the whole shift. Success clears the old quote and requires a new price. Pending/unknown build intent, UID, server epoch and placements remain immutable.

The **Fine position** native disclosure starts closed. Four 44px controls and numeric first/last cells explain the exact result. Native summary Enter toggles the disclosure; ordinary arrows still add two-unit walls. Opening/closing changes an existing bar class so the camera's current height-cache key remeasures its inset. No new camera or authority layer is added.

## Proof

Pure tests cover four directions, group bounds, invalid inputs, quote invalidation/requote and held unknown intent. A real phone DOM case checks closed/default and expanded geometry, native summary Enter, actual direction-button callback, quote invalidation, clear and close. Coordinate Chromium with the other visual writer. Full-game capture/SQL evidence stays with the integration lane.

Two reviewed vocabulary entries: “fine” is the correctly spelled American-English adjective for precise adjustment; “summary” is the standard noun and native HTML element name (double m). No lint exemption, new dependency, live apply, activation or merge. Explain-back: why requote, why unknown intents stay frozen, and how the existing camera sees the disclosure height. Independent human review remains pending.

## Executed evidence

[Draft PR #316](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/316) stacks on WALL-27 shipping-guard head `ec617b96`. Shift tests first returned **10 failed / 33 passed (43)** before the method existed. Four directional cases translate a connected turned run, preserve order, clear its quote and require fresh price before purchase; bounds/invalid-direction cases preserve the whole old draft, and pending/unknown cases retain the original UID/intent across closing/reopening.

`npm --prefix frontend test -- --maxWorkers=1 tests/island/wall-builder.test.js tests/island/wall-builder-preview.test.js tests/island/move-mode.test.js tests/island/village-mode.test.js`: **70 tests / 4 files**, duration **2.57s**, exit 0.

`CHROME_PATH=/usr/bin/chromium npm --prefix frontend test -- --maxWorkers=1 tests/island/wall-builder-dom.test.js`: **9 tests / 1 file**, duration **13.20s**, exit 0. The new actual 375×812 case uses real controls with a 120px narration inset. It checks native summary Enter does not confirm a ready purchase, disclosure height/camera-cache class, all four 44px arrows inside/hittable, exact 0.5 shift, unchecked feedback/price invalidation, clear and Escape/reopen's closed default. Existing collapsed target-size checks measure visible controls; the new expanded case checks every fine control.

Text lint: **0 errors / 8 existing report-only findings**. Only the two reviewed words were appended; historical vocabulary/comments were preserved, and no exemption or assertion was weakened. `git diff --check` passed. A separate camera/input source review found no blocker; that is AI assistance, not human approval.

Full-game before/after, combined backend/SQL/perimeter proof, broader build/browser checks, real-device/Safari evidence and independent human review remain unverified by this slice. No merge or live application.
