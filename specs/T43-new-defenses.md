# T43 New defenses: the culverin (prep stage)

> **What this is:** the comparison of four candidate defenses with distinct tactical roles, the choice of one (the culverin, a long gun that hunts the ships that attack towers), its stats, prices, unlocks, health and recovery, and the prep work that does not touch the combat simulation, all behind the new feature flag `defenses_v2`.
>
> **Who uses it:** the defense lane (T33 tower health, T34 targets, T36 placement) and whoever wires the culverin into `frontend/src/pirates/sim.js` in the integration step.

- **Status:** in progress (prep stage). Decision [D048](../docs/DECISIONS.md) is *proposed*, pending team review.
- **Branch:** `feat/t43-new-defenses`
- **Issue and pull request:** none yet (the lane is fast-tracked under D047; no PR opened by this branch).

## Why

The towers today are the cannon (one ball, one ship, shoots boarders first), the mortar (splash, cannot hit close ships) and the harpoon tower (T1, slows one sailing ship). All three have ranges of 28 to 48. Two enemy types are built to sit just outside that reach and attack the towers themselves: the **gunboat** (T2, wave 16+, anchors just outside the nearest cannon and jams a tower every 4.5 s) and the **siege barge** (event of wave 8, two from wave 40, anchors 1.42 coast radii out and silences a tower every 4.5 s). Measured in GAME-V3 §4.1, a well-built level-3 island only sinks 0 of 8 gunboats before their first shot at wave 16. With T33 towers will take real damage, so a ship that shoots towers from out of reach becomes a much bigger problem than a 3-second jam. The island needs an answer that is not "more mortars". The heavy hulls (ironclads from 30, dreadnoughts from 50) are the second gap: they soak cannon fire while the boarders land.

## Candidates compared

Numbers are per level 1 → 5. "DPS" is damage ÷ reload before the 0.7 pace factor, for comparison only. For reference: cannon 6.7 → 38, mortar 4.0 → 24.5 (splash), harpoon 0.8 → 3.9 (plus slow).

| | A. Culverin (long gun) | B. Fire brazier (fire tower) | C. Swivel-gun nest | D. Tar pit (trap) |
|---|---|---|---|---|
| Role | Counter-battery and heavy-hull hunter: very long reach, slow, hard single shots | Damage over time: sets one hull burning | Anti-boarder: short, fast, small spread at boarders only | Ground slow: boarders wade slowly over a tar patch |
| Answers | Gunboats and siege barges (outranges both), ironclads, warships, dreadnoughts | Ironclads, dreadnoughts, Redtide (burn ignores how many balls they soak) | Brutes (20+), smugglers' boarders (11), crowds at the ring walls | Brutes and every boarder heading to the heart |
| Weak against | Raiders and anything close (minimum range 12), boarders (never targets them), crowds (one target) | Fast raiders (they sail out of the fire), gunboats (tiny hp) | Every ship | Ships; useless before boarders land |
| Stand on | the seven tower spots `cannon_1`..`cannon_7` | tower spots | tower spots or a new inland spot | a new path spot (needs T35/T36) |
| Stats (sketch) | dmg 30, 42, 58, 76, 96 · range 44, 46, 48, 50, 52 · reload 4.0, 3.7, 3.4, 3.1, 2.8 s | burn 4, 6, 9, 12, 16 /s for 4 s · range 30 → 38 · reload 3.0 → 2.2 s | dmg 4 → 12 ×3 pellets · range 12 → 16 · reload 0.6 → 0.4 s | slow 30 → 50% · radius 3 → 4 |
| Price | 80, 160, 320, 640, 1280 | 60 → 960 | 50 → 800 | 30 → 480 |
| Unlock | 1–3 after wave 15, 4 after 20, 5 after 30 | 1–3 after 20 | 1–3 after 18 | 1–3 after 20 |
| Overlaps with | nothing: no current tower reaches past 48 | mortar Fire pot / Inferno, captains' fire bombs, fire ships | cannon (already targets boarders first), Grapeshot capstone, captains' cutlass, Barracks militia | Shockwave capstone, harpoon (ships), Spiked/Thorns walls |
| New sim machinery | small: one more tower kind with a target rule (like the harpoon) | per-ship burn state and its tick | spread hits on boarders (Grapeshot has a version) | ground zones and boarder speed per step; depends on paths (T35) |
| Depends on | T33 (health), T34 (target contract) | T33, T34 | T33, T34 | T33, T34, **T35, T36** |

**Choice: A, the culverin.** It is the only candidate that answers an enemy the current towers handle badly by design (the gunboat and the barge choose their anchorage relative to tower reach), it has a clear counter (close ships and boarders), it needs the least new simulation code (one tower kind with its own target rule, the same shape as the harpoon of T1), and it stands on the existing tower spots, so it does not wait for T36. C is the recommended second addition once T34's target matrix is merged; B overlaps too much with existing fire effects; D waits for the path and placement contracts (T35/T36).

## The culverin in detail

Data lives in `frontend/src/pirates/defenses-v2.js` (`DEFENSES_V2.culverin`, what the sim consumes) and `backend/content/defenses_v2.json` (prices, unlocks, spots, card line: what the server checks). Tests keep the two equal.

| Level | Damage | Range | Reload | Min range | Price | Opens after wave |
|---|---|---|---|---|---|---|
| 1 | 30 | 44 | 4.0 s | 12 | 🪙 80 | 15 |
| 2 | 42 | 46 | 3.7 s | 12 | 🪙 160 | 15 |
| 3 | 58 | 48 | 3.4 s | 12 | 🪙 320 | 15 |
| 4 | 76 | 50 | 3.1 s | 12 | 🪙 640 | 20 |
| 5 | 96 | 52 | 2.8 s | 12 | 🪙 1280 | 30 |

- **Build card line:** "A long gun: hits far ships hard but slowly. Hunts gunboats and siege barges first."
- **Target rule** (in this order; ties: the lower ship id): 1) a ship that attacks towers (`gunboat`, the event's `barge`) in range; 2) else the ship with the most hp left (the heavy hulls: ironclads, warships, dreadnoughts); never a boarder, never a ship closer than the minimum range, never the armoured flagship (same rule as the other towers). The shot is aimed ahead of the target and always hits (no dice, like the harpoon), so the random stream of the waves stays untouched and every client agrees.
- **Why these numbers:** its DPS is below a cannon's of the same level (7.5 vs 6.7 at 1, 17 vs 22 at 3, 34 vs 38 at 5), so it does not replace cannons; the reach of 44–52 beats the mortar's 36–48 and covers a gunboat (anchors near 42 from the nearest tower) and a barge (1.42 coast radii out). Level 3 (58) sinks a wave-30 gunboat (20 × 2.82 = 56 hp) in one shot; level 1 needs two at wave 16 (37 hp). It is open from wave 15 because the narrator announces gunboats after wave 15.
- **Watchtower:** the damage boost (levels 3–5) applies; the **range bonus does not** (it would cover the whole sea). Spotter, Eagle eye and War drums apply like for any tower. **Gunners do not man it** (they stay on cannons and mortars, as with the harpoon). No skills or research yet (like the harpoon).
- **Health and recovery** (consistent with T30–T33, which own the lifecycle): `hpShare: 0.7`: 70% of a same-level cannon's hp in T33's table (a glass cannon; the culverin is a high-value target for gunboats and barges already because they aim at the nearest tower). Destroyed: it stops firing, keeps kind and level, and is recovered by the same repair/rebuild rules and price formula T30/T31/T32 agree for towers; ending a wave does not heal it. An upgrade does not repair it (T47).
- **Pirate Point:** no (like the harpoon).
- **Further levels and research.** No level 6, for any kind: the late-game table (GAME-V3 §4.1) already shows research tiers worth about one tower level from wave 50, and the hp curve is tuned to levels 4–5 plus research; a sixth level would mean retuning every wave from 30. Better depth comes from roles: the culverin's level 5 opens at wave 30, where ironclads arrive. A future culverin research branch (not in this PR) could offer tier-1 skills *Chain ball* (a hit slows 30% for 2 s), *Heated shot* (the hull burns 3 s) and *Spotter link* (+10% damage next to a watchtower), priced like the watchtower branch (🪙 160 / 320 / 560); it needs a migration for `islet_buildings.spec` and the research tables, so it is a later PR.

## What (this PR, prep stage)

- `specs/T43-new-defenses.md`: this file.
- `docs/DECISIONS.md`: D048 *proposed*.
- `backend/server/flags.py`: the flag `defenses_v2`, off by default (also `.env.example`, INTERFACES §8, ENGINEERING §4.5 list).
- `backend/content/defenses_v2.json`: the culverin's prices, level waves, spots, card line and narrator line.
- `backend/server/island/catalogue.py`: `read_defenses_v2()` checks the file; `catalogue_for_flags()` merges the culverin into the kinds, the tower spots and the campaign steps only when the flag is on. `backend/server/app.py` applies it once at start-up. With the flag off the catalogue is the same object as before.
- `frontend/src/pirates/defenses-v2.js`: the stats as plain data the sim can consume.
- `frontend/src/island/defenses-v2.js`: the card data and `towerKinds({flags, point})`, which hides the culverin unless `/api/config` says `defenses_v2` is on.
- `frontend/src/art/defenses-v2.js`: original cartoon drawings, levels 1–5 idle and firing, and the shot; registered in `frontend/src/art/registry.js`; recorded in `frontend/ASSETS.md`.
- Tests listed below.

## Out of scope

- Any change to `frontend/src/pirates/sim.js`: another lane is its sole writer. The wiring note below says exactly what it needs.
- The migration that lets `islet_buildings` store `(cannon_n, culverin)`: written in the integration PR, after T36 settles whether the plot rule survives flexible placement (T36 may replace `islet_buildings_plot_fits_building`). **Do not switch `defenses_v2` on before that migration is applied**: the database would refuse the build.
- Wiring the card, world and renderer to the culverin (`card-model.js`, `td-rules.js`, `world.js`, `render.js`, `pirate-catalog.js`): listed in the wiring note; they are shared with T33/T36 right now.
- Candidates B, C, D: later PRs, one addition each.

## Sim wiring note (integration step)

All in `frontend/src/pirates/sim.js` unless named. Import `DEFENSES_V2` from `./defenses-v2.js`.

1. **`KINDS`** (the set near line 243): add `'culverin'`, else `defenses()` drops it.
2. **`CONFIG.levels`**: add `culverin: DEFENSES_V2.culverin.levels.map(({damage, range, reload}) => ({damage, range, reload}))` and `CONFIG.culverin = {minRange, shotSpeed, firstReload}` from the same object, so the cards and the sim read one table (a test like `tiers.test.js` compares them).
3. **Tower list in `createWave`** (`const towers = defenses.filter(item => item.kind === 'cannon' || … 'harpoon')`): include `'culverin'`; its range is `stats.range * eagle + (spec.range ?? 0)` **without** `towerBonus` (`watchtowerRange: false`); damage uses `boost`, `spotted` and the skill as for cannons; `reload` starts at `C.culverin.firstReload`.
4. **Gunners** (`towers.filter(item => item.kind !== 'harpoon')…slice(0, crew.gunner)`): also exclude `'culverin'` (`gunner: false`).
5. **`aimTower(tower)`**: a `tower.kind === 'culverin'` branch before the cannon branch: loop `ships` only; skip `!sees(tower, ship, d)`, `d < C.culverin.minRange`, `armoured(ship)`, `pending(ship) >= ship.hp`; rank `DEFENSES_V2.culverin.priority.includes(ship.kind) ? -1e6 : 0` then `-ship.hp`, ties by id. Never boarders.
6. **Firing** (where `throwHarpoon` is called, near line 1358): a `fireCulverin(tower, target, events)` modelled on `throwHarpoon`: always a hit, flight `distance / C.culverin.shotSpeed`, aim `ahead(target, flight)`, push a ball `{cannonId, targetId, hit: true, damage: tower.damage, culverin: true}` and an event `culverin_fired`. The impact path for balls already deals `damage` and sends `ship_hit`; no new impact code. It must not draw from `random()`.
7. **Jam and silence**: the existing `happening.silenced(tower, t) || jammed(tower, t)` check covers it (it is in `towers`).
8. **Health (T33)**: when T33 adds tower hp, the culverin's max hp is `round(cannonHp(level) * DEFENSES_V2.culverin.hpShare)`; destroyed means skipped in the firing loop, like every tower. T34's `src/pirates/targeting.js` is kind-agnostic (any entry in `world.towers` with hp), so it needs no change. T33's damaged/broken drawings (`src/art/tower-states.js`, `TOWER_KINDS`) cover cannon, mortar and harpoon only: add `island-culverin…-damaged`/`-broken` frames there in the integration PR.
9. **Fog edge / `sight`**: computed from `cannons` only; leave the culverin out (like the harpoon).
10. **`state()`**: towers already expose kind and level; the renderer needs nothing new from the sim beyond `culverin_fired`.
11. Outside sim.js: `render.js` (`towerFrame`, the fire frame on `culverin_fired`, the shot `fx-culverin-ball` from `CULVERIN_ART`), `src/pixel/pirate-catalog.js` (export `CULVERIN_ART` like `HARPOON_ART`), `src/island/world.js` (`LEVEL_ART.culverin`, `DRAWN.culverin = 'island-culverin'`, the two battle-hide lists), `src/island/td-rules.js` / `card-model.js` (`BUILDINGS.culverin` from `CULVERIN_CARD`, `levels.culverin` in `unlocksFor`/`readUnlocks`, tower choices from `towerKinds({flags, point})`), `src/pirates/fake-api.js` (the kind and its prices), `controller.js` (a sound cue), and the migration for the plot rule.
12. **Checks to add then:** a deterministic same-seed replay with a culverin; gunboats sunk before their first shot at waves 16/20/30 with one culverin in place of one cannon (should rise clearly above GAME-V3's 0/8 for the level-3 island); "two culverins instead of two cannons cannot win a wave the cannons win at wave 12" (it is not a straight upgrade); the late-game table unchanged when no culverin is built.

## Done when (acceptance checks)

- [x] `cd backend && uv run pytest -q`: passes, including the new flag, file and catalogue tests.
- [x] `cd backend && uv run ruff check .`: clean.
- [x] `cd frontend && npm test && npm run build`: passes, including the new data, art and flag-off tests.
- [x] `node scripts/check-online-auth.js && node scripts/check-online-signin-gate.js`: pass.
- [x] With `defenses_v2` off, `GET /api/island` is exactly what it was (no culverin in spots, prices or unlocks) and `POST /api/island/build {kind: "culverin"}` is `422 wrong_kind`.
- [ ] `npm run test:mp`: known to fail on `main` for an unrelated reason; result reported in the hand-over.
- [ ] No secrets, private data or generated caches are in the diff.
- [ ] A different human teammate has reviewed and approved the current change.

## Tests to write first

| Test file | Test name | What it proves |
|---|---|---|
| `backend/server/tests/test_flags.py` | `test_flag_names_are_exactly_the_agreed_list` | `defenses_v2` is a known flag, off by default |
| `backend/server/tests/test_defenses_v2.py` | `test_the_file_reads_and_describes_the_culverin` | prices, level waves, spots and line as in the spec |
| same | `test_with_the_flag_off_the_catalogue_is_unchanged` | the same object comes back; no culverin anywhere |
| same | `test_with_the_flag_on_the_culverin_joins_the_tower_spots_and_the_campaign` | kinds, spot kinds and campaign ids merged, nothing else changed |
| same | `test_a_broken_file_is_refused_with_a_clear_message` | unknown spot, wrong length, unsorted waves, a kind that exists, a wave with no campaign step |
| same | `test_flag_off_island_answer_and_build_are_as_before` | the API shows no culverin and refuses it 422 |
| same | `test_flag_on_island_answer_lists_and_locks_the_culverin` | the API shows it on tower spots, its prices and `culverin:1` locked until 15 |
| `frontend/tests/pirates/defenses-v2.test.js` | `the stats are five rising levels the sim can read` | shape, monotonic, DPS below the cannon's, range past the mortar's |
| same | `cards and the server's file agree` | prices, waves, line equal to `defenses_v2.json` |
| same | `the culverin is hidden unless the flag is on` | `towerKinds` and the build card offer no culverin with flags off |
| same | `every level has an idle and a firing drawing in the cannon's box` | art frames exist and are registered |

## Contracts touched

- [ ] API endpoints: none changed with the flag off; with it on, `GET /api/island` spots/prices/unlocks include `culverin` (same shapes).
- [ ] Browser events: none yet; `culverin_fired` is proposed for the integration step.
- [ ] Database tables, policies or functions: none in this PR (see Out of scope).
- [x] Shared lists: feature flag `defenses_v2` (`FLAG_NAMES`, INTERFACES §8, `.env.example`).
- [x] Content format: new file `backend/content/defenses_v2.json`.
- [x] Decisions: D048 proposed.

## Owner and reviewer

- **Responsible teammate:** Nils (`Nilsnova`)
- **Coding agent used, if any:** a coding agent, under Nils's authorization. The teammate stays responsible for its output.
- **Reviewer (a different human teammate):** pending (post-merge review under D047)
- **Last updated:** 2026-11-14
