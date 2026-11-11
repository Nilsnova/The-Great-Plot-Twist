# Tower defense, version 2 (contract for the 11 Nov evening build)

> **What this file is:** the binding contract for three parallel builds on Wed 11 Nov evening (owner's request: "really increase the tower-defense aspect, keep it simple, play with my brother tonight"). Backend (B), simulation and battle (S), interface (I) build against exactly this. If a build must deviate, it changes this file in the same commit and says so in its report.

## 1. The loop

Fight pirate waves → earn 🪙 loot → build and upgrade towers, hire crew → fight harder waves. Waves go up to **100**; every **5th wave is a boss wave** (a warship); every **10th** brings two. After a won wave an **8-second break** (faster pace, owner 11 Nov; the bell's countdown is 5 s) with a big "Next wave" button (or it starts by itself when the break ends, if "Auto next wave" is on). A lost wave ends the run: you keep your buildings and coins, and the next bell restarts at your best wave minus 2 (at least 1).

## 2. What you can build (coins only, whole numbers)

| Kind | What it does | Level 1 | Level 2 | Level 3 |
|---|---|---|---|---|
| wall | stops boarders on their way to the heart until they hack it down (§12), and takes the ships' cannon fire; hp 60 / 120 / 200 | 🪙 10 | 🪙 20 | 🪙 40 |
| cannon | single target (the boarder nearest the heart first, else a ship; 55% of its balls hit a boarder, 85% a ship); damage 10 / 16 / 24; range 28 / 31 / 34; reload 1.5 / 1.3 / 1.1 s | 🪙 30 | 🪙 60 | 🪙 120 |
| mortar | area damage (radius 4) to all ships and boarders near the impact; damage 14 / 22 / 32; range 36 / 40 / 44; reload 3.5 / 3.0 / 2.6 s; cannot hit ships closer than 8 | 🪙 60 | 🪙 120 | 🪙 240 |
| watchtower | +8 / +12 range to all towers, fog sight bonus | 🪙 40 | 🪙 80 | — |
| house | +5 / +10 loot per won wave | 🪙 50 | 🪙 100 | — |

**Spots on your island (22):** `wall_1`…`wall_6` (shore walls), `cannon_1`…`cannon_7` (cannon **or** mortar: the player chooses at the first build; an upgrade keeps the kind), `tower_1` (watchtower), `house_1`, `house_2` (house), and the **inner ring** `wall_7`…`wall_12` (wall; added 12 Nov for boarding, §12). Final ids, decided by the backend build (D036): the old `cannon_1`…`cannon_4` keep their ids, so built rows stay valid, and `cannon_5`…`cannon_7` are new. The ring walls are ordinary walls (same prices, levels and unlocks: level 1 from the start) placed around the island's heart on the paths the boarders take: `wall_7` east (8.5, 2), `wall_8` and `wall_9` on the south cross path (4.5, 9) and (−4, 9.5), `wall_10` west north of the cabin (−9.5, −1), `wall_11` and `wall_12` on the north cross path (−4, −5.5) and (4, −5.5). The database allows them through `supabase/migrations/20261112020000_inner_walls.sql`; the server lists them in `GET /api/island` after `house_2`.

## 3. Crew (NPC support), bought once, kept

| Crew | What it does | Price | Max |
|---|---|---|---|
| gunner | mans the strongest cannon or mortar: −25% reload for one tower each, aims at the ship closest to the shore | 🪙 40 each | 2 |
| carpenter | repairs the most damaged wall during a wave, 6 hp/s each | 🪙 30 each | 2 |
| lookout | +20% sight in fog and ships show 3 s earlier | 🪙 25 | 1 |

## 4. Loot

Won wave *n*: `25 + 10n` + 10 per house (Pirate Point `40 + 10n`); a boss wave pays ×2 (more money, owner 11 Nov; new players start with 🪙 200). Every participant gets their own loot (as today). A lost wave pays 0.

## 5. Pirate Point (the joint island)

Shared spots `pp_wall_1`…`pp_wall_4`, `pp_tower_1`…`pp_tower_6` (cannon or mortar), anyone can build or upgrade them with their own coins (same prices); the buildings belong to Pirate Point, visible to everyone, kept between battles. Pirate Point waves still bring the flagship that only the three lamps sink.

## 6. Playing with a friend (no class code needed)

Menu → **Play with a friend** shows a link `…/?visit=ISLE-XXXXX` and a QR. The friend opens the link → one tap **Join** → signs in as a guest (or GitHub) → the server admits a guest who presents a **valid island code** (like a class code) → they land on your island and you defend together. Everyone on an island can build and upgrade there with their own coins (co-op, changed 11 Nov by the owner): the buildings belong to that island, the payer's own unlocks count, and everyone earns their own loot from the waves they fight. Crew and the captain stay personal (your own island, your own captain).

## 7. API (backend B; the interface I uses a fake with the same shapes until merged)

All errors `{"error": {"code", "message"}}` with a plain message.

| Route | Body | Answer / refusals |
|---|---|---|
| `GET /api/island` | — | adds `level` per spot, `crew: {gunner, carpenter, lookout}`, `prices` (build and upgrade per kind and level, crew prices), `waveBest`, `nextWave` |
| `POST /api/island/build` | `{spot, kind, actionUid, code?}` | kind may be `cannon` or `mortar` on tower spots; refusals as today plus `wrong_kind`, `locked`. With `code: "ISLE-XXXXX"` the building goes up on that island (co-op, section 6), paid by the caller with their own unlocks; the answer is that island with the caller's own coins, crew, captain and unlocks; `404 no_such_island` |
| `POST /api/island/upgrade` | `{spot, actionUid, code?}` | the island; `409 max_level`, `409 not_built`, `409 locked`, `409 insufficient_funds`; `code` as for a build |
| `GET /api/island/visit/{code}` | — | `{code, ownerName, waveBest, spots, crew}`: spots in the shape of `GET /api/island` (with `kind` and `level`) and the owner's crew, so every player simulates the same defenses |
| `POST /api/island/hire` | `{crew: gunner|carpenter|lookout, actionUid}` | the island; `409 crew_full`, `409 insufficient_funds` |
| `GET /api/pirate-point` | — | `{spots: [{id, kind, level, built, cost, upgradeCost}], waveBest}` |
| `POST /api/pirate-point/build` and `/upgrade` | `{spot, kind?, actionUid}` | the Pirate Point state; same refusals |
| `POST /api/island/invite/join` | `{code: "ISLE-XXXXX", actionUid}` | admits an anonymous guest who presents a valid island code (same admission table as the class code) → `{admitted: true, island: {code, ownerName}}`; `404 no_such_island`, `429` |
| `POST /api/waves/start` | as today | `wave` can now reach 100; answer adds `boss: true|false` |
| `POST /api/waves/finish` | as today | loot per section 4 |

## 8. Simulation (S)

`createWave({..., defenses: [{id, kind, level, x, z}], crew: {gunner, carpenter, lookout}, boss, heart})` — towers act per section 2, crew per section 3 (the carpenter also rebuilds a broken wall, §12), warship: hp 200, speed 1.45, damage 10 every 2 s, sprite = the flagship art at 70% scale without the lamps rule. Ship count and hp grow with the wave number so wave 10 is a real fight with 4 upgraded towers and wave 30 needs most of the island built and upgraded; tested balance numbers go into the report.

**Pace (owner, 11 Nov: "more fast paced").** Ships sail 30% faster than the first build (sloop 2.6, brig 1.7, warship 1.45, flagship 1.05 units/s) with lighter hulls (sloop 24, brig 60, warship 200 hp; the boarders are now the main threat), spawn about 45% closer together (first ship at 1.5 s, gap 4.4 s − 0.4 s per wave, at least 0.8 s, all within 36 s), and every cannon and mortar reloads in 70% of the time in the table of §2 (`CONFIG.pace.reload`). Measured with the balance fixture (8 seeds, mean): wave 1 with one cannon 15 s (was 24 s, −37%); wave 5 (boss) 44 s (was 64 s, −31%); wave 10 with the mid island 39 s (was 49 s, −20%); wave 20 with the full island 24 s (was 39 s, −38%); wave 29 31 s (was 52 s, −40%). The shortest wave 1 seen is 11.4 s (the last of its three ships appears at 10.3 s), so a finish earlier than 10 s is refused (`waves.minimumSeconds`, 15 before).

**Boarding (§12).** An anchored ship unloads its boarders; ships shell the walls within 8 units and, with none in reach, the island at 1.5% of their damage. The wave is won when every ship is sunk and every boarder is dead (or when the pirates sail off after 150 s). Sim inputs add `{type: 'rebuild', wallId}` and `{type: 'captain_strike', by, targetId, level, x, z}`; `state()` adds `boarders: [{id, x, z, hp, maxHp, state: walking|hacking, wallId, facing}]`, `boardersLeft`, `boardersKilled`, per wall `broken`, `inner` and `rebuildReady`, and per ship `crew`; events add `ship_anchored`, `boarder_landed`, `boarder_hit`, `boarder_killed`, `captain_struck` and `wall_rebuilt`, and `wall_damaged` / `island_damaged` carry `boarderId` instead of `shipId` when a boarder did it.

## 9. Unlocks: simple at the start, deeper as you go (added 11 Nov, owner)

New players see only what they can use. Everything else appears with a toast "New: … unlocked!" when the player first **wins** the wave shown (the best wave of their own island, or any wave they fought in and won: any island, a friend's too, or Pirate Point). The server enforces it (`409 locked` with "Unlocks after wave N").

| Unlocks after winning wave | What appears |
|---|---|
| start | wall level 1, cannon level 1, your captain's musket (level 1) |
| 1 | captain upgrades |
| 2 | level 2 for wall and cannon, house |
| 3 | mortar, watchtower |
| 5 | crew: gunner and carpenter; level 3 |
| 8 | lookout, captain level 4–5 |

## 10. Your captain fights (added 11 Nov, owner)

Every player's character carries a musket: **tap or click a ship in range** (or press F for the nearest) to shoot. It works on your island, on a friend's island and at Pirate Point.

| Captain level | Damage | Range | Reload | Upgrade price |
|---|---|---|---|---|
| 1 | 6 | 14 | 1.2 s | — |
| 2 | 9 | 15 | 1.05 s | 🪙 20 |
| 3 | 13 | 16 | 0.9 s | 🪙 40 |
| 4 | 18 | 18 | 0.75 s | 🪙 80 |
| 5 | 24 | 20 | 0.6 s | 🪙 160 |

API: `GET /api/island` adds `captain: {level, nextPrice}` and `unlocks: {…}` (what is unlocked and at which wave the rest comes); `POST /api/island/captain {actionUid}` upgrades one level (`409 max_level`, `409 locked`, `409 insufficient_funds`). Sim input `{type: 'captain_shot', by, targetId, level}` (synced in the room like cannon shots; each player's own level).

## 11. Up to four players together

The same invite link works for several friends at once (up to 4 players on one island; the presence room shows them all with name tags). Every participant's captain fights and earns loot.

## 12. Boarding and close combat (added 12 Nov, owner: "make the pirates leave the boats once boarding so we enter close quarter combat; also more wall building (to surround, and then repair once broken)")

**Boarders.** A ship that reaches its anchorage off the shore drops anchor and its crew climbs out one by one, every **1.2 s**, until the crew is out or the ship sinks (its crew sinks with it):

| Ship | Boarders | | Boarder | Value |
|---|---|---|---|---|
| sloop | 2 | | hp | 20 × the wave's hp curve (§8) |
| brig | 3 | | speed | 2.8 units/s, briskly (× the speed curve) |
| flagship (Pirate Point) | 4 | | hack | 2.5 hp a second on a wall (× the damage curve) |
| warship | 6 | | at the heart | −14 ♥ (× the damage curve), then gone |
| every ship | +1 every 15 waves (wave 16, 31, …), at most 12 | | | |

A boarder wades ashore, fans out (±30°) and walks to the **island's heart**: the crossroads between the houses, the cabin and the bell (0, 2) on your island; the lamps' yard (7, −5) at Pirate Point. On the way two walls may stand in its route, fixed when it lands: the shore wall within 7 units of its landing, and the ring wall (a wall within 12 units of the heart, 6 at Pirate Point) whose bearing from the heart is closest to its heading, within 50°. A **standing** wall stops it: it hacks the wall until it breaks, then walks on over the rubble. A broken wall stops nobody. A full ring of six closes every heading, so the ring is how you **surround** the heart. The island's ♥ is lost mainly through boarders: ships at anchor shell walls in reach and the island only lightly.

**One target rule.** A boarder's target is chosen in one function, `pickBoarderTarget(boarder)` in `src/pirates/sim.js`, with an `attackCaptain` hook comment: captain health, falling and reviving (a later lane) adds "the nearest captain within reach" there; captains have no hp yet.

**Defenders.** Cannons take the boarder nearest the heart first (55% of balls hit a small pirate on foot), then ships as before; mortars hit boarders in their blast but keep their minimum range; the captain's musket shoots boarders too (F picks the nearest ship or boarder in range; tapping a boarder shoots it). **Close quarters:** with a boarder within **2.2** units of your captain, F and the musket button (its label becomes **Cutlass**) swing the **cutlass** instead: an instant blow at the nearest boarder, damage 14 / 18 / 24 / 30 / 38 by captain level, reload **0.5 s**. It is the sim input `{type: 'captain_strike', by, targetId, level, x, z}`, sent through the room as `captain_strike` with the musket shot's fields (`src/pirates/sync.js`, `src/net/live-rules.js`), so every player sees the same fight. All captain numbers live in `CONFIG.captain` (`levels` for the musket, `cutlass`), ready for a later skills helper to scale.

**Repair once broken.** During a wave, at a damaged wall E says **Repair** (as before, +10 hp/s for 3 s; it no longer works on a broken wall); at a **broken** wall E says **Rebuild**: the wall comes back at **40%** of its hp at once (sim input `{type: 'rebuild', wallId}`, room event `wall_rebuild`), then the same wall cannot be rebuilt again for 5 s. The carpenter takes the most damaged wall, a broken one first, and rebuilds it to 40% after 8 s of work (two carpenters on one wall take half the time). After a wave every wall is whole again (a wave starts from the built levels).

**Balance (8 seeds each, the fixture of `tests/pirates/balance-fixture.js`).** With nothing built wave 1 leaves the island at about 2 ♥ and waves 2 and 3 are lost (98% of the heart's damage then comes from boarders; on the mid island at wave 10, 77%). One level-1 cannon wins wave 3 in 5 of 8 seeds (about 19 ♥ left), with the inner ring 7 of 8 (about 55 ♥). Two level-1 cannons with the ring win wave 3 (8 of 8). The wave-5 boss: 3 level-2 cannons, 2 shore walls and the ring win 8 of 8 (about 88 ♥); level-1 cannons with 2 walls none. Wave 10: five upgraded towers with a mortar win 8 of 8 (about 86 ♥), 3 of 8 at wave 15, none at wave 20. The full island (all 22 spots, mostly level 3, crew) holds waves 15 to 31, wins 4 of 8 at wave 33 and falls from wave 35 on.

**Art.** `pirate-boarder-1`, `-2` (walking) and `-3` (hacking, the cutlass raised) and `captain-cutlass` (the swing) in `scripts/pixel_art/pirates.py`; boarders draw with a hit flash, small hp pips when hurt and a puff of smoke when they fall, sorted with the island by their position; the ring walls draw like the shore walls.

