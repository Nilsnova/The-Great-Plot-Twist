# Build plan: islands, the Harbor and the pirates

> **What this file is:** how we build the game in [PITCH.md](PITCH.md) by Thu 19 Nov (feature freeze), split into four lanes that can work **at the same time without blocking each other**. Every lane owns its own folders and talks to the others only through the contracts in section 3. No lane belongs to a particular person; each member picks one lane today and claims its tasks ([FINAL-ROADMAP.md](FINAL-ROADMAP.md#how-to-pick-and-claim-a-task)).
>
> Last updated: Tue 10 Nov 2026.

## 1. Today, step by step

1. **Pick a lane** (section 4) and claim its first task with a draft pull request (`[P1] ...`).
2. **Start in your own new folder** with the fake data in section 3. You do not need the server or the other lanes.
3. **Branch from current `main`.** Two big changes land on `main` today: the class-code and email-sign-in release, then "the mystery leaves the game" (most case screens deleted). If you started before they landed, merge `main` into your branch once they are in; your new folders will not conflict.
4. **Merge small and often** (at least one pull request per lane per day), so the game on `main` grows every day.

## 2. Timeline

| When | Goal |
|---|---|
| Tue 10 Nov | Plan, contracts and fakes on `main`; the mystery removed; every lane has a first PR open |
| Wed 11 – Fri 13 | Lanes build against fakes; the core lane ships the real API and database |
| Sat 14 – Sun 15 | Wiring day: fakes swapped for the real API; the whole loop playable on `main`: build → wave → loot → Harbor → friend visit |
| Mon 16 – Wed 18 | Polish: visuals, sounds, voices, first-3-minutes playtests, invalid-input tests, walkthrough docs |
| Thu 19 | **Feature freeze**; fresh start for all (progress reset); release to the live site |
| Fri 20 – Sun 22 | Fixes only, README, two demo rehearsals, Moodle submission |

## 3. Contracts (the only things lanes share)

### 3.1 Places

| Game name | Place id in `frontend/src/world/places/registry.js` | What happens there |
|---|---|---|
| Your island | `home_islet` (one per player; a visitor sees the owner's buildings) | Build, ring the bell, defend waves |
| The Harbor | `saltreach_harbor` (shared) | Market stall, match board, fortune teller, weather board, duel ring, everyone online |
| Pirate Point | `lighthouse_isle` (shared) | The joint armada battle and the class demo |

The other places (Gull's Rest, Smugglers' Cove, Wreck Point, The Teeth) leave the sea chart.

### 3.2 The economy (one scale everywhere)

| Thing | 🪙 |
|---|---|
| Starting coins (fresh start) | 100 |
| Wall | 10 |
| Cannon | 30 |
| Watchtower (spots ships earlier, longer cannon range) | 40 |
| House (+5 🪙 loot for every wave you survive) | 50 |
| Loot for surviving wave *n* | 10 + 5 × *n* (+5 per house) |
| Harbor stakes (market, match, fortune) | 5, 10 or 25, nothing else |
| Duel stake | 0 (friendly) or 10 |

- Whole numbers only. Coins always appear as **`🪙 120`** through one helper, `formatCoins(n)` in `frontend/src/lib/coins.js` (lane H builds it on day 1; until then write `🪙 ${n}`).
- Timber leaves the interface; coins are the only resource.

### 3.3 The island

- Fixed build spots, shown as glowing markers you tap: `wall_1`–`wall_4` along the shore, `cannon_1`–`cannon_4` on the corners, `tower_1` on the hill, `house_1`–`house_2` inland. The cabin stands from the start.
- Every island has a code: `ISLE-` + 5 symbols from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (the same alphabet as the class code). Visiting by code puts you on that island.

### 3.4 API (built by lane 0; every lane uses the fake in `frontend/src/pirates/fake-api.js` until then)

| Route | Answer |
|---|---|
| `GET /api/island` | `{code, coins, waveBest, flags, spots: [{id, kind, built, cost}]}` for the signed-in player |
| `POST /api/island/build {spot, kind, actionUid}` | the new island, or `409 insufficient_funds` / `409 spot_taken` / `422 wrong_kind` |
| `GET /api/island/visit/{code}` | `{code, ownerName, waveBest, spots}`; `404 no_such_island` |
| `POST /api/waves/start {where: "own" or island code or "pirate_point", actionUid}` | `{waveId, wave, seed, startsAt, weather: {kind, label, ships, fog}}`; `409 wave_running` |
| `POST /api/waves/finish {waveId, survived, shipsSunk}` | `{loot, coins, waveBest, flags}`; the server caps loot by wave number and checks timing |

Errors use the house shape `{"error": {"code": "spot_taken", "message": "..."}}` (the code is nested under `error`, as on every other route); the message is a plain sentence the panel can show as it is. Besides the codes above the real API can also answer `404 no_such_spot`, `409 wave_too_early` (a finish earlier than 15 s after `startsAt`, with `Retry-After`; the wave keeps running), `403 not_your_wave` and `404 no_such_wave` (only the player who rang the bell may finish), `404 feature_off` (flag `islands` off), `429 too_many_requests` and `401`/`403 demo_closed`. A repeated `actionUid` (build, start) or `waveId` (finish) answers like the first call and never charges or pays twice. The server's details are in [INTERFACES.md](INTERFACES.md#your-island-and-the-pirate-waves-lane-0-tasks-02-and-03).

### 3.5 The wave simulation (built by lane P)

`frontend/src/pirates/sim.js`, pure and deterministic (seeded random, no `Math.random`, no DOM, no Three.js), so every player in the same island sees the same wave:

```js
const wave = createWave({seed, wave: 3, weather: {ships: 1.5, fog: 0.4},
  island: {hp: 100}, defenses: [{id: 'cannon_1', kind: 'cannon', x: 4, z: -3}, ...]});
const events = wave.step(dtSeconds, inputs); // inputs: [{type: 'fire', cannonId, targetId} | {type: 'repair', wallId}]
wave.state();  // {time, ships: [{id, x, z, hp, kind}], walls: [{id, hp}], islandHp, sunk}
wave.done;     // true when every ship is sunk or islandHp is 0
wave.result(); // {survived, shipsSunk, islandHp}
```

Events (also sent on the game's event bus): `wave_countdown`, `wave_started`, `ship_spawned`, `cannon_fired`, `ship_hit`, `ship_sunk`, `wall_damaged`, `wall_repaired`, `island_damaged`, `wave_ended`.

### 3.6 Playing together

- Island room for live presence: `live:place:isle_<code in lowercase>:1`, where the code is the 5 symbols after `ISLE-` (`ISLE-K7Q2M` → `live:place:isle_k7q2m:1`; fits the existing Realtime rules). Pirate Point: `live:place:pirate_point:1`. The Harbor: the existing harbor rooms.
- Broadcasts in a room during a wave: `wave_start {waveId, seed, startsAt}`, `cannon_shot {by, cannonId, targetId, t}`, `wall_repair {by, wallId, t}`. Every client feeds them as inputs into the same simulation.

## 4. Lanes and tasks

Value: ★★★ needed for the loop, ★★ makes it good, ★ polish. Size: S under 2 h, M half a day, L a day.

### Lane P: Pirates (`frontend/src/pirates/`, new pixel art in `frontend/scripts/pixel_art/`)

| ID | Value | Size | Task | Done when |
|---|---|---|---|---|
| P1 | ★★★ | L | **Wave simulation** `sim.js` + `fake-api.js` per section 3.5: ships sail in on 3 lanes, cannons auto-fire at the nearest ship in range, manual shots do double damage, ships that reach a wall damage it, then the island; storm = more ships, fog = shorter sight range | Unit tests for: a won wave, a lost wave, the same seed giving the same result, fog and storm, invalid inputs ignored |
| P2 | ★★★ | M | **Pirate art**: sloop, brig, flagship (3 frames of bobbing each), cannonball, splash, wreck, wall (3 damage states), cannon, watchtower, pirate flag; original, made by the repo's Pillow scripts, credited in `frontend/ASSETS.md` | Contact sheet in the PR; sizes on the 16 px grid |
| P3 | ★★★ | L | **Wave on screen**: ships, cannon fire, splashes, hits and wrecks drawn in the island scene from `wave.state()`; a slim wave bar (wave number, ships left, island ♥) and a 10-second countdown | Screenshot/GIF; 60 fps with 20 ships |
| P4 | ★★ | M | **Man a cannon / repair**: walk to a cannon and tap a ship to fire; tap a damaged wall to repair (costs time, not coins); works with keyboard (E) and touch | Tests for the input mapping; GIF |
| P5 | ★★ | S | **Sounds**: cannon, splash, bell, victory, defeat (the existing procedural audio system) | Settings volume respected |

### Lane H: Harbor and coins (`frontend/src/harbor/`, `frontend/src/lib/coins.js`, the market, prediction and sports screens)

| ID | Value | Size | Task | Done when |
|---|---|---|---|---|
| H1 | ★★★ | S | **`formatCoins()`** and replace every coin display in the game with it; remove decimals and big-number formatting | Grep shows no other coin formatting; tests |
| H2 | ★★★ | L | **Market stall**: one card per asset (Bitcoin, Ether, two stocks): live price, a tiny chart, "Up or down in 1 hour?" with 5 / 10 / 25 🪙. Reuse the Exchange data and routes; hide leverage, positions jargon and P&L tables | Screenshot at 375 and 1280 px; works when prices are closed or offline ("Market closed, back at 15:30") |
| H3 | ★★★ | M | **Match board** (sports) and **fortune teller** (predictions) in the same card style: pick a side, 5 / 10 / 25 🪙, see what you win | Same as H2 |
| H4 | ★★ | M | **Weather board**: today's real weather at your place, and one line on what it does to the pirates ("Storm: 50% more ships tonight") | Uses the existing weather route; fallback text when offline |
| H5 | ★★ | M | **Harbor stalls in the world**: walk up to a stall and press E/tap to open its card; one "Harbor" overview card listing all stalls with a one-sentence explanation each | GIF; every API explained in one sentence |

### Lane U: Look and feel (`frontend/src/ui/`, `frontend/src/ui/kit/`, the HUD, the front door, the goal card)

| ID | Value | Size | Task | Done when |
|---|---|---|---|---|
| U1 | ★★★ | L | **New panel style**: one beautiful card component (parchment-and-brass pixel frame, clear title, one primary button), applied to every remaining panel; consistent spacing, type scale and colors (CSS tokens); stay inside the 12 KB CSS budget | Before/after contact sheet of every panel |
| U2 | ★★★ | M | **HUD with three things only**: 🪙 coins (top left), the quest strip (top right), the menu button. Everything else goes into the menu or appears only when needed | Screenshot during play at 375 and 1280 px |
| U3 | ★★★ | M | **The first 3 minutes** from [PITCH.md](PITCH.md#the-first-3-minutes): goal card, the quest strip steps (build a cannon → ring the bell → sail to the Harbor → place a stake → invite a friend), friendly hints when a player is stuck for 20 s | Hallway test with one outsider; notes in the PR |
| U4 | ★★★ | M | **Play with friends**: "Invite a friend" shows your island code + QR; Join accepts island codes (`ISLE-…`) and the class code (`HARBOR-…`) in one field; the sea chart shows only Your island, The Harbor and Pirate Point | Two-browser test GIF |
| U5 | ★★ | S | **Toasts and feedback**: one toast style; every error shows the server's plain message and a next step | Feedback table in the PR |

### Lane 0: Core (the project owner with Claude): server, database, class battle, release

| ID | Task |
|---|---|
| 0.1 | Remove the mystery from the game and frontend (today) |
| 0.2 | Islands API + migration (new spots and kinds, island codes, visit by code), the new prices; the fresh-start reset script |
| 0.3 | Waves API + migration (wave runs, loot caps, best wave, flags), weather modifier from the real weather |
| 0.4 | Pirate Point battle for the class: one shared wave for everyone in the room, the flagship that only the three lamps can sink |
| 0.5 | New voiced intro (pirates), wiring day (fakes → real API), release, live checks |

### For everyone (pick one when your lane waits)

The walkthrough, test-map, invalid-input, pinning and submission tasks in [FINAL-ROADMAP.md](FINAL-ROADMAP.md) (groups A, D, E and F) stay valid. Each member explains their own lane in the walkthrough sheet (A1).

## 5. Rules for this sprint

- Stay in your lane's folders; if you must touch a shared file (`game.js`, `registry.js`, the HUD), keep the change tiny and say so in the PR title.
- No new packages, services or accounts; no database migrations outside lane 0; no keys in code.
- Every PR: tests for the new logic, screenshots for UI, the explain-back section, and green `npm test` / `npm run build` (and `uv run pytest -q` if you touched the backend).
