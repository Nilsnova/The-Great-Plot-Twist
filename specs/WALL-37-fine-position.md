# WALL-37 · Fine touch positioning for unpaid wall drafts

> **What this is:** An optional touch-sized control for moving the entire unpaid draft by one half-grid step.
>
> **Who uses it:** Players placing walls precisely on narrow phone screens.

- **Status:** in progress; tests precede implementation.
- **Responsible teammate:** Johannes Franz Lang (`frcola`).
- **Issue:** [WALL-37 #315](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/315).
- **Branch:** `feat/wall-37-fine-position`, stacked on final WALL-27.

## Contract

`controller.shift(dx,dz)` accepts one cardinal direction only when the draft is unpaid/editable. Every ordered cell moves by GRID=0.5; translation preserves connectivity, and an out-of-bounds cell refuses the whole shift. Success clears the old quote and requires a new price. Pending/unknown build intent, UID, server epoch and placements remain immutable.

The **Fine position** native disclosure starts closed. Four 44px controls and numeric first/last cells explain the exact result. Native summary Enter toggles the disclosure; ordinary arrows still add two-unit walls. Opening/closing changes an existing bar class so the camera's current height-cache key remeasures its inset. No new camera or authority layer is added.

## Proof

Pure tests cover four directions, group bounds, invalid inputs, quote invalidation/requote and held unknown intent. A real phone DOM case checks closed/default and expanded geometry, native summary Enter, actual direction-button callback, quote invalidation, clear and close. Coordinate Chromium with the other visual writer. Full-game capture/SQL evidence stays with the integration lane.

One reviewed vocabulary addition: “fine” is the correctly spelled American-English adjective for precise adjustment. No lint exemption, new dependency, live apply, activation or merge. Explain-back: why requote, why unknown intents stay frozen, and how the existing camera sees the disclosure height. Independent human review remains pending.
