# Build plan: islands, the Harbor and the pirates

> **What this file is:** how we build the game in [PITCH.md](PITCH.md) by Thu 19 Nov (feature freeze), split into four lanes that can work **at the same time without blocking each other**. Every lane owns its own folders and talks to the others only through the contracts in section 3. No lane belongs to a particular person; each member picks one lane today and claims its tasks ([FINAL-ROADMAP.md](FINAL-ROADMAP.md#how-to-pick-and-claim-a-task)).
>
> Last updated: Wed 11 Nov 2026 (task status added to section 4).

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
| The Harbor | `saltreach_harbor` (shared) | Market stall, match board, weather board, duel ring, everyone online (the fortune teller was removed on 11 Nov at the owner's request, D035) |
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
| Harbor stakes (market, match) | 5, 10 or 25, nothing else |
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
| `POST /api/island/upgrade {spot, actionUid, code?}`, `/hire {crew, actionUid}`, `/captain {actionUid}` (build and upgrade take an optional `code` to build on a friend's island with your own coins) | the island; tower defense v2 ([TOWER-DEFENSE.md](TOWER-DEFENSE.md) section 7, D036): `409 max_level` / `not_built` / `crew_full` / `locked` / `insufficient_funds`. `GET /api/island` adds `nextWave`, per spot `kinds`, `level`, `upgradeCost`, and `crew`, `captain`, `prices`, `unlocks` |
| `GET /api/pirate-point`, `POST /api/pirate-point/build {spot, kind, actionUid}`, `/upgrade {spot, kind?, actionUid}` | `{spots: [{id, kind, kinds, built, level, cost, upgradeCost}], waveBest, coins}`; the clicker pays; same refusals |
| `POST /api/island/invite/join {code, actionUid}` | `{admitted: true, island: {code, ownerName}}`: admits an anonymous guest with a valid island code (the class code's admission table); `404 no_such_island`, `429` |
| `GET /api/market/calls` | `{assets: [{id, name, price, priceAt, open, closedReason}], calls: [{id, asset, direction, stake, openPrice, openedAt, settleAt, status, settlePrice, payout}], balance}`; the five assets are `harbor-trust` (Bitcoin), `tidewright-works` (Ether), `greyfathom-salvage` (Gold), `apple`, `nvidia`; due calls are decided on this read (`status` `won`, `lost` or `refunded`); flag `market` |
| `POST /api/market/calls {asset, direction: "up" or "down", stake: 5, 10 or 25, actionUid}` | the new call (a `calls` entry) plus `balance`; decided 1 hour later: right pays 2 × stake, wrong 0, same price or no price within 24 h refunds; `409 insufficient_funds` / `409 market_closed` / `409 too_many_calls` (3 open) / `422 bad_stake` / `404 no_such_asset` |
| `POST /api/waves/start {where: "own" or island code or "pirate_point", actionUid}` | the wave `{waveId, wave, seed, startsAt, weather: {kind, label, ships, fog}, flagship}`; `409 wave_running`. The bell-ringer is the first participant. `flagship` is `true` on Pirate Point (the flagship only the three lamps sink), else `false` |
| `POST /api/waves/join {waveId}` | the same wave shape; only while the wave runs (`409 wave_over` once someone finished it or 900 s after `startsAt`); joining twice is fine |
| `GET /api/waves/current?where=own or island code or pirate_point` | the running wave there in the same shape, or `null` (a friend who sails in mid-wave calls this, then join) |
| `POST /api/waves/finish {waveId, survived, shipsSunk}` | `{loot, coins, waveBest, flags, boss}` for **this** player (v2: the wave shape adds `boss`, every 5th wave, loot × 2; up to wave 100; after a lost island wave the next is best − 2, at least 1): every participant finishes their own part once and gets their own loot (island: 10 + 5 × wave + 5 × houses; Pirate Point: 20 + 5 × wave). The island's best wave and one flag count once per wave. `403 not_in_wave` if the player never joined |

Errors use the house shape `{"error": {"code": "spot_taken", "message": "..."}}` (the code is nested under `error`, as on every other route); the message is a plain sentence the panel can show as it is. Besides the codes above the real API can also answer `404 no_such_spot`, `409 wave_too_early` (a finish earlier than 15 s after `startsAt`, with `Retry-After`; the wave keeps running), `404 no_such_wave`, `404 feature_off` (flag `islands` off), `429 too_many_requests` and `401`/`403 demo_closed`. A repeated `actionUid` (build, start), `waveId` (join, finish) answers like the first call and never charges or pays twice. The wave weather is the real weather where the bell was rung (else the default place, else calm). The server's details are in [INTERFACES.md](INTERFACES.md#your-island-and-the-pirate-waves-lane-0-tasks-02-and-03).

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
- **Quest events** (lane U, the first-3-minutes quest strip): emit these on the game's event bus (`emit` in `frontend/src/core/events.js`), importing the names from `frontend/src/ui/quest-events.js` (`QUEST_EVENTS`), never as typed strings. The strip listens only for the current goal, so the order is fixed; a wrong payload simply does not count.

  | Event | Payload | Who emits it | Goal it completes |
  |---|---|---|---|
  | `island_built` | `{kind}`: `'wall'`, `'cannon'`, `'tower'` or `'house'` | lane P / island, when a building finishes on the player's own island | 1 Build a cannon (`kind: 'cannon'`) |
  | `wave_finished` | `{survived}`: `true` when the island held | lane P, when a wave ends | 2 Ring the bell and win a wave (`survived: true`) |
  | `place_arrived` | `{id}`: a place id from section 3.1 | island / world, on arrival (the world's existing `arrived {place}` counts too) | 3 Sail to the Harbor (`id: 'saltreach_harbor'`) |
  | `harbor_stake_placed` | `{}` | lane H, when a 5 / 10 / 25 🪙 stake is accepted | 4 Place a 🪙 stake |
  | `island_invite_opened` | `{}` | island (U4), when "Invite a friend" opens | 5 Invite a friend |

  The strip shows three goals at a time, a hint toast after 20 s standing still, and the class goals instead for a player who joined by class code. Toasts for every lane: `showToast(text)` and `showError(reply)` from `frontend/src/ui/toasts.js` (one style, top-center, at most two). Coins in the HUD come from `view.captain.coins`; a lane with a local wallet passes it through `hud.setCoins(n)` in `game.js`.

## 4. Lanes and tasks

Value: ★★★ needed for the loop, ★★ makes it good, ★ polish. Size: S under 2 h, M half a day, L a day.

### Lane P: Pirates (`frontend/src/pirates/`, new pixel art in `frontend/scripts/pixel_art/`)

| ID | Value | Size | Task | Done when | Status |
|---|---|---|---|---|---|
| P1 | ★★★ | L | **Wave simulation** `sim.js` + `fake-api.js` per section 3.5: ships sail in on 3 lanes, cannons auto-fire at the nearest ship in range, manual shots do double damage, ships that reach a wall damage it, then the island; storm = more ships, fog = shorter sight range | Unit tests for: a won wave, a lost wave, the same seed giving the same result, fog and storm, invalid inputs ignored | Done, 11 Nov |
| P2 | ★★★ | M | **Pirate art**: sloop, brig, flagship (3 frames of bobbing each), cannonball, splash, wreck, wall (3 damage states), cannon, watchtower, pirate flag; original, made by the repo's Pillow scripts, credited in `frontend/ASSETS.md` | Contact sheet in the PR; sizes on the 16 px grid | Done, 11 Nov |
| P3 | ★★★ | L | **Wave on screen**: ships, cannon fire, splashes, hits and wrecks drawn in the island scene from `wave.state()`; a slim wave bar (wave number, ships left, island ♥) and a 10-second countdown | Screenshot/GIF; 60 fps with 20 ships | Done, 11 Nov |
| P4 | ★★ | M | **Man a cannon / repair**: walk to a cannon and tap a ship to fire; tap a damaged wall to repair (costs time, not coins); works with keyboard (E) and touch | Tests for the input mapping; GIF | Done, 11 Nov |
| P5 | ★★ | S | **Sounds**: cannon, splash, bell, victory, defeat (the existing procedural audio system) | Settings volume respected | Done, 11 Nov |

### Lane H: Harbor and coins (`frontend/src/harbor/`, `frontend/src/lib/coins.js`, the market and sports screens)

| ID | Value | Size | Task | Done when | Status |
|---|---|---|---|---|---|
| H1 | ★★★ | S | **`formatCoins()`** and replace every coin display in the game with it; remove decimals and big-number formatting | Grep shows no other coin formatting; tests | Done, 11 Nov |
| H2 | ★★★ | L | **Market stall**: one card per asset (Bitcoin, Ether, two stocks): live price, a tiny chart, "Up or down in 5 minutes?" with 5 / 10 / 25 🪙. Reuse the Exchange data and routes; hide leverage, positions jargon and P&L tables | Screenshot at 375 and 1280 px; works when prices are closed or offline ("Market closed, back at 15:30") | Done, 11 Nov |
| H3 | ★★★ | M | **Match board** (sports) in the same card style: pick a side, 5 / 10 / 25 🪙, see what you win. (The fortune teller of the first plan was removed on 11 Nov at the owner's request: no prediction market in the game, D035.) | Same as H2 | Done, 11 Nov |
| H4 | ★★ | M | **Weather board**: today's real weather at your place, and one line on what it does to the pirates ("Storm: 50% more ships tonight") | Uses the existing weather route; fallback text when offline | Done, 11 Nov |
| H5 | ★★ | M | **Harbor stalls in the world**: walk up to a stall and press E/tap to open its card; one "Harbor" overview card listing all stalls with a one-sentence explanation each | GIF; every API explained in one sentence | Done, 11 Nov |

### Lane U: Look and feel (`frontend/src/ui/`, `frontend/src/ui/kit/`, the HUD, the front door, the goal card)

| ID | Value | Size | Task | Done when | Status |
|---|---|---|---|---|---|
| U1 | ★★★ | L | **New panel style**: one beautiful card component (parchment-and-brass pixel frame, clear title, one primary button), applied to every remaining panel; consistent spacing, type scale and colors (CSS tokens); stay inside the 12 KB CSS budget | Before/after contact sheet of every panel | Done, 11 Nov |
| U2 | ★★★ | M | **HUD with three things only**: 🪙 coins (top left), the quest strip (top right), the menu button. Everything else goes into the menu or appears only when needed | Screenshot during play at 375 and 1280 px | Done, 11 Nov |
| U3 | ★★★ | M | **The first 3 minutes** from [PITCH.md](PITCH.md#the-first-3-minutes): goal card, the quest strip steps (build a cannon → ring the bell → sail to the Harbor → place a stake → invite a friend), friendly hints when a player is stuck for 20 s | Hallway test with one outsider; notes in the PR | Done, 11 Nov |
| U4 | ★★★ | M | **Play with friends**: "Invite a friend" shows your island code + QR; Join accepts island codes (`ISLE-…`) and the class code (`HARBOR-…`) in one field; the sea chart shows only Your island, The Harbor and Pirate Point | Two-browser test GIF | Done, 11 Nov |
| U5 | ★★ | S | **Toasts and feedback**: one toast style; every error shows the server's plain message and a next step | Feedback table in the PR | Done, 11 Nov |

### Lane 0: Core (the project owner with Claude): server, database, class battle, release

| ID | Task | Status |
|---|---|---|
| 0.1 | Remove the mystery from the game and frontend (today) | Done, 11 Nov |
| 0.2 | Islands API + migration (new spots and kinds, island codes, visit by code), the new prices; the fresh-start reset script | Done, 11 Nov |
| 0.3 | Waves API + migration (wave runs, loot caps, best wave, flags), weather modifier from the real weather | Done, 11 Nov |
| 0.4 | Pirate Point battle for the class: one shared wave for everyone in the room, the flagship that only the three lamps can sink | Done, 11 Nov |
| 0.5 | New voiced intro (pirates), wiring day (fakes → real API), release, live checks | Part done (see below) |

**Status of 0.5 on Wed 11 Nov.** Done: the voiced pirate intro (`lore_intro`) and seven more pirate cutscenes (`island_arrival`, `harbor_arrival`, `wave_won`, `wave_lost`, `armada`, `lock_opens`, `lamps_relit`), 25 voice lines in `frontend/public/audio/voice/`; the island, the waves and Pirate Point call the real routes when the flag `islands` is on, and the islands migrations are applied to the live database. The market calls migration `20261111010000_market_calls.sql` (D034) is applied to the live database too. Still open: the release to the live site (it still runs the 9 Nov class demo), turning on the flag `islands` there, and the live checks after the release.

### For everyone (pick one when your lane waits)

The walkthrough, test-map, invalid-input, pinning and submission tasks in [FINAL-ROADMAP.md](FINAL-ROADMAP.md) (groups A, D, E and F) stay valid. Each member explains their own lane in the walkthrough sheet (A1).

## 5. Rules for this sprint

- Stay in your lane's folders; if you must touch a shared file (`game.js`, `registry.js`, the HUD), keep the change tiny and say so in the PR title.
- No new packages, services or accounts; no database migrations outside lane 0; no keys in code.
- Every PR: tests for the new logic, screenshots for UI, the explain-back section, and green `npm test` / `npm run build` (and `uv run pytest -q` if you touched the backend).

## 6. Defense and shared-island expansion

**Planning contribution:** Ianno Hollensteiner (`Iannomh123456`), 14 Nov 2026, with coding-agent assistance; branch `docs/t29-t47-defense-roadmap`. This extends BUILD-PLAN and OPEN-TODOS rather than introducing a second roadmap. No gameplay implementation or release is claimed.

Use existing English docs, task tables, building cards, rendering/art generators, plain JavaScript/Python and server/API conventions. No framework or service change is implied. The rules below are implementation requirements from Ianno; collaborators choose the remaining details within the existing structure and shared-decision workflow.

- **Recovery:** attack damage/destruction persists until active repair/rebuild or an agreed recovery timer completes. A wave ending must not grant instant recovery. Collaborators choose costs, durations, interruptions and offline timing; preserve kind/level and prevent upgrades from bypassing recovery.
- **Physical arsenal:** a building in the island world, with location, graphics and ordinary walk-near/E/touch interaction to be designed and implemented. At most 20 weapon copies may be stored there. Each copy is stored or held by one captain, never both; multiple copies of one type may exist. Collaborators must resolve full-storage returns and disconnects without loss/duplication. Weapon types have distinct characteristics and prices.
- **Flexible construction:** implement more flexible wall/defense placement. The collaborator chooses the exact model after examining existing structure, saves, interaction and pathfinding. Keep the game’s art style; a cosmetic-only pass over unchanged fixed spots is insufficient.

### 1. Current baseline and scope

The local code and documents were inspected on 14 Nov; this is not a fresh live-site verification. Recheck current `main` when claiming a task. Some existing task rows contain both completed status and older implementation notes; confirm the code and release evidence instead of treating those notes as new work.

| System | Current baseline | Expansion |
|---|---|---|
| Walls | Damage and destruction during a wave; free repair and rebuild; reset to full health next wave | Persistent damage/destruction until active repair/rebuild or an agreed timed recovery completes |
| Towers | No hit points; gunboats and siege barges can temporarily disable them | Damage, destruction and recovery for defenses |
| Boarders | Nearby captains first, otherwise a fixed wall-to-heart route; broken walls skipped | Clear priorities, gaps, rerouting and rebuilt obstacles |
| Building | Fixed spots; upgrades preserve the building kind | Implement more flexible placement with an agreed grid/placement model and old-save compatibility |
| Defeat | Heart destroyed or all captains down; buildings/coins kept; restart at best wave minus two, minimum one | Last-chance minigame and an explicit reset policy |
| Captains | Shooting, cutlass, purchasable personal weapons, skills and roles already exist | Physical arsenal building; at most 20 stored weapon copies, with exclusive possession and distinct weapon stats/prices |
| Multiplayer | Personal coins, shared island buildings; members can continue without everybody online | Explicit permissions, absence, rewards and disconnect rules |
| Existing follow-ups | T5/T7/T26, shooting-direction T27 and minigame introduction T28 are merged; T3 balance and T6 Harbor idea remain follow-ups | Build on merged features; coordinate remaining work rather than reimplement it |

The reported upgrade/rebuild bug is an investigation, not a reproduced defect. Existing repair/rebuild inputs and wall state are in `frontend/src/pirates/sim.js`; target selection is `pickBoarderTarget`. Do not assume that persistent building level and current combat health are the same state.

### 2. Delivery order

The existing submission, rehearsal and Thu 19 Nov feature-freeze commitments remain in force. This roadmap records the whole requested scope, not a promise to ship it all before submission. Small verified fixes may fit the current sprint; large gameplay changes are a later milestone unless the team explicitly reschedules them.

| Phase | Goal | Tasks | Exit check |
|---|---|---|---|
| 1. Understand and agree | Reproduce the action problem; settle lifecycle, permissions and reset rules | T29, T30, T37, T42 | Reproduction evidence and reviewed decisions/contracts; no unresolved shared rule silently selected in code |
| 2. Make recovery coherent | Implement the agreed repair, rebuild and upgrade behavior and defense damage | T31–T33, T47 | Lifecycle tests, safe charging and two-browser agreement |
| 3. Make attacks coherent | Target selection, wall paths and flexible placement | T34–T36 | Deterministic targets/routes; existing saves remain usable |
| 4. Add shared progression | Rescue, minigame scaling and arsenal | T38–T41 | Solo and multiplayer outcomes agree, retries do not duplicate rewards or weapons |
| 5. Expand and polish | New defenses/captain options, score/landmark, Harbor and final balance | T43–T46; existing T3/T5/T6/T7/T26 | Playtest evidence, documentation and existing regression checks |

The phases describe delivery milestones, not a ban on earlier design work: T34 target design must be agreed before T33 implementation; T35/T36 agree their path/placement contract before either implementation. Use each task’s dependency column for the actual start conditions.

### 3. How teammates claim work

[OPEN-TODOS section 2](OPEN-TODOS.md#2-open-tasks-you-can-pick-small-independent-updated-thu-12-nov) links to the detailed task board in section 9. Read the full acceptance criteria and prerequisites before proposing an implementation. Use the responsible teammate’s own identity. Follow that human’s explicit approval requirements for coding and publication.

No expansion implementation task is assigned by this PR. Ianno owns this planning contribution; each implementing teammate is responsible for their own issue, branch, code and explain-back. After the responsible human approves remote publication, claim ONE task with an issue and draft PR, recording your real name, branch, likely files, dependencies and reviewer. Do not imply that a proposed feature is already approved or implemented.

Use one writing agent per branch/worktree. Before starting, check open issues/PRs and the current working tree. Branch from current `main` after the plan is reviewed. In the issue use: `Task: Txx; responsible teammate: ...; branch: ...; reviewer: ...; files: ...; depends on: ...; decisions: ...; checks: ...`.

| Lane | Can begin independently | Shared files to coordinate |
|---|---|---|
| Recovery and defense | T29 reproduction and T30 design | `src/pirates/sim.js`, island cards, backend island service, migrations |
| Enemies and layout | T34/T36 design and fixtures; implementation waits for contracts | `sim.js`, island positions, save/layout format, renderer |
| Co-op and arsenal | T37/T42 policy design; T40 inventory contract after policy agreement | island service/routes, wallet, migrations, room/sync messages |
| Experience and progression | T39 audit, T44 proposals, T45/T46 scoped design | finisher UI, campaign data, captain stats, Harbor cards |

Different lanes can research, write separate specs and prepare fixtures together. They must not concurrently edit `sim.js`, the same migration, shared content or the same interface definition. Agree a file owner in the issues, merge a small prerequisite PR, then update dependent branches. Lane labels are areas of work, not exclusive authority; coordinate migration work under the existing build-plan rules.

### Repository integration points

These are existing entry points to inspect, not instructions to put every new feature in a large shared file. Extract a small focused module only where it helps explain the change. Keep persistent authority separate from deterministic combat.

| Concern | Existing integration points | Contract to agree before code |
|---|---|---|
| Combat damage, targets, recovery | `frontend/src/pirates/sim.js`, `controller.js`, `interact.js`, `sync.js`, `render.js` | Health/state transitions, deterministic inputs and persisted wave-end health/timers |
| Building interaction and placement | `frontend/src/island/spots.js`, `world.js`, `card-model.js`, `ui.js`, `api.js` | Existing building-card/use flow, legal coordinates/footprints, layout version and old-save conversion |
| Coins, weapons, permissions, progression | `backend/server/island/service.py`, `store.py`, `rules.py`, `catalogue.py`, `games.py`, `waves.py` | Authorized atomic transitions, retry keys, inventory location/holder, persistent recovery and concurrent spending |
| Captain effects and weapon data | `frontend/src/pirates/captain-stats.js`, `backend/content/islands.json` | One authoritative weapon catalogue, existing stat scaling, copy identity separate from type |
| Minigames | `frontend/src/pirates/finisher/` and existing wave flow | Reuse suitable inputs/UI; server-owned outcome/reward/reset rules and reconnect behavior |
| Database and shared interfaces | `supabase/migrations/`, `docs/INTERFACES.md`, relevant route models and specs | Migrations written/reviewed under current policy; no live application as part of these tasks |

Recheck these paths on the latest main. Art must extend the existing art pipeline and register; the arsenal is not a separate screen-only shop. Server-owned timestamps and inventory must survive reloads, while sync inputs keep the battle consistent. New recovery/layout state needs explicit compatibility defaults for old saves and explicit handling of a mixed client-version session. If the current save schema cannot represent the feature, include the schema/API change in the spec rather than quietly relying on localStorage.

### 4. Task board

[OPEN-TODOS section 9](OPEN-TODOS.md#9-defense-and-shared-island-expansion-proposal-14-nov) is the single detailed board for T29–T47: scope, dependencies and acceptance checks. Existing IDs and statuses remain unchanged. T5/T7/T26/T27/T28 have merged implementation; related expansion work builds on that baseline. T3/T6 remain follow-ups. The link in OPEN-TODOS section 2 makes the detailed board discoverable from the existing task list.

### 5. Decisions and contracts before implementation

Collaborators should investigate open choices, compare practical options, recommend a solution and drive it to a recorded decision as part of their task. They need not send every routine detail back to the requester. Changes affecting shared gameplay, money, persistence or interfaces must follow [CONTRIBUTING.md](../CONTRIBUTING.md): discuss in the issue, obtain team agreement and record the outcome in [DECISIONS.md](DECISIONS.md). Until agreement, keep current behavior and continue independent work. This plan does not preselect the unanswered choices.

Use `specs/_TEMPLATE.md` for each claimed package. Record API/event/table/flag changes in their canonical locations and [INTERFACES.md](INTERFACES.md) in the same PR. Agree authority for transient combat health versus server-owned purchases, inventory and progression. Network sync must preserve deterministic combat without trusting a client to charge coins, grant weapons or settle a reset. Reserve decision numbers and migration timestamps from current `origin/main`; this proposal assigns neither.

### 6. Verification and handover

Documentation-only changes require the documented link/content check ([ENGINEERING.md](ENGINEERING.md), section 3). Implementation PRs run the applicable documented checks, report exact results and state skipped checks:

- Frontend: `cd frontend && npm test && npm run build && npm run test:mp`.
- Backend: `cd backend && uv run pytest -q` and `uv run ruff check .` from `backend/` when Python changes.
- Database: the SQL parse and migration checks in ENGINEERING section 4.2; application is a separate coordinated action under current team policy.
- UI: desktop and phone evidence using the existing cards/art, including disabled, loading and rejected actions.
- Gameplay: meaningful regressions for changed behavior, same-seed replay, early/mid/late balance, solo and multiple active crew sizes; multi-client disagreement, concurrent purchases and reconnect cases where relevant. Existing T3 remains the real-player balance follow-up.

A task finishes with its issue/PR updated, spec and relevant HOW-TO-PLAY/tutorial/WALKTHROUGH/TEST-MAP entries accurate, exact checks and remaining limitations recorded, and a different human reviewer. Link dependencies by task ID and PR; do not mark work live from a local pass. Each contributor keeps their own Git authorship and explains their own changes.
