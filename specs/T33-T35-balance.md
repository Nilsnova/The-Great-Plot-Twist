# T33–T35 balance and release check (tower_health, pathing)

> **What this is:** the evidence for switching the wave rules `tower_health` (T33, [D049](../docs/DECISIONS.md)) and `pathing` (T34/T35, [D040](../docs/DECISIONS.md)) on in production: an automated balance playtest of the real sim, the retune it needed, and a two-browser check of the rules in one room.
>
> **Who uses it:** whoever flips the flags, the recovery and enemies lanes, T3 (balance) and the reviewer.

- **Status:** measured 14 Nov 2026 on branch `test/t33-t35-balance-release-check`; retune proposed (notes in D040 and D049), pending team review
- **Responsible teammate:** Nils (`Nilsnova`); a coding agent did the work. The teammate stays responsible for its output.
- **Tools:** `frontend/scripts/balance-rules.mjs` (headless sim, exit 1 when the acceptance fails) and `frontend/scripts/check-rules-mp.js` (`npm run test:rules`, two tabs on the fake shared world)

## How the playtest works

`node scripts/balance-rules.mjs [--seeds 20] [--waves 1,3,…] [--layouts spots,ring] [--rules pathing] [--json out.json]` runs `createWave` from `src/pirates/sim.js` at its fixed tick with every rule set (none, tower_health, pathing, both), for waves 1, 3, 5, 8, 10, 15, 20, 30, 45 and 60, N seeds each (seed × 7919, as in `balance-fixture.js`).

- **Islands by progress** (`tests/pirates/balance-fixture.js`): wave 1 `ISLANDS.first`, 3 `small`, 5 `boss5`, 8–10 `mid`, 15–20 `full`, 30 `researched(islandAt(4))`, 45 `researched(islandAt(5))`, 60 `tiered(islandAt(5))`.
- **Crew:** 1 captain at wave 1, 2 at 3–5, 3 at 8–20, 4 at 30, 5 at 45 and 6 at 60. Their level goes from 1 to 5 and their skills from none, to Steady aim, Long barrel and Quick fix, to all skills. From wave 45 they carry the long rifle or fire bombs. They stand 2.5 from the heart (0.9 inside the ring layout) and strike a boarder within 2.6, else shoot the nearest ship or boarder in range. Captain 0 is the carpenter: they walk (5 units a second) to the most hurt wall or tower within 14 of the heart, press E within 2 of it (repair or rebuild) and walk back. A broken wall or tower that is ready to rebuild comes first, then anything below 60 % that is not already being repaired.
- **Layouts:** `spots` uses the fixture's fixed spots: lone walls on the shore and on the inner ring, like today's islands. `ring` moves the island's 12 walls edge to edge (T36 footprints) into a closed square ring round the heart (centres ±3 / −1…5, legal under `placement.js`). It runs from wave 15 only, because it needs 12 walls.
- **Measured:** win %, mean heart hp left, mean wave time, towers broken, walls breached (wall hp reaching 0), wall hacks by boarders and boarders landed.

## Acceptance

For each layout and wave, compared with `none`, a rule set must meet all three:

1. Its win rate stays within **±10 percentage points**.
2. It makes no wave unwinnable or trivial. A wave that `none` sometimes wins must not drop to 0 %. A wave that `none` sometimes loses must not become trivial: 100 % with the heart above 90 while `none`'s is below 60.
3. With pathing, boarders still hack walls, so walls are not ignored in fixed-spot or ring layouts. Wherever `none` has 5 or more wall hacks, the rule set needs at least a third as many.

## Results

Each cell shows win % / heart hp / time s / towers broken / walls breached / wall hacks. **Before** is origin/main (d606ec7) with 10 seeds. **After** is the retune below with 20 seeds.

| layout | wave | rules | before | after |
|---|---:|---|---|---|
| spots | 1 | none | 100 / 100 / 15 / 0 / 0 / 0 | 100 / 100 / 15 / 0 / 0 / 0 |
| spots | 1 | tower_health | 100 / 100 / 15 / 0 / 0 / 0 | 100 / 100 / 15 / 0 / 0 / 0 |
| spots | 1 | pathing | 100 / 100 / 15 / 0 / 0 / 0 | 100 / 100 / 15 / 0 / 0 / 0 |
| spots | 1 | both | 100 / 100 / 15 / 0 / 0 / 0 | 100 / 100 / 15 / 0 / 0 / 0 |
| spots | 3 | none | 100 / 100 / 27 / 0 / 0 / 0 | 100 / 100 / 27 / 0 / 0 / 0 |
| spots | 3 | tower_health | 100 / 100 / 27 / 0 / 0 / 0 | 100 / 100 / 27 / 0 / 0 / 0 |
| spots | 3 | pathing | 100 / 100 / 27 / 0 / 0 / 0 | 100 / 100 / 27 / 0 / 0 / 0 |
| spots | 3 | both | 100 / 100 / 27 / 0 / 0 / 0 | 100 / 100 / 27 / 0 / 0 / 0 |
| spots | 5 | none | 100 / 98 / 42 / 0 / 0.5 / 8.6 | 100 / 99 / 38 / 0 / 0.3 / 4.4 |
| spots | 5 | tower_health | 100 / 98 / 42 / 0 / 0.5 / 8.6 | 100 / 99 / 38 / 0 / 0.3 / 4.4 |
| spots | 5 | pathing | 100 / 98 / 42 / 0 / 0.2 / **0** | 100 / 99 / 38 / 0 / 0.2 / 2.6 |
| spots | 5 | both | 100 / 98 / 42 / 0 / 0.2 / **0** | 100 / 99 / 38 / 0 / 0.2 / 2.6 |
| spots | 8 | all four | 100 / 100 / 25 / 0 / 0 / 0 | 100 / 100 / 25 / 0 / 0 / 0 |
| spots | 10 | none | 100 / 97 / 38 / 0 / 2.7 / 58.1 | 100 / 98 / 38 / 0 / 2.5 / 55.3 |
| spots | 10 | tower_health | 100 / 97 / 38 / 0 / 2.7 / 57.9 | 100 / 98 / 38 / 0 / 2.5 / 55.3 |
| spots | 10 | pathing | 100 / 99 / 39 / 0 / 1.8 / **0** | 100 / 98 / 38 / 0 / 2.4 / 42.4 |
| spots | 10 | both | 100 / 99 / 40 / 0 / 1.8 / **0** | 100 / 98 / 38 / 0 / 2.4 / 42.4 |
| spots | 15 | all four | 100 / 100 / 18 / 0 / 0 / 0 | 100 / 100 / 18 / 0 / 0 / 0 |
| spots | 20 | none | 100 / 100 / 25 / 0 / 0 / 2.3 | 100 / 100 / 25 / 0 / 0 / 2.6 |
| spots | 20 | tower_health | 100 / 100 / 25 / 0 / 0 / 2.3 | 100 / 100 / 25 / 0 / 0 / 2.6 |
| spots | 20 | pathing | 100 / 100 / 25 / 0 / 0 / 0.1 | 100 / 100 / 26 / 0 / 0 / 2.5 |
| spots | 20 | both | 100 / 100 / 25 / 0 / 0 / 0.1 | 100 / 100 / 26 / 0 / 0 / 2.5 |
| spots | 30 | all four | 100 / 100 / 30 / 0 / 0 / 0 | 100 / 100 / 29 / 0 / 0 / 0–0.1 |
| spots | 45 | none | 100 / 97 / 56 / 0 / 1.9 / 220.2 | 100 / 98 / 56 / 0 / 1.7 / 210.3 |
| spots | 45 | tower_health | 100 / 97 / 56 / 0 / 1.9 / 220.2 | 100 / 98 / 56 / 0 / 1.7 / 210.3 |
| spots | 45 | pathing | 90 / 90 / 57 / 0 / 0.4 / **33.2** | 100 / 98 / 56 / 0 / 1.6 / 224.4 |
| spots | 45 | both | 100 / 100 / 60 / 0.5 / 0.8 / **35.3** | 100 / 98 / 56 / 0 / 1.5 / 220.9 |
| spots | 60 | none | 100 / 72 / 67 / 0 / 8.5 / 450.2 | 100 / 73 / 67 / 0 / 8.4 / 445.2 |
| spots | 60 | tower_health | 100 / 72 / 67 / 0 / 8.5 / 450 | 100 / 73 / 67 / 0 / 8.4 / 445.2 |
| spots | 60 | pathing | **40** / 25 / 55 / 0 / 2.6 / **28.5** | 100 / 73 / 67 / 0 / 8.5 / 461.1 |
| spots | 60 | both | **60** / 52 / 61 / 1.1 / 4 / **33.6** | 100 / 72 / 67 / 0 / 8.3 / 446.1 |
| ring | 15 | all four | 100 / 100 / 18 / 0 / 0 / 0 | 100 / 100 / 18 / 0 / 0 / 0 |
| ring | 20 | all four | 100 / 100 / 25 / 0 / 0 / 0 | 100 / 99 / 26 / 0 / 0 / 0 |
| ring | 30 | all four | 100 / 99 / 31 / 0 / 0 / 0 | 100 / 99 / 30 / 0 / 0 / 0 |
| ring | 45 | none | 100 / 63 / 60 / 0 / 0 / 90.6 | 100 / 61 / 61 / 0 / 0 / 93.4 |
| ring | 45 | tower_health | 100 / 63 / 60 / 0 / 0 / 90.6 | 100 / 61 / 61 / 0 / 0 / 93.4 |
| ring | 45 | pathing | 100 / 61 / 61 / 0 / 0 / 48.7 | 100 / 61 / 61 / 0 / 0 / 112.4 |
| ring | 45 | both | 100 / 60 / 62 / 0.4 / 0 / **25.6** | 100 / 61 / 61 / 0 / 0 / 91.7 |
| ring | 60 | none | 70 / 5 / 67 / 0 / 0 / 201.6 | 60 / 6 / 66 / 0 / 0 / 220.1 |
| ring | 60 | tower_health | 70 / 5 / 67 / 0 / 0 / 201.6 | 60 / 6 / 66 / 0 / 0 / 220.1 |
| ring | 60 | pathing | **40** / 3 / 66 / 0 / 0 / 99.2 | 50 / 4 / 66 / 0 / 0.1 / 260.2 |
| ring | 60 | both | **20** / 2 / 64 / 1.6 / 0.1 / 81.2 | **45** / 3 / 65 / 0.1 / 0.3 / 244.4 |

**Ring wave 60 with 80 seeds (after).** Heart hp ends near 5 in this wave, so 20 seeds are noisy here. With 80 seeds the win rates are none 63 %, tower_health 63 %, pathing **51 % (−12)** and both **45 % (−18)**, with the heart at 5 / 5 / 4 / 3. Before the retune, 80 seeds gave none 63 %, pathing 49 % and both 36 %.

**Before: 13 failures.** Pathing ignored lone walls (0 wall hacks at waves 5 and 10, 33 against 220 at wave 45, 28 against 450 at wave 60) and collapsed wave 60 on the fixed spots: 40 % against 100 %, heart 25 against 72. With both rules on, that wave was won 60 % of the time. On the ring at wave 60, pathing won 40 % and both 20 %, against 70 % for none. `tower_health` alone matched `none` everywhere: on today's fixed routes no boarder comes within 2.5 of a tower, so no tower was ever hit.

**After: 1 failure (20 seeds), 2 failures (80 seeds), both on the ring at wave 60.** Every fixed-spot wave and every other ring wave matches `none` (100 % or the same). Wall hacks are 77–120 % of `none`'s (spots wave 45: 224 against 210; wave 60: 461 against 445), and no wave became unwinnable or trivial.

With these islands, waves 8, 15 and 30 land almost no boarders (the build is ahead of the wave), so the rules cannot change them. The bands that tell the rules apart are 5, 10, 45 and 60.

## Retune (proposed)

| Constant | Before | After | File |
|---|---|---|---|
| `WALL_ENGAGE` (new): a boarder within this distance of a standing wall's footprint that lies **across its straight way to the heart** hacks it instead of walking round. "Across" means the line passes within `WALL_LANE` (0.25) of the footprint. | none (lone walls are walked round) | 3 units | `frontend/src/pirates/boarder-paths.js` |
| `TARGET_PROFILES.boarder.towerReach` | 2.5 | 1.5 | `frontend/src/pirates/targeting.js` |

- `WALL_ENGAGE` gives lone walls on the way back the value they have on the fixed routes (the T35 finding). Gaps between joined walls still work. A wall beside the line is not engaged, so a boarder walking through a breach does not turn on its neighbours, and the closed-ring test still breaches exactly one wall. The rule is deterministic (walls by id, plain sums), so every browser picks the same wall. `pathing-wiring.test.js` now tests that a boarder hacks a lone wall across its way and walks past one beside it.
- `towerReach` 1.5: at 2.5, boarders walking the grid past towers peel off to hack them. With both rules on, ring wave 60 fell to 36 % (80 seeds). At 1.5 only a boarder right at a tower attacks it, and the same wave gives 45 %. Doubling tower hp did not help (33 %, 30 seeds): the cost comes from boarders leaving the killing ground, not from broken towers.
- No change was needed in `sim.js`. Other values tried and dropped: `WALL_ENGAGE` 0.75, 1.5, 2.5 and 4 (the fixed spots pass from 0.75; ring wave 60 with pathing won 47–53 % at 60 seeds, and 3 was the best plain value). A version without `WALL_LANE` broke the closed-ring test: boarders in the breach hacked its neighbours.

**Left open:** with pathing, the closed ring loses about 12 points at wave 60 (18 with both rules). Boarders funnel through one breach instead of each hacking its own ring wall. That is what pathing is meant to do (D040), but it fails acceptance 1 for this layout and wave. The team can accept it (rings round the heart are rare today, and wave 60 is a coin-flip wave), or make the breach costlier: more hp for walls in a closed ring, or a faster rebuild of the breached wall. Either change needs `sim.js` or the wall rules, which belong to another lane.

## Two-browser check (`npm run test:rules`)

The fake server (`src/pirates/fake-api.js`) now serves wave `rules` the way `backend/server/island/wave_rules.py` does. It lists the rule flags that are on now, in `SIM_RULES` order. The first answer for each wave keeps that set, and nothing is kept while every rule flag is off. `dev.setFlag(name, on)` switches a flag for every tab of a shared world, like a redeploy. Run of 14 Nov, all PASS:

1. Both tabs start wave 15 with `towerHealth` and `pathing`, and every cannon has hp.
2. E at a damaged tower (cannon_2, 77/80) repairs it, and `tower_repaired` follows in the friend's sim too. No tower broke in that wave, so rebuild was not seen in the browser (the unit tests in `tower-health.test.js` cover it).
3. 448 ticks compared in both tabs: identical tower hp, broken flags, every boarder's position and state, the walls and the heart. The tower events matched too (20 damaged, 1 repaired).
4. With pathing switched off mid-wave, a late join and a current answer still carry `['tower_health', 'pathing']`.
5. No browser errors.

## Bug: switching a rule flag on while a wave runs

`rules_for_wave()` returns early while every rule flag is off, so a wave that starts with all of them off keeps nothing. If a flag is switched on while that wave runs, the next join or current answer keeps and serves the new rules. A late joiner then plays tower health and pathing while the bell-ringer does not, and their sims drift for that wave. The module documents the reverse case (the last flag switched off mid-wave) as a known limit, but this case is the release moment itself. Scenario K of `check-rules-mp.js` shows it (the fake mirrors the server). Proposed fix: while no rule flag is on, still answer the kept set when the wave has one, and once the migration is applied keep an empty set on a wave's first answer. Until then, switch the flags on only while no wave runs, or accept one drifting wave per running room.

## Done when

- [x] Playtest script and acceptance written; before and after numbers above.
- [x] Retune only in the new modules (no `sim.js` change).
- [x] `npm test` and `npm run build` pass (exit codes in the handover).
- [ ] The team decides on ring wave 60 with pathing (accept it, or change a wall rule).
- [ ] The D040 and D049 notes are accepted.
- [ ] A different human teammate has reviewed the change.
