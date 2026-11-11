# The Great Plot Twist, v3: one island, one crew, a narrated campaign

> **What this file is:** the owner's direction after playing with his brother on Wed 11 Nov (late evening), and the binding contract for the v3 builds. [TOWER-DEFENSE.md](TOWER-DEFENSE.md) stays valid for everything this file does not change. A build that must deviate changes this file in the same commit and says so in its report.
>
> **Decisions by the owner (11 Nov):** clean cartoon 2D art (not pixel art); one island per game, the Harbor and the rest become buildings on it; every player keeps their own coins and builds on the shared island; the narrator is voiced (ElevenLabs, the existing key and plan, no new spending).

## 1. The game in one paragraph

You open the game and **create a game** (a room) or **join** one with its code. Up to **10 players** play on **one shared island**. When everyone is in the lobby, the host presses **Start**. A voiced **narrator** tells the story and introduces every new thing as it arrives, so nothing is overwhelming. The crew defends the island against **100 waves** of pirates; each wave brings something new in the first rounds, then the advancement deepens: tower skill trees, a technology hub, a repaired ship that lets the crew sail out to fight at sea, close combat on the beach. You can **pause** between waves, **leave**, and any member can **continue** the same game later: the island, its buildings and the wave reached are saved.

## 2. Rooms (lane R)

- **Front door:** Play → **Create a game** · **Join a game** (type or paste a code, or open a link `?game=ISLE-XXXXX`) · **Continue** (the games you are a member of, newest first, with wave reached and who is in it).
- **A game is an island.** Creating one makes an island with a code (today's `ISLE-XXXXX`) whose creator is the **host**. Members: 1 to 10 (the creator plus up to 9). Joining a game makes you a member for good (until you leave it in the Menu). Guests (anonymous sign-in) join with the code as today.
- **Lobby:** the island in the background, a card with the code, the invite link and QR, the list of members online (name tags), and **Start** (host only; any member if the host is away for 60 s). The narrator's opening plays when the host presses Start the first time.
- **Pause / leave / continue:** between waves the host (or any member when the host is away) can **Pause** (no auto next wave, the break stays open until Resume). Leaving a running wave counts you out of that wave. Any member can open the game from **Continue** and ring the next wave, alone or with others. Progress belongs to the island: buildings, wave reached, unlocks, research.
- **One island only:** no sea chart; the Harbor (market calls, football board) and the other services are buildings on the island that unlock by wave (section 4). Pirate Point and the separate islands leave the game (the three lamps can return later as a boss-wave mechanic on the island).
- **Coins:** each player's own wallet (as today). Everyone builds and upgrades on the island with their own coins; loot is paid to each participant of a won wave.
- Live rooms: the island room `live:place:isle_<code>:1` carries up to 10 players (raise MAX_PLAYERS and every filter that assumes 4).

### 2.1 How it is built (lane R, `feat/v3-rooms`)

- **Data model: a game is an island.** Every player keeps exactly one island (`islands`, one row per player, made by `island_open`); that island is the game the player **hosts**, and its code is the game's code. A player can be a **member** of any number of other players' games: `island_members (island_owner, player_id, role host|member, joined_at, opened_at, left_at)` in `supabase/migrations/20261112040000_game_rooms.sql` (RLS on, no policy, server only). Existing progress stays where it is and becomes each player's first game; the migration backfills every host row and makes tonight's friends (anyone who fought a wave on somebody else's island, the 9 most recent per island) members, so they find the game under Continue. One island per player means **Create** opens your own island (it answers the game you already host); a second game of your own would need islands keyed by game, which is not needed for v3.
- **The 10-player door** is SQL: `game_join()` locks the island row (the lock `wave_start()` takes too), counts the active members (the host counted once) and refuses `game_full` at 10. A member coming back is not new; one who left counts again. `game_leave()` refuses the host. `game_list()` (Continue, newest first by `opened_at`) and `game_members()` (the lobby) only read. All four are `security invoker`, `search_path ''`, executable by `service_role` only.
- **Routes** (`backend/server/routes/games.py`): `POST /api/games` (your game; `created` says whether the island was made now), `POST /api/games/join {code, actionUid}` (admits a guest like the class code; `409 game_full` "This game has 10 players already"; a code you are not in spends the player's code budget, a code that names no game also the address's), `GET /api/games` (Continue), `GET /api/games/{code}` (the lobby: members with `id`, `name`, `role`, `you`; `403 not_member`), `POST /api/games/leave {code}` (`409 host_cannot_leave`). `POST /api/island/invite/join` is an alias of join. **Membership is the rule** on a game's island: build, upgrade (with `code`) and the bell (`where` = a code) answer `403 not_member` to a player who is not in that game.
- **Who is online** is not stored: it is the presence of the island room (its ids are the lobby's ids). Without a live presence (`?islands=fake`) a small `game_hello {who}` heartbeat stands in (every 20 s, plus one hello back to a newcomer).
- **Start and Pause** are room messages (`src/island/game-room.js`, checked field by field in `src/net/live-rules.js`): `game_state {who, started, paused, first}`, sent on Start and on Pause/Resume and once as the answer to a newcomer's hello, so a friend who arrives later learns that the game is on (their lobby closes) or paused. Start emits `bus.emit({type: 'game_started', first})` on every page (`first`: the game never won a wave and this device never started it). Pause holds the break open (no Auto next, "Next wave" waits) and the break card says "Paused by <name>". Only the host may Start or Pause, any member once the host has been away for 60 s. Names never travel in messages; they come from the lobby answer.
- **Front door:** Play shows the games card (after the first-run lore and pages): Continue (code, host, wave, players), Create a game, Join a game (ISLE-XXXXX or the 5 symbols). A `?game=ISLE-XXXXX` link (`?visit=` still works) goes straight in through the friend's landing. After Create, Join or Continue the lobby opens over the island: the code, Copy link and QR, the players with who is online, Start. The Menu has Players and invite (the lobby) and, in a friend's game, Leave this game.
- **One island:** behind `one_island` (`src/island/one-island.js`), ON by default in code: the Sea chart leaves the Menu, M and the gamepad, the Menu's Harbor card and "Join the class harbor" go too (Menu entries marked `travel`), and the goals "Sail to the Harbor" and "Place a stake" become "Build a wall" and "Win wave 3" (same places in the list). `/api/config` may send `flags.one_island = false`, or `?oneisland=0` for one tab, to bring travel back; the old code stays. Class-code players and the islands-off game keep travel.
- **Budget for 10:** a wave room of n players costs n x (n - 1) deliveries per round of sends; `waveGapMs(n)` keeps a room under 90 deliveries a second (200 ms up to 4 players, 1 s at 10). Moves keep their own budget (`sendGapMs`).

## 3. Combat (lanes C and S)

- **Pirates come ashore** (boarding, close combat, a ring of inner walls, rebuilding broken walls): being built on `feat/td4-boarding`, see TOWER-DEFENSE.md §12.
- **The heart of the island:** the lighthouse/treasure in the middle. Boarders that are not fighting a player go for it; when its ♥ reaches 0 the wave is lost **for everyone**.
- **Players have health.** Each captain has hp (shown as a small bar over every character; your own also in the HUD). Boarders within reach attack the nearest captain. At 0 hp a captain **falls**: they cannot act, a ring and a timer show over them. A teammate who stands next to them and holds E for 2 s **revives** them for coins (🪙 20 + 5 per wave, paid by the reviver; the server checks and charges like any spend). A fallen captain not revived stands up by themselves at the next break. If every captain on the island has fallen, the wave is lost.
- **The wave bar** stays at the top (wave · ships left · ♥ of the heart); individual bars above characters.
- **Weapons and skills:** the captain's skill tree and weapon shop are being built on `feat/td4-skills`.

## 4. The campaign: what opens when (lane P), introduced by the narrator

| After winning wave | What opens (one narrator line each) |
|---|---|
| start | walls and cannons level 1, the captain's musket |
| 1 | captain upgrades, houses |
| 2 | level 2, the mortar |
| 3 | the watchtower; crew: gunner |
| 4 | **the Harbor market stall** (market calls; betting is closed before this) |
| 5 | boss wave and the inner wall ring; crew: carpenter |
| 6 | **a wreck washes ashore**: repair it over the next waves (coins from anyone) |
| 7 | the football match board at the Harbor |
| 8 | **the Tech hub**: research for the towers (section 5) |
| 10 | **the repaired ship**: between waves the crew can sail out and fight pirate ships at sea for extra loot (phase 2, after the island game is solid) |
| 12, 15, 20, 30, 50 | new tower tiers, new pirate types, stronger bosses (each introduced by the narrator) |
| 100 | the final battle |

Waves: up to **100**. Ships and boarders scale so waves 1–5 teach, 10 is a real fight, 30 needs research and skills, 50+ needs the whole crew.

## 5. Towers with skill trees, the Tech hub (lane P)

Each tower kind gets a small skill tree beyond levels 1–3, chosen per building (like a specialisation), researched once at the Tech hub with coins and then unlocked for every tower of that kind on the island:
- **Cannon:** Rapid (reload −30%) · Heavy shot (damage +60%, slower) · Chain shot (slows ships 40%).
- **Mortar:** Cluster (3 smaller blasts) · Fire pot (burning ground for 4 s) · Long range (+12 range).
- **Wall:** Stone (hp ×2) · Spiked (boarders take damage while hacking) · Quick mend (repairs ×2).
- **Watchtower:** Spotter (+15% damage to towers in range) · Signal fire (ships show 5 s earlier).
New tower kinds later: harpoon (slows), fire tower (damage over time), for waves 12+.

## 6. Narration (lane N)

- A **narrator** speaks short lines (one to three sentences) at: the opening (Start), each wave's start for the first 5 waves, every unlock in section 4, the first boss, the first boarding, a player falling and being revived, the heart in danger (below 30%), a lost wave, every 10th wave, the final battle. Captions show the text (always, for sound off and accessibility).
- Lines live in one data file (id, text, trigger); audio is generated with the existing pipeline `scripts/voice/generate.py` and the existing ElevenLabs key (never printed or committed); files are small mp3s loaded on demand. If a file is missing the caption still shows.
- The narrator never blocks play: lines queue, a skip button hides the caption.

## 7. Art: clean cartoon 2D (lane A)

- Replace the pixel art with **clean cartoon sprites**: smooth shapes, bold dark outlines, soft two-tone shading, warm saturated colours, in the spirit of mobile strategy games (original designs only, nothing copied from any existing game).
- Drawn as vector art in code (SVG or Canvas 2D paths) and rasterised at runtime to textures at the device's pixel density, so they stay crisp at any size and the download stays small. No image downloads, no new packages.
- Same frame names and anchors as the current atlas where possible, so the renderers keep working; new frames for new things are added in the same module.
- The camera keeps its angle; the island, water, buildings, towers, walls, ships, boarders, captains (with a few colour variants so 10 players can be told apart), effects (shots, smoke, splashes, fire) and the HUD frame all move to the new style. The HUD kit drops the pixel fonts and borders for clean rounded panels.

## 8. Fixes from the play test

- Some upgrades were not visible (a built tower did not show its new level or the upgrade card did not appear): find and fix, with a test.
- Done and live on 11 Nov: no sprint (one fast speed), free-aim musket (click anywhere), wave bar at the top.

## 9. Build lanes and order

| Lane | What | Branch | Depends on |
|---|---|---|---|
| C | boarding, close combat, inner walls, rebuild | `feat/td4-boarding` (running) | — |
| K | captain skills + weapon shop | `feat/td4-skills` (running) | — |
| R | rooms: create, join, lobby, continue, 10 players, one island | `feat/v3-rooms` | — |
| A | clean cartoon art | `feat/v3-art` | — |
| N | narrator lines, voice, captions, triggers | `feat/v3-narrator` | — |
| F | upgrade visibility fix | `fix/v3-upgrades` | — |
| H | player health, falling, revive | after C merges | C |
| P | campaign unlock table, Tech hub, tower skill trees, 100-wave scaling | after C, K merge | C, K |
| S | sailing out to sea (phase 2) | after P | P |

Feature freeze stays **Thu 19 Nov**; anything not merged and green by then waits.
