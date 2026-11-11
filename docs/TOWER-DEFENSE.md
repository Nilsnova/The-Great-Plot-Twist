# Tower defense, version 2 (contract for the 11 Nov evening build)

> **What this file is:** the binding contract for three parallel builds on Wed 11 Nov evening (owner's request: "really increase the tower-defense aspect, keep it simple, play with my brother tonight"). Backend (B), simulation and battle (S), interface (I) build against exactly this. If a build must deviate, it changes this file in the same commit and says so in its report.

## 1. The loop

Fight pirate waves → earn 🪙 loot → build and upgrade towers, hire crew → fight harder waves. Waves go up to **100**; every **5th wave is a boss wave** (a warship); every **10th** brings two. After a won wave a **15-second break** with a big "Next wave" button (or it starts by itself when the break ends, if "Auto next wave" is on). A lost wave ends the run: you keep your buildings and coins, and the next bell restarts at your best wave minus 2 (at least 1).

## 2. What you can build (coins only, whole numbers)

| Kind | What it does | Level 1 | Level 2 | Level 3 |
|---|---|---|---|---|
| wall | blocks ships at the shore; hp 60 / 120 / 200 | 🪙 10 | 🪙 20 | 🪙 40 |
| cannon | single target; damage 10 / 16 / 24; range 28 / 31 / 34; reload 1.5 / 1.3 / 1.1 s | 🪙 30 | 🪙 60 | 🪙 120 |
| mortar | area damage (radius 4) to all ships near the impact; damage 14 / 22 / 32; range 36 / 40 / 44; reload 3.5 / 3.0 / 2.6 s; cannot hit ships closer than 8 | 🪙 60 | 🪙 120 | 🪙 240 |
| watchtower | +8 / +12 range to all towers, fog sight bonus | 🪙 40 | 🪙 80 | — |
| house | +5 / +10 loot per won wave | 🪙 50 | 🪙 100 | — |

**Spots on your island (16):** `wall_1`…`wall_6` (wall), `tower_s1`…`tower_s7` (cannon **or** mortar: the player chooses at the first build; an upgrade keeps the kind), `tower_1` (watchtower), `house_1`, `house_2` (house). The old `cannon_1`…`cannon_4` spots stay valid as tower spots that accept cannon or mortar (so `tower_s1`…`tower_s4` may simply be those; the backend decides the ids and reports them).

## 3. Crew (NPC support), bought once, kept

| Crew | What it does | Price | Max |
|---|---|---|---|
| gunner | mans the strongest cannon or mortar: −25% reload for one tower each, aims at the ship closest to the shore | 🪙 40 each | 2 |
| carpenter | repairs the most damaged wall during a wave, 6 hp/s each | 🪙 30 each | 2 |
| lookout | +20% sight in fog and ships show 3 s earlier | 🪙 25 | 1 |

## 4. Loot

Won wave *n*: `10 + 5n` + houses bonus; a boss wave pays ×2. Every participant gets their own loot (as today). A lost wave pays 0.

## 5. Pirate Point (the joint island)

Shared spots `pp_wall_1`…`pp_wall_4`, `pp_tower_1`…`pp_tower_6` (cannon or mortar), anyone can build or upgrade them with their own coins (same prices); the buildings belong to Pirate Point, visible to everyone, kept between battles. Pirate Point waves still bring the flagship that only the three lamps sink.

## 6. Playing with a friend (no class code needed)

Menu → **Play with a friend** shows a link `…/?visit=ISLE-XXXXX` and a QR. The friend opens the link → one tap **Join** → signs in as a guest (or GitHub) → the server admits a guest who presents a **valid island code** (like a class code) → they land on your island and you defend together. Both can build on the host's island? **No**: only the owner builds on their island; a visitor's coins go to their own island; both earn loot from waves they fight.

## 7. API (backend B; the interface I uses a fake with the same shapes until merged)

All errors `{"error": {"code", "message"}}` with a plain message.

| Route | Body | Answer / refusals |
|---|---|---|
| `GET /api/island` | — | adds `level` per spot, `crew: {gunner, carpenter, lookout}`, `prices` (build and upgrade per kind and level, crew prices), `waveBest`, `nextWave` |
| `POST /api/island/build` | `{spot, kind, actionUid}` | kind may be `cannon` or `mortar` on tower spots; refusals as today plus `wrong_kind` |
| `POST /api/island/upgrade` | `{spot, actionUid}` | the island; `409 max_level`, `409 not_built`, `409 insufficient_funds` |
| `POST /api/island/hire` | `{crew: gunner|carpenter|lookout, actionUid}` | the island; `409 crew_full`, `409 insufficient_funds` |
| `GET /api/pirate-point` | — | `{spots: [{id, kind, level, built, cost, upgradeCost}], waveBest}` |
| `POST /api/pirate-point/build` and `/upgrade` | `{spot, kind?, actionUid}` | the Pirate Point state; same refusals |
| `POST /api/island/invite/join` | `{code: "ISLE-XXXXX", actionUid}` | admits an anonymous guest who presents a valid island code (same admission table as the class code) → `{admitted: true, island: {code, ownerName}}`; `404 no_such_island`, `429` |
| `POST /api/waves/start` | as today | `wave` can now reach 100; answer adds `boss: true|false` |
| `POST /api/waves/finish` | as today | loot per section 4 |

## 8. Simulation (S)

`createWave({..., defenses: [{id, kind, level, x, z}], crew: {gunner, carpenter, lookout}, boss})` — towers act per section 2, crew per section 3, warship: hp 260, speed 1.1, damage 10 every 2 s, sprite = the flagship art at 70% scale without the lamps rule. Ship count and hp grow with the wave number so wave 10 is a real fight with 4 upgraded towers and wave 30 needs most of the island built and upgraded; tested balance numbers go into the report.

## 9. Unlocks: simple at the start, deeper as you go (added 11 Nov, owner)

New players see only what they can use. Everything else appears with a toast "New: … unlocked!" when the player first **wins** the wave shown (best wave on their own island, or any Pirate Point wave they fought in). The server enforces it (`409 locked` with "Unlocks after wave N").

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
