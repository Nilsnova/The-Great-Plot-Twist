# T33 Tower damage art

> **What this is:** original drawings of the cannon, mortar and harpoon tower in a damaged and a broken state, ready for T33 to use.
>
> **Who uses it:** the T33 lane (defense health and destruction) and T31/T32 (repair, rebuild).

- **Status:** in progress (art only)
- **Branch:** `feat/t33-tower-damage-art`
- **Responsible human:** Nils (`Nilsnova`)

## What exists

- `frontend/src/art/tower-states.js`: `drawDamaged`, `drawBroken`, `towerState`, `towerStateFrame`, `TOWER_KINDS`, `TOWER_STATES`.
- `frontend/src/art/island.js`: `drawTower(kind, level, state = 'intact', firing = false)` returns the draw function; 30 new frames
  `island-<kind>[-l2..-l5]-damaged` and `-broken` (48 x 32, anchor 5, same box as the intact tower).
- Damaged: the tower leans, cracks, scorch marks, splinters and a smoke column; it may still show its firing flash.
  Broken: rubble, the kind's wrecked weapon and a thin smoke trace; it never shows a shot.
- Intact frames and `towerFrame()` are untouched, so nothing changes visually today. Unknown states read as intact.
- Health bar: the game already has one, `drawHealthBar(x, z, hp, maxHp)` in `render.js` (captains). It is built from plain rects,
  not art, so it can be reused for towers and walls; no new bar art was added.
- Walls already had `island-wall-damaged` and `island-wall-broken`.
- Evidence: `docs/evidence/T33/tower-states-contact-sheet.png` (`node scripts/capture-tower-states.js`). Tests: `tests/tower-damage-art.test.js`.

## Wiring note (for whoever edits `render.js` once sim health exists)

1. Add the new ids to the atlas list (next to `TIER_IDS`/`HARPOON_IDS`, as cartoon-only ids), e.g. `TOWER_STATE_IDS` built with
   `towerStateFrame(kind, level, state)` for every kind, level 1-5 and state `damaged`/`broken`.
2. In `towerFrame(kind, level, firing, has)` add a `state` argument (default `'intact'`). For `damaged` or `broken` return
   `towerStateFrame(kind, level, state)` if `has(id)`, else fall back to the intact frame. For `broken` ignore `firing`.
3. Where the tower post is drawn, derive the state from sim health: `hp <= 0` -> `broken`, `hp / maxHp <= 0.5` -> `damaged` (threshold is T33's to set),
   else `intact`; a state of `undefined` today means intact.
4. Optionally call `drawHealthBar` over a damaged tower; hide the level pips on a broken one.
5. The pixel atlas has none of these frames, so the `has()` fallback to the intact frame is required.

## Out of scope

Simulation, health values, repair/rebuild flow, sounds, pixel-atlas versions.
