# T33 Tower health (defense health and destruction)

> **What this is:** the contract and implementation of tower hp inside one wave: damage by boarders, the broken state that stops a tower firing, free in-wave E repair and rebuild, and the drawings, behind the flag `tower_health`.
>
> **Who uses it:** the recovery and defense lane, T34/T35 (towers as targets), T31/T32 (repair and rebuild patterns), T43 (new defenses need hp) and the reviewer.

- **Status:** implemented on branch `feat/integration-sim`; decision [D049](../docs/DECISIONS.md) **proposed**, pending team review
- **Flag:** `tower_health` (server, off by default). Off: no `rules` on the wave answers, towers have no hp, every wave plays exactly as before.
- **Art:** [T33 tower damage art](T33-tower-damage-art.md) (`src/art/tower-states.js`, merged in #34).
- **Migration:** `20261114130500_wave_rules.sql` (additive: keeps each wave's rule set; shared with `pathing` and `rescue`).

## Rules (D049, proposed)

| Item | Rule |
|---|---|
| Kinds with hp | cannon, mortar, harpoon (the kinds with damaged/broken art). Watchtower, walls (their own rules, D039) and houses: unchanged. |
| hp by level 1–5 | cannon 80, 130, 200, 290, 400; mortar 70, 115, 180, 260, 360; harpoon 60, 100, 155, 230, 320 (`TOWER_HEALTH` in `frontend/src/pirates/tower-health.js`). Research, skills and crew do not change tower hp yet. |
| Who damages towers | Boarders on foot, by the T34 order (D040): a captain in reach, else the standing wall in the way, else the nearest standing **tower within 2.5** (at most 3 boarders on one tower, held while within the leash of 5; ties to the lower id, `targeting.js nearestWithin`), else the heart. A boarder hacks a tower from 1.1 away with its usual hack (× the wave's damage curve) once a second. Ships and gunboats do not damage towers (gunboat jam and barge silence stay separate). |
| Damaged | hp at or below half: the damaged drawing (`island-<kind>[-lN]-damaged`) and an hp bar over it (`drawHealthBar`). A damaged tower still fires normally. |
| Broken | hp 0: the broken drawing, no level pips, no reload, no shots (no ghost shots), no manual fire, not jammed by gunboats, not a target. Exactly one `tower_broken` event per break; a broken tower takes no further blows. Shots already in the air still land. |
| E repair (free, in wave) | at a damaged tower: +10 hp a second for 3 s per press, up to its hp, × the repairer's skills (Shipwright). Takes precedence over manning the cannon at that post. |
| E rebuild (free, in wave) | at a broken tower: back at 40 % (60 % Master shipwright), then a 5 s cooldown. |
| Carpenter, Workshop, engineer boost | walls only, unchanged (follow-up). |
| Between waves | **Out of scope:** every wave starts every tower whole. Lasting tower damage (like D039 walls: a stored percent, paid Repair/Rebuild, a timer) is a follow-up. |
| Messages | no new room message: the existing `repair` / `rebuild` inputs carry the tower's id in `wallId`; sim.js repairs the wall with that id, else (with tower health) the tower. |
| Determinism | The rule comes from the server's wave answer (`rules: ["tower_health"]` on start, join and current), never from a client's `/api/config`, so every client of a wave plays the same rule. The first answer keeps the wave's set (`wave_rules`, migration `20261114130500_wave_rules.sql`, apply it before switching the flag on), so a joiner after a flag flip gets the same rules. Mixed client versions in one wave can disagree: reload every client after switching the flag. |

## What

- `backend/server/flags.py` (`tower_health`), `backend/server/routes/waves.py` (`SIM_RULES`, `rules` on the wave answers), test `test_wave_rules.py`.
- `frontend/src/pirates/tower-health.js` (rules), `wave-rules.js` (wave answer → sim options), `sim.js` (hook), `interact.js` (E at a tower), `render.js` (state frames, hp bar, flash), `controller.js` (passes the rules and asks for the state frames in the atlas), `island/wave-flow.js` (one line: passes `rules` on).
- Tests: `frontend/tests/pirates/tower-health.test.js` (damage fixtures for T31/T32), `wave-rules.test.js`.

## Done when

- [x] `npm test`, `npm run build`, backend `pytest` and `ruff` pass.
- [x] Off: identical events with and without the option (test).
- [ ] Flag on in a preview with two browsers, screenshots of damaged and broken towers (not done here).
- [ ] Team agrees on D049 and the hp numbers (balance, T3).

## Follow-ups

Persistent tower damage between waves (needs a column like `wall_health` and the paid card), carpenter/Workshop/research for towers, damage by ships, watchtower hp, the `brute` profile (D040).

- **Last updated:** 2026-11-14
