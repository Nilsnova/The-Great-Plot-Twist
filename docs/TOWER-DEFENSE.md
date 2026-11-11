# Tower defense, version 2 (contract for the 11 Nov evening build)

> **What this file is:** the binding contract for three parallel builds on Wed 11 Nov evening (owner's request: "really increase the tower-defense aspect, keep it simple, play with my brother tonight"). Backend (B), simulation and battle (S), interface (I) build against exactly this. If a build must deviate, it changes this file in the same commit and says so in its report.

## 1. The loop

Fight pirate waves → earn 🪙 loot → build and upgrade towers, hire crew → fight harder waves. Waves go up to **100**; every **5th wave is a boss wave** (a warship); every **10th** brings two. After a won wave an **8-second break** (faster pace, owner 11 Nov; the bell's countdown is 5 s) with a big "Next wave" button (or it starts by itself when the break ends, if "Auto next wave" is on). A lost wave ends the run: you keep your buildings and coins, and the next bell restarts at your best wave minus 2 (at least 1).

## 2. What you can build (coins only, whole numbers)

| Kind | What it does | Level 1 | Level 2 | Level 3 |
|---|---|---|---|---|
| wall | blocks ships at the shore; hp 60 / 120 / 200 | 🪙 10 | 🪙 20 | 🪙 40 |
| cannon | single target; damage 10 / 16 / 24; range 28 / 31 / 34; reload 1.5 / 1.3 / 1.1 s | 🪙 30 | 🪙 60 | 🪙 120 |
| mortar | area damage (radius 4) to all ships near the impact; damage 14 / 22 / 32; range 36 / 40 / 44; reload 3.5 / 3.0 / 2.6 s; cannot hit ships closer than 8 | 🪙 60 | 🪙 120 | 🪙 240 |
| watchtower | +8 / +12 range to all towers, fog sight bonus | 🪙 40 | 🪙 80 | — |
| house | +5 / +10 loot per won wave | 🪙 50 | 🪙 100 | — |

**Spots on your island (16):** `wall_1`…`wall_6` (wall), `cannon_1`…`cannon_7` (cannon **or** mortar: the player chooses at the first build; an upgrade keeps the kind), `tower_1` (watchtower), `house_1`, `house_2` (house). Final ids, decided by the backend build (D036): the old `cannon_1`…`cannon_4` keep their ids, so built rows stay valid, and `cannon_5`…`cannon_7` are new.

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
| `GET /api/island` | — | adds `level` per spot, `crew: {gunner, carpenter, lookout}`, `prices` (build and upgrade per kind and level, crew prices), `waveBest`, `nextWave`; `skills: {points, spent, known, tree}` (§14) and `weapons: {owned, equipped, shop}` (§15) |
| `POST /api/island/build` | `{spot, kind, actionUid, code?}` | kind may be `cannon` or `mortar` on tower spots; refusals as today plus `wrong_kind`, `locked`. With `code: "ISLE-XXXXX"` the building goes up on that island (co-op, section 6), paid by the caller with their own unlocks; the answer is that island with the caller's own coins, crew, captain and unlocks; `404 no_such_island` |
| `POST /api/island/upgrade` | `{spot, actionUid, code?}` | the island; `409 max_level`, `409 not_built`, `409 locked`, `409 insufficient_funds`; `code` as for a build |
| `GET /api/island/visit/{code}` | — | `{code, ownerName, waveBest, spots, crew}`: spots in the shape of `GET /api/island` (with `kind` and `level`) and the owner's crew, so every player simulates the same defenses |
| `POST /api/island/hire` | `{crew: gunner|carpenter|lookout, actionUid}` | the island; `409 crew_full`, `409 insufficient_funds` |
| `POST /api/island/skill` | `{skill, actionUid}` | the island (§14); `400 bad_skill`, `409 known`, `409 locked` ("Learn Steady aim first."), `409 no_points` ("Win new waves to earn skill points.") |
| `POST /api/island/weapon/buy` | `{weapon, actionUid}` | the island, the weapon bought and equipped (§15); `400 bad_weapon`, `409 owned`, `409 locked` ("Unlocks after wave N."), `409 insufficient_funds` |
| `POST /api/island/weapon/equip` | `{weapon}` | the island (§15); `400 bad_weapon`, `409 not_owned`. Safe to repeat |
| `GET /api/pirate-point` | — | `{spots: [{id, kind, level, built, cost, upgradeCost}], waveBest}` |
| `POST /api/pirate-point/build` and `/upgrade` | `{spot, kind?, actionUid}` | the Pirate Point state; same refusals |
| `POST /api/island/invite/join` | `{code: "ISLE-XXXXX", actionUid}` | admits an anonymous guest who presents a valid island code (same admission table as the class code) → `{admitted: true, island: {code, ownerName}}`; `404 no_such_island`, `429` |
| `POST /api/waves/start` | as today | `wave` can now reach 100; answer adds `boss: true|false` |
| `POST /api/waves/finish` | as today | loot per section 4 |

## 8. Simulation (S)

`createWave({..., defenses: [{id, kind, level, x, z}], crew: {gunner, carpenter, lookout}, boss})` — towers act per section 2, crew per section 3, warship: hp 260, speed 1.1, damage 10 every 2 s, sprite = the flagship art at 70% scale without the lamps rule. Ship count and hp grow with the wave number so wave 10 is a real fight with 4 upgraded towers and wave 30 needs most of the island built and upgraded; tested balance numbers go into the report.

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

API: `GET /api/island` adds `captain: {level, nextPrice}` and `unlocks: {…}` (what is unlocked and at which wave the rest comes); `POST /api/island/captain {actionUid}` upgrades one level (`409 max_level`, `409 locked`, `409 insufficient_funds`). Sim input `{type: 'captain_shot', by, targetId, level, skills, weapon, x, z, ax?, az?}` (synced in the room like cannon shots; each player's own level, learnt skills (§14) and equipped weapon (§15); `ax, az` is the aim point of a spray or a bomb, `targetId` may then be null). A repair carries the repairer's skills too: `{type: 'repair', wallId, skills}`. Every client computes the numbers with `captainStats(level, skills, weapon)` in `frontend/src/pirates/captain-stats.js`, so a shot lands the same everywhere. The room accepts an older message without `skills` and `weapon` as no skills and the musket.

Menu › **Captain and skills** has three tabs: Captain (the musket level, as above), Skills (§14) and Weapons (§15). A click anywhere on the water fires the equipped weapon that way (free aim); the musket button shows the weapon's name.

## 11. Up to four players together

The same invite link works for several friends at once (up to 4 players on one island; the presence room shows them all with name tags). Every participant's captain fights and earns loot.

## 13. How to play (added 11 Nov, owner: "a longer intro, and a tutorial in the menu")

- **Menu › How to play** opens a paged card (kit panel) with 10 short pages: your island and coins · build · ring the bell · your captain fights · pirates come ashore · crew and captain skills · more as you win · play with a friend · the Harbor and Pirate Point · controls. Back / Next, page dots, arrow keys, Escape, a swipe on phones; each page shows existing pixel sprites.
- **First Play:** after the voiced lore intro, the first 4 pages (island, build, bell, captain) show once, with **Skip** and **Start playing**; then the goal card and the island arrival as before. The device remembers it (`localStorage` `plot_twist_tutorial_v1`), so returning players never see it again. A player who came with a class code skips it (the class demo keeps its own goals and must start fast).
- **All page text** lives in one module, `frontend/src/tutorial/pages.js`; change the words there only. When a feature changes (boarders, captain skills), update its page in the same commit.
- Browser checks that start from Play skip the pages with the card's **Skip** button (`.tutorial-card[open]`).

## 14. Captain skills (added 11 Nov, owner: "make a skill tree for the player themselves")

Every player earns **skill points** by winning new waves: `points = floor(won_wave_best / 2)` minus the points spent (`won_wave_best`: the best wave this player won themselves, anywhere: their island, a friend's or Pirate Point). No coins. Shown as "Skill points: N".

Three branches, three tiers each. Tier 2 needs tier 1 of the same branch, tier 3 needs tier 2. Tier 1 costs 1 point, tier 2 costs 2, tier 3 costs 3.

| Branch | Tier 1 (1 point) | Tier 2 (2 points) | Tier 3 (3 points) |
|---|---|---|---|
| 🎯 Marksman | Steady aim: gun damage +25% | Long barrel: gun range +3 | Quick hands: gun reload −25% |
| ⚔️ Brawler | Cutlass: close-quarters strike damage +50% | Sweep: a strike also hits every other boarder within 2 units for half damage | Second wind: strike reload −30% |
| 🔨 Shipwright | Quick fix: your wall repairs +50% | Long reach: you repair walls from 2 units farther | Master shipwright: your repairs +100% instead of +50%, and a rebuilt wall comes back with 60% hp instead of 40% |

Ids: `steady_aim`, `long_barrel`, `quick_hands`, `cutlass`, `sweep`, `second_wind`, `quick_fix`, `long_reach`, `master_shipwright`. The Marksman skills apply to every weapon of §15.

- **One module.** All effects come from `captainStats(level, skills, weapon)` in `frontend/src/pirates/captain-stats.js`: `{damage, range, reload, strikeMultiplier, strikeReloadMultiplier, sweep, sweepRadius, sweepShare, repairMultiplier, repairReach, rebuildShare, …}`. The sim uses it for captain shots and repairs, the controller for range, reload and how far you reach a wall. The cutlass strike (`captain_strike`) and the wall rebuild come from another branch: they read `strikeMultiplier`, `strikeReloadMultiplier`, `sweep*` and `rebuildShare` from the same function.
- **Server.** `islands.captain_skills text[]` (check: known ids only), `island_learn_skill()` (migration `20261112030000_captain_skills.sql`): tier order, points from `won_wave_best`, safe to repeat by `actionUid` (table `captain_skill_learns`). The tree, the costs and the waves per point live in `backend/content/islands.json` (`captainSkills`).
- **Interface.** Menu › Captain and skills › Skills: the points on top, three columns (icon and name on top, tiers from top to bottom, a line between tiers that turns gold once the tier above is learned), each skill learned (✓, green), can learn (gold edge) or locked (🔒, dark), with cost dots. Tap a skill to see its one line and a **Learn** button. Toast: "New skill: Steady aim!".

## 15. Weapons (added 11 Nov, owner: "a weapon shop with cool upgrades, also to shoot differently")

Weapons are bought **once** with coins and then equipped, one at a time. The equipped weapon changes **how** your captain shoots. Its numbers scale your musket level (§10) and the Marksman skills (§14) apply on top. No gun reloads faster than 0.3 s (the room sends at most one wave message every 200 ms).

| Weapon | Price | Unlocks after wave | How it shoots (at musket level 1) |
|---|---|---|---|
| Musket | free | start | one ship; damage 6, range 14, reload 1.2 s (§10) |
| Pistols | 🪙 60 | 2 | one ship; damage ×0.5 (3), range −4 (10), reload ×0.4 (0.48 s) |
| Blunderbuss | 🪙 120 | 4 | a spray: up to 3 ships inside a 50° cone towards the aim point, nearest first; damage ×0.8 (4.8 each), range −5 (9), reload ×1.6 |
| Long rifle | 🪙 200 | 6 | one ship and the next one behind it on the same line (within 8 units, 1.5 wide); damage ×1.8 (10.8 each), range +8 (22), reload ×1.8 |
| Fire bombs | 🪙 300 | 10 | thrown on an arc to the aim point (at most the range away), bursts after 0.9 s + 0.02 s per unit: every ship within 3 units; damage ×1.5 (9 each), reload ×2.4 |

- **Deterministic.** The synced `captain_shot` carries the weapon id and, for a spray or a bomb, the aim point `ax, az`; the sim resolves cone, pierce and area hits itself (events `captain_fired` with `weapon` and `targets`, and `captain_blast` when a bomb bursts). A free-aim click with a one-ship gun hits the ship in range nearest the aim point (within 8 units), else it is a miss shown only on your screen.
- **Server.** `islands.weapons_owned text[] default '{musket}'` and `weapon_equipped text default 'musket'` (checks: known ids, the musket always owned, the equipped one owned); `island_weapon_buy()` pays through the wallet ledger (reason `weapon_purchase`, ref `weapon:<actionUid>`, locks the wallet then the island, like the captain upgrade) and equips the weapon; `island_weapon_equip()`. Prices and unlock waves live in `backend/content/islands.json` (`weapons`); the lock compares with the same best won wave as §9.
- **Interface.** Menu › Captain and skills › Weapons: one row per weapon with its line and Buy · 🪙 N / Equip / Equipped / Locked. The musket button shows the equipped weapon's name. Each weapon looks its own: the musket's gold tracer, the pistols' thin white streak, the blunderbuss's three orange streaks and a smoke puff, the rifle's pale line through both ships, the bomb's burning arc and its fiery blast. A toast "New in the weapon shop: Pistols!" when a won wave unlocks one.
