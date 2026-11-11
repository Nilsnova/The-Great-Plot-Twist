# UX audit, Tue 10 Nov 2026

> **What this file is:** the audit of the live game (main 0cb3323) that the redesign in [PITCH.md](PITCH.md) and [BUILD-PLAN.md](BUILD-PLAN.md) answers. Lane U and lane H start here. The screenshot numbers in brackets refer to 187 local screenshots kept by the project owner (not in the repository); ask for any you need. Since the audit the mystery left the game (case screens are marked cut below).

Evidence: 187 screenshots in this folder (`NN-name-1280.png` / `-375.png`; `00-live-*` = production site). Local dev build drove the real game; GET /api calls were proxied to production, so prices, weather, desk and pavilion show live data. Signed-in panels use the repo's local fakes (`?market=local&desk=local&arena=local&islet=local`, `?demo=1`). Per Nils' decisions: the mystery is out; the new core is base-building plus pirate-wave defence.

## a. Screen inventory (C = visible controls, L = text lines; Must/Nice/Not = what a first-time player needs)
| Screen (shot) | Reach from title | C | L | Need | Verdict |
|---|---|---|---|---|---|
| Title (01) | n/a | 3 | 7 | Must | Keep: becomes Play / Play with friends / ⚙ |
| Lore cutscene (05) | Play | 1 | 3 per panel, 6 panels | Nice | Keep at max 3 panels; painted art clashes with pixel world |
| Goal card (06) | Play, Skip | 2 | 8 | Must | Keep, rewrite to the new goal |
| Join code (02) → Play with friends (03) | Join (+ any code ≠ HARBOR) | 3 / 5 | 6 / 11 | Must | Merge into one "Play with friends". Today a dead end: the code is dropped, "Sign in with GitHub" |
| Settings (04, 14 ×5 scrolls) + Account (49) | ⚙ / Menu / ☷ (3 routes) | 20 + 3 | 45 + 12 | Nice | Cut to 4 controls (volume, quality, motion, text size) + account line; rest behind "More" |
| Pause menu (13) | Esc / Menu | 8 | 9 | Must | Keep 3: Resume, Settings, Leave. Cut Lighthouse prologue, Full mystery, Report a problem |
| Controls strip (08), ☷ button (09) | Controls / ☷ | 1 | 5 | Nice/Not | Cut both (goal card teaches controls; ☷ just opens Settings) |
| Quest strip (07, 12) | always | 3 | 4 | Must | Keep as the single goal widget |
| Class harbor splash, lamp line (11) | Join the class harbor | 0 | 3 | Nice | Merge into one toast |
| Keeper's Lock (26, 27; 16 signed out) | walk + E | 8 | 6 | Nice | Keep (weather puzzle); signed-out state is a dead end |
| Captain menu / friendly duel / reveal (22–25) | tap a captain | 4 / 13 / 2 | 3 / 20 / 12 | Nice | Keep as THE duel; cut "Back to the ring" copy |
| Lamps finale (28–31) | walk + hold E | 1 | 3 | Must | Keep; fix 3 overlapping messages |
| Projector (32) / Presenter (33) | host: J / ?demo=1 | 1 / 4 | 6 / 4 | Host only | Keep the projector (best screen in the game); hide the presenter |
| Sea chart (45) | M / Chart | 10 | 4 | Nice | Keep, 3 places max |
| Island Exchange (40, 43, 43b, 90) | walk W in harbor + E | 13–18 | 66–113 | Not | Cut to "Up or down?" (see d) or hide behind More |
| Prediction kiosk (41, 44) / Sports (42, 46, 91) | harbor + E | 5–12 / 4 | 10–42 / 13–22 | Not | Hide until they have content (both empty on production) |
| Lantern Duels arena (47, 92) | Chart, Smugglers' Cove, walk, E | 8 | 20 | Not | Merge into the captain duel; cut the arena |
| Islet building (48, 93) | Chart, Home islet, walk, E | 6 | 35 | Must (new core) | Keep and redesign as the base screen |
| Lantern festival (55) / Harbor bulletin (56) | unreachable on demo path | 25 / 6 | 75 / 16 | Not | Cut (festival needs the case Relighting); one HUD weather chip replaces the bulletin |
| Rewards / coin ledger (67) | unreachable on demo path | 5 | 22 | Nice | Merge into a coin counter + a "Coins" page |
| Prologue, journal, interiors (50–54, 57, 58); case: what next, arrival kit, crew, partners, board, search, log, accusation, night, reveal, relighting (60–72) | Journal | 5–30 | 20–80 | n/a | Cut (mystery removed) |

## b. HUD during play (07, 11b, 20, 31; same on production 00-live-harbor)
Desktop shows 7 persistent elements and mobile 8. Mobile overlaps three times: Join over Controls, the quest strip over Chart/Menu, the lamp line over the sign-in tip.
| Element | Verdict |
|---|---|
| Masthead "✦ Saltreach · Saltreach Harbor". The wordmark is a link: clicking it reloads the page and ends the session | Cut. Place name goes in a 2 s toast on arrival |
| "Join the class harbor" button | Cut. Joining happens before landing (c) |
| Controls / Menu (+ Journal on the full path) | Keep only a ☰ Menu icon |
| Quest strip "CLASS DEMO GOALS" | **Keep #1:** one goal card, top-right |
| "Keep your story: Sign in with GitHub" tip | Cut. Ask after the first win, not at landing |
| Lamp status line, demo toast, duel invite, captain labels | Merge into one toast queue (31 shows 3 messages at once that contradict each other) |
| Bottom bar: weather, clock, ☷ | **Keep #2:** weather icon + 🪙 balance. Cut the clock and ☷ |
| Touch stick + Chart + Menu (mobile) | **Keep #3:** stick + one context button (E). Menu moves into the ☰ |
Target: ① goal card, ② 🪙 + weather chip, ③ ☰ (mobile adds stick and E). Coins appear on **no** HUD today.

## c. Playing together today
| Way | Steps for a friend | What breaks |
|---|---|---|
| Class harbor (code HARBOR / QR, 32) | QR: scan, Play, Skip, Got it = 4. Typed: Join, HARBOR, Join, Skip, Got it = 5 | Works only while the host has opened the demo window (live `demo.open:false`). Otherwise you "join" an empty harbor while the splash says "Everyone from class lands here" (11), and the lock says sign in |
| Crew invitation code | Sign in with GitHub (OAuth), finish story for a kit, Crew, Start a crew, share code; friend repeats sign-in + story, then Join, code, Check, Your seat, Confirm: 12+ steps | Case-only; HOW-TO-PLAY calls it "local rehearsal only"; removed with the mystery |
| Friends entry (title Join + other code) | 2 | Swallows the code, then says "Sign in with GitHub" or "Online crews are unavailable" (03, 00-live-join-crewcode) |
| Duels | Captain: 4 taps. Arena: chart + walk + sign-in | 3 duel entries (captain menu, arena, festival ring) for one mechanic |
| Presence rooms | Automatic per place, needs sign-in; "Show other captains: up to 8 / crew / off" setting | Invisible concept; no way to say "be with Ana" |
Overlap: three codes (HARBOR, crew code, "Join the class harbor" button plus a pause entry) for one idea, "be in the same place".
**One model: a Harbor code.** (1) The host presses Play with friends, then Create harbor, and immediately sees a 4-letter code (e.g. `KELP`), a QR and a Share link. (2) The friend scans the QR or opens the link; or presses Play with friends, Join, types `KELP`, Go. (3) The friend lands in the host's harbor as a guest with an auto name, no account. Both see "Ana joined" plus a player list (max 8). The class harbor is the same thing: the projector shows a harbor whose code the teacher created. Guest sign-in must be always on, not gated by a demo window; "Keep progress" (email) comes after the first session. The class-code (QR) + email sign-in branch already moves toward this: build the code on it and retire HARBOR + crew codes.

## d. Numbers and money (no 🪙 anywhere in the code)
- Exchange: prices like **76,159.21 USDT**, 74,396.83, 4,064.52, 1.0810 (4 decimals). "USDT", tickers, "Follows Bitcoin", **10× leverage**, "zero point (10 % against you)", "+1 fee", "Entry price / Worth now / Profit or loss". Stake 10–500, daily cap 2,000, payout cap **1,000,000** coins, fee 2 %/1 %.
- Wallet: kit 1,000 or 1,600 (granted by the case intro!); islet "1,000 coins and 20 timber"; buildings 300 + 10 timber (later 900, 2,000); case rewards up to 2,000.
- Predictions: 1–50 per stake, 200/day, "about 1.68 coins per coin", "5 % of the losing side leaves the game", "closes in 41 days". Sports: same caps, "5% pool cut", "closes 60 minutes before kickoff".
- Duels: "stake 25, winner takes 47", "Oil left 3 of 3", oil bar "100%". Festival: "47h 58m 27s". Settings volumes 70/35/65/80 %.
**One scale:** whole coins shown as `12 🪙`, never above 3 digits in normal play. Start with 50 🪙; things cost 5–40 🪙; a bet is 1, 5 or 10 🪙; win = 2× the stake, no fee shown. Never show real prices, currencies, decimals, percentages or tickers. Show ▲/▼ and "Bitcoin went up! +10 🪙".
Confusing for casual players: leverage and zero point, fees, USDT, pool odds as decimals, pool cut, daily caps, oil budget, timber vs coins, "positions", stake windows in days.

## e. External APIs (production /api checked 11:36 and 12:22 UTC)
| API | Where | Status on main | One-line explanation for players |
|---|---|---|---|
| Open-Meteo weather | World rain/fog/wind, "Rain at sea", lock answer, bulletin | **Working** (`source: cache`, Carcavelos "Thunderstorm") | "The island's weather is the real weather on the Lisbon coast right now." |
| Open-Meteo geocoding + IP place | Lock "Change place" | Behind sign-in (401 signed out); not testable as a guest | "We guess your city to ask about your sky; you can change it." |
| Binance | 7 island companies | **Working**, live prices | "These shops follow real crypto and gold prices." |
| Finnhub stocks | Apple, NVIDIA, Tesla, Coca-Cola, Spotify | **Broken**: key set (not `source_off`) but all 5 `unavailable/no_price`, so no last close | n/a until fixed: hide the stocks |
| Manifold | Prediction kiosk | **Empty**: all 5 questions in `backend/content/predictions/questions.json` are `reviewedBy: pending`, so the desk serves 0 forever | "Bet coins on real-world questions." |
| football-data.org | Sports pavilion | Connected (`source: live`) but **0 fixtures**: Premier League only, international break; BALLDONTLIE is an unused alternative | "Bet coins on real football matches." |
| ElevenLabs | 16 voice mp3s (lore intro, harbor arrival, lock, lamps) | Build-time only (`scripts/voice/generate.py`), not a runtime API | n/a |
| Supabase Realtime presence | Other captains, lamps sync | Needs a signed-in or guest player; guests are blocked while `demo.open:false` | "You see your friends live." |
Placeholder/broken states players see: Exchange shows **"Session expired. Sign in again"** to people who never signed in (40); keepsake "Wall of Lights" image is broken (67); credits list 3 × "Teammate name pending"; the festival launcher never appears in the pause menu (observer bug in `screens/festival/entry.js`), even with `flags.festival:true` on production.

## f. The first 3 minutes
Today (signed out, production): 1) Title: "Find the missing keeper." 2) 6-panel painted cutscene names Elena. 3) Goal card: "find out why the lighthouse went dark", plus controls. 4) Harbor: 7 HUD boxes, a GitHub sign-in tip, a "Join the class harbor" button and "CLASS DEMO GOALS: Wave / Duel / Lock". **None of them is the goal just stated.** 5) Join the class harbor: splash says everyone is here, and the harbor is empty. 6) Wave and Duel are impossible alone. 7) Walk to the lock (hint: "right of the ferry pier"), press E: "Sign in to open the lock." The only button is Close. 8) Wander through 17 harbor hotspots: Exchange says session expired, kiosk and pavilion are empty. 9) Menu offers "Lighthouse prologue" and "Full mystery", which start the same thing. All 3 goals are blocked by minute 3.
Ideal (8 steps): 1) Title: one line ("Build your harbor. Hold it against pirates, with friends."), **Play** and **Play with friends**. 2) 3-panel intro, 15 s. 3) Land on your islet as a guest with an auto name, 50 🪙. 4) Goal card: "Build a lamp tower (20 🪙)". One glowing plot, tap, it is built. 5) Toast: "Real weather: fog tonight. Pirates attack in fog." 6) "Invite a friend": code + QR; the friend appears. 7) First pirate wave at about 2:30: towers fire, friends hold lamps (the shared-hold mechanic). 8) Result: "Harbor held! +30 🪙. Next wave in 10 min." The next goal appears.

## g. Least polished panels
1. **Harbor HUD at 375 (07, 11b):** three overlaps, 8 boxes, the mobile Menu sits under the quest strip.
2. **Settings (04, 14):** 5 screens of scroll, native `<select>`s, 3 font families (Courier, Georgia, system sans), and "Account and saves" next to "Sign in with GitHub". It also says "The Lighthouse prologue is in Settings" while you are in Settings.
3. **Exchange open-position (43b):** native radio buttons; the form drops into the middle of the card grid; 79 lines; USDT prices.
4. **Festival (55):** 25 controls, 12 identical lamp cards, rehearsal state buttons, a "Refresh festival" button; all monospace.
5. **Rewards (67):** broken image, oversized empty-state box, a Crew/Board/Lights nav plus an 11-item `<select>` on a rewards page.
6. **Bulletin (56):** ISO dates "2026-11-10", case navigation on a notice board, mostly empty.
7. **Relit celebration (31):** "Lamp 1 burns. Two more…", "The lighthouse burns again", and a duel invite all on screen at once.
8. **Exchange signed out (40):** false "session expired" banner, 113 text lines, a "Report a problem" button on every panel.
Systemic: two modal systems (monospace pixel: goal, lock, pause, festival; serif + sans kit: duel, exchange, settings); focus rectangles around modal titles (41, 44, 47, 56, 67); three art styles (painted cutscene, pixel world, flat-vector interiors 50).

## h. Cuts, ranked by simplicity gained
1. The whole mystery: case screens, Journal toolbar, prologue, interiors, Full mystery/prologue menu entries. Removes about 15 screens and 2 menu items.
2. Exchange as a trading desk: replace it with a single "Up or down in 5 minutes? 5 🪙" card. Kill leverage, fees, tickers and stocks.
3. Festival, bulletin, arena and the Rewards/Log page. The festival needs the case Relighting; the arena duplicates the captain duel.
4. Three join systems: one Harbor code (c).
5. HUD down to 3 elements (b). Settings down to 4 controls. Pause down to 3 items. Drop the ☷ and Controls buttons.
6. Prediction kiosk and sports pavilion stay hidden until they have content. Then each becomes one "pick + 5 🪙" card.
7. Sea chart down to 3 places: your islet, the harbor, the pirate sea.
Keep for the wow: live multiplayer harbor + Harbor code, real weather driving the world and the waves, one real-price bet, the projector QR, the lamps shared hold, captain duels.
**Goal and loop without the mystery:** "Keep your harbor's lights burning." Earn 🪙 from bets on real weather, prices and matches, and from waves you survive; spend 🪙 on buildings and defences on your islet. Pirates come in waves, and real fog makes them bolder. Defend with friends who join by code. Win = survive the night with every lamp lit. Session = build, defend, collect, about 10 min.
**Case-only frontend (delete candidates):** `src/story/`, `src/demo/` (tour, intro story), `src/world/hook/`, `src/world/partners/`, `src/world/interiors/`, `src/adapter/fake/` (except `presence*.js`, `account*.js`, `rewards.js`), `src/adapter/{lab,local-start,bridge}.js`, `src/screens/{arrival,board,accusation,reveal,finale,relighting,search,beam-math,inspection-labels,partners}.js`, `src/screens/{partners,log}/`, `inspection-polish.css`, `story-polish.css`, `src/shell/hints/` (case "What next?"), `case-lab.html`, `src/world/places/case-spots.js`
**Shared, with a non-case use:** crews (`src/screens/crew.js`, backend `crews/`) become the Harbor-code room; rewards (`src/screens/rewards/`) becomes the 🪙 ledger; the log has none; bulletin (`src/screens/bulletin/`) keeps only its weather/price line; account/saves, presence (`src/screens/presence`, `src/online/realtime.js`), cutscene player, kit modal and class-demo stay. Entry kits (`backend/server/game/entry_kits.py`): the **only coin grant**, paid on case intro completion. It needs a new non-case source.

## i. Base-building + pirate-wave defence: what exists, what is missing
**Reusable (paths from repo root):**
- Islet build loop. Backend: `backend/server/game/building.py`, `building_catalogue.py`, `islet_service.py`, `islet_store.py`, `backend/content/buildings.json` (5 plots, 300 🪙 + 10 timber, levels 2/3 priced but unbuilt), atomic `islet_build()` in `supabase/migrations/20261106070000_home_islet.sql`. UI: `frontend/src/screens/islet/` + `src/world/islet/state.js`. Spec: `specs/L2-home-islet.md`.
- Coins/timber: `backend/server/wallet.py` (17 ledger reasons, append-only, nonnegative); `islets.timber` (starter 20, no second source: "driftline" unbuilt).
- Rooms and players: Supabase presence `frontend/src/online/realtime.js`, `src/world/others/`, the class harbor room `src/class-demo/harbor.js` (40 captains, broadcast channel), crews (`backend/server/crews/`, `codes.py`, `seats.py`), guests `backend/server/demo/guests.py`, host console `frontend/host.html`, `src/host/`.
- Co-op mechanic: lamps shared hold, `src/class-demo/lamps.js`, `lamp-sync.js` (hold 2 s, 20 s window, clock-free broadcast merge). A ready template for "hold the defence together".
- Turn/reveal UI: `src/screens/duels/` (sealed choices, reveal, stake) + `backend/server/duels/`; `src/class-demo/duel-overlay.js`.
- Unused `raid` flag (`backend/server/flags.py`, off on production), plus a `raid_arch` zone and `raid-arch` art at The Teeth (`src/world/places/registry.js`, `layouts.js`, `src/pixel/catalog.js`).
- Weather: `backend/server/weather/` (states, fog nights, outlook), `backend/content/weather_states.json`, `src/world/weather.js`. Real "fog tonight" already exists for wave difficulty.
- Renderer: places/zones (`src/world/places/`), boats and sailing (`src/world/boat.js`, `src/ui/sailing.js`), cinematics (`src/world/cinematics/`), cutscene player (`src/cutscenes/`), lighthouse beams (`src/world/beam.js`).
- Coin sources: exchange, predictions, sports, festival backends as they are.
**Missing:** pirate ship actors and AI (no enemy entity anywhere); wave definition + scheduler (server clock, per harbor/room); defensive buildings that act (towers, range, damage: today's catalogue is economic/cosmetic only); building HP, damage, repair (+ a repair wallet reason); server-authoritative combat resolution and anti-cheat; shared base ownership (islets are per player, a room base is needed); wave result screen and rewards (new wallet reason); a starting-coin grant replacing the case kit; a timber income source; a wave-warning HUD element.
