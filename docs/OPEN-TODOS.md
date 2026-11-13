# Open to-dos

> **What this file is:** the one checklist of what is still open, for every team member. Tick a box in the same pull request that does the work. No task is assigned to a person; take what fits you and claim it with a draft pull request.
>
> **The plan behind it:** [PITCH.md](PITCH.md) (what the game is now), [BUILD-PLAN.md](BUILD-PLAN.md) (the lanes and their tasks), [FINAL-ROADMAP.md](FINAL-ROADMAP.md) (grading criteria and dates).
>
> **Key dates:** feature freeze **Thu 19 Nov** · README complete **Fri 20 Nov** · submit by **Sun 22 Nov** (deadline Mon 23 Nov, 23:59) · presentations Tue 24 Nov or Fri 4 Dec.
>
> **Never** paste keys, SMTP passwords, tokens or student numbers into a chat, an issue or a commit message. Student numbers go only into the README line of their owner.
>
> Last updated: Thu 12 Nov 2026, ~07:15 (v3 live; narrator voiced; faster walking). The owner's agents are stopped: their unfinished work is now tasks T11–T19 below.

## 1. If you jump in now (30 minutes to start)

The game is built and live; nobody waits for anyone. You extend it.

- [ ] Accept the GitHub invite (write access), set your own git name and email, clone `main`, run the checks once ([ENGINEERING.md](ENGINEERING.md#3-commands)).
- [ ] Read [PITCH.md](PITCH.md) and [TOWER-DEFENSE.md](TOWER-DEFENSE.md) (how the game works now) and play it once on the live site.
- [ ] Give your coding agent the prompt in [contribute/AGENT-PROMPT.md](contribute/AGENT-PROMPT.md), pick ONE task below, and open a draft pull request from your own account, titled with the task ID.
- [ ] Every member needs at least one merged pull request of their own before Sun 22 Nov (course rule: every member contributes code).

## 2. Open tasks you can pick (small, independent; updated Thu 12 Nov)

| ID | Task | Where | Size |
|---|---|---|---|
| T1 | ✅ **Done (Fri 13 Nov): live** (the harpoon tower, branch `feat/v3-t1-harpoon`; the fire tower is not built). **A new tower**: a harpoon tower (slows ships) or a fire tower (damage over time), planned for waves 12+ in [GAME-V3.md](GAME-V3.md) §5: stats in the simulation, a cartoon drawing, a build-card line, a campaign unlock, tests | `frontend/src/pirates/sim.js`, `frontend/src/art/`, `backend/content/campaign.json` | M |
| T2 | ✅ **Done (Fri 13 Nov): live.** **A new pirate type** (raiders, brutes, ironclads and dreadnoughts exist; e.g. a ship that targets towers): drawing, stats, appears from wave N, tests | same as T1 | M |
| T3 | **Balance pass**: play waves 1–15 (and 30+ if you get there) with friends, write down what felt too easy or too hard, tune the numbers in the simulation's CONFIG, keep the balance and late-game tests green | `frontend/src/pirates/sim.js` | S–M |
| T4 | ✅ **Done (Fri 13 Nov): live.** **Sounds**: better cannon, mortar, musket, warship horn and victory sounds with the procedural audio | `frontend/src/audio/pirates.js` | S |
| T5 | **Island decoration**: flags that show your best wave, a statue at wave 25, trees that grow with houses | `frontend/src/island/`, art | M |
| T6 | **Harbor idea**: one more simple stall on real data (e.g. "Will it rain in Lisbon tomorrow?" on the weather API), same card style | `frontend/src/harbor/`, backend weather | M |
| T7 | **Leaderboard**: best waves of all islands this week (read-only route + a small card) | backend `island/`, `frontend/src/island/` | M |
| T8 | ✅ **Done (owner's agents): the v3 pages are in** [WALKTHROUGH.md](WALKTHROUGH.md) parts 16 to 28 and [TEST-MAP.md](TEST-MAP.md) section 8. **Walkthrough page for the part you touched** (what, where, why, limits, how it could change): the Harbor and look-and-feel pages (part 15) are still open | `docs/WALKTHROUGH.md` | S |
| T9 | ✅ **Johannes's D1 sweep merged (Fri 13 Nov, PR #5).** **Invalid-input tests** for one route you understand (empty, too long, wrong type, repeated click); other members can still add tests for their own routes | `backend/server/tests/` | S |
| T10 | **Your README line**: your name and student number (by Fri 20 Nov). Nils's line is in | `README.md` | XS |
| T11 | ✅ **Done (Thu 12 Nov): released.** **Review and release the small fixes** on branch `fix/v3-small` (5 finished commits: the friend's arrival banner says "Nils's game", the phone game chip no longer covers the goals, level 4–5 stars, firing towers keep their level look, a compact "Wave won" card off the island's middle, HOW-TO-PLAY rewritten). Run all checks, look at it in the game, open a PR. The last commit (wip) is T12 | branch `fix/v3-small` | S |
| T12 | ✅ **Done (Fri 13 Nov): live.** **No extra captain when shooting**: today each musket shot draws a second captain sprite where you fired (`drawPose` in `frontend/src/pirates/render.js`). Make your own character (`src/player/character.js`) and teammates' figures (`src/world/others/`, matched like `src/pirates/figures.js`) play the firing pose instead; same for the cutlass. Started (wip commit on `fix/v3-small`) | `render.js`, `player/character.js` | M |
| T13 | ✅ **Done (Fri 13 Nov): live.** **Tear down a building**: any member, between waves; each payer gets back 50% of what they paid (build + upgrades); legacy buildings refund the host; confirmation shows each refund; every screen sees the empty spot. Needs migration `20261112080000_demolish.sql` (the owner applies it) and a new build-spot marker that reads "build here". Started on `feat/v3-demolish` (wip) | island cards, `backend/server/island/`, migration | L |
| T14 | ✅ **Done (Fri 13 Nov): live.** **House roles from level 2** (owner's decision): Barracks (1–2 militia fight boarders near it), Tavern (heals captains nearby; helping up costs 25% less on the island), Workshop (wall repairs 30% cheaper and faster, walls nearby mend between waves). Houses keep their loot. Migration `20261112090000_house_roles.sql`. Started on `feat/v3-houses` (wip) | `sim.js`, island cards, migration | L |
| T15 | ✅ **Done (Fri 13 Nov): live.** **Island cards docked at the side** (right panel on desktop, bottom sheet on phones) so the island stays visible; researched Tech hub branches collapse to one line. Built on `feat/v3-research` (with T16), waiting for review and merge | island card component | M |
| T16 | ✅ **Done (Fri 13 Nov): live.** **Research tree with team choices**: 3 tiers per branch (tier 2 after wave 15, tier 3 after wave 25); at tiers 2 and 3 the island picks ONE of two options (e.g. Rapid II or Long barrel; Broadside or Grapeshot), the other closes. Migration `20261112100000_research_tiers.sql` (not applied). Built on `feat/v3-research`, waiting for review, merge and the migration |  Tech hub card, `sim.js`, migration | L |
| T17 | ✅ **Done (Fri 13 Nov): live.** **Wave events** from wave 3, deterministic from the wave seed, each with a banner and a narrator caption: fog, storm, night raid, fire ships, pincer, armada, siege barge, treasure galleon, smugglers' landing, kraken. Barely started on `feat/v3-waves` (wip) | new `src/pirates/wave-events.js`, `sim.js` | L |
| T18 | ✅ **Done (Fri 13 Nov): live.** **Boss finisher scenes**: below ~25% boss hp the battle freezes, letterbox + camera push-in, and the whole crew does a 10 s task together (haul the chain / aim the great cannon / board and duel; all three for Redtide). Success sinks the boss with bonus loot, failure gives it 15% hp back. Synced inputs (new message kind in `sync.js` + `live-rules.js`). Original design. Barely started on `feat/v3-waves` (wip) | new `src/pirates/finisher/` | L |
| T19 | ✅ **Done (Fri 13 Nov): live.** **Walk up and press E**: open a building's card only when standing next to it (E, or a Use button on phones); a fallen teammate nearby takes priority (hold E = help up); a click from far away says "Walk closer". Not started | `src/player/`, island input | M |
| T20 | ✅ **Done (Fri 13 Nov): live.** **Captain skill tree with exclusive choices**: branches where a captain picks one of two, so the crew splits roles (e.g. medic, engineer, gunner). Needs a migration. Not started | Captain card, `backend/server/island/` | L |
| T21 | ✅ **Done (Fri 13 Nov): live.** **Cartoon title screen and intro** drawn in code instead of the painted images in `frontend/public/cutscenes/` and `places/` (they look AI-generated); keep captions, Skip and the narrator timing. Not started | `src/cutscenes/`, title, `src/art/` | M |
| T22 | ✅ **Done (Fri 13 Nov): live.** **Follow-up: joining the next wave right after a wave ends.** In the four-page check one friend did not join the host's next wave on his own straight after the previous wave ended (two others did); the check now joins him by hand. Reproduce with two browsers and fix in `frontend/src/island/index.js` (`joinRunningWave`) or the wave room | `src/island/`, `src/pirates/room.js` | S–M |
| T23 | ✅ **Done (Fri 13 Nov): live.** **Follow-up: respec price under the lock.** `island_respec` is charged at the captain level read before the lock; a captain upgrade at the same moment could charge the old price. Compute the price inside the function from the locked captain level (new migration) | `backend/server/island/service.py`, migration | S |
| T24 | ✅ **Done (Fri 13 Nov): live.** **Follow-up: no research change or respec during a running wave.** A tier-3 change can strip a capstone from towers, and a respec can clear skills, while a wave runs; refuse `wave_running` like Tear down does | migration, `service.py` | S |
| T25 | **Taken by the owner's agents (Fri 13 Nov).** **Security follow-up: check the sender of wave-room messages.** In the wave room the `by` field inside a message is not checked against the member who sent it (`frontend/src/net/wave-rooms.js` passes the data on), so a modified browser could send an input in another player's name. It cannot change coins or loot (the server decides those), only what other screens draw. Fix: drop a message whose `by` is not the sender's presence id, with a test; mention it in WALKTHROUGH part 17 | `src/net/wave-rooms.js`, `src/pirates/sync.js` | S |

**Live since Thu 12 Nov, early morning: v3** ([GAME-V3.md](GAME-V3.md) is the contract, [TOWER-DEFENSE.md](TOWER-DEFENSE.md) stays valid where v3 does not change it). Play › **Create a game** or **Join** with a code or link, a lobby (code, link, QR, who is online) and **Start**; up to 10 players on **one shared island**, each with their own colour; Pause between waves and Continue later. A voiced narrator with captions introduces each new thing. Pirates come ashore and fight on foot (cutlass), an inner wall ring, rebuilding walls. Captains have hp, can fall, and a teammate holds E to help them up for coins; the wave is lost if the heart falls or every captain is down. The captain's skill tree and a weapon shop. A campaign that opens things by wave (the Harbor market stall after wave 4, a wreck at 6, the football board at 7, the Tech hub with tower skills at 8, tower levels 4–5 at 12–20, new pirate types at 12/20/30/50, the final battle at 100). Clean cartoon art drawn in code. Merge `main` before you start.

**T11–T21 are taken by the project owner's agents again (from Thu 12 Nov, ~07:30): do not pick them.** T4–T10 are yours. Migrations are applied only by the project owner. T1, T2, T17 and T18 all change `frontend/src/pirates/sim.js`: claim one at a time, or agree in the group chat who goes first.

## 3. Every member, before the freeze (walkthrough = 20% of the grade)

- [ ] **Walkthrough sheet** ([FINAL-ROADMAP A1](FINAL-ROADMAP.md#a-repository-walkthrough-criterion-6-20)): each member writes the page about their own lane (what, where, why, limits, how it could change) in `docs/WALKTHROUGH.md`; one member adds the database/server page with the project owner.
- [ ] **Mock walkthrough** (A2): each member answers 6 random questions aloud, without notes, about **any** part, including the three course questions: where the data is stored, what the tests cover and miss, what happens when an external API is down.
- [ ] **Invalid input** (D1): one test per rejected input in your lane (empty, too long, wrong type, repeated click).
- [x] **D1 current-demo sweep, Johannes:** 67 added cases across class joins, locks/place search, duels, islands and waves; existing email and repeat coverage audited. Evidence and limits in [PR #5](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/5). Other members still add tests for their own changes.
- [ ] **Test map** (E1): add your lane's row to `docs/TEST-MAP.md`: which tests cover it and what they do not.
- [ ] **README line** (F1, by Fri 20 Nov): add your own name and student number to the README members table yourself.

## 4. Account setup (needs dashboard access; the project owner or a member with access)

### 4a. ✅ Done (Wed 11 Nov): guest sign-in for the class code is on (verified: anonymous sign-ins allowed)

Guests can only play with the current class code from the projector QR, so this setting stays on for good.
1. supabase.com/dashboard > project **great-plot-twist** > **Authentication** > **Sign In / Providers** > under "User Signups" switch on **Allow anonymous sign-ins** > **Save**.
2. **Authentication** > **Rate Limits** > **anonymous sign-ins per hour**: **100** > **Save** (a whole class shares one Wi-Fi address).
3. Check: open the live site on a phone with the current class link (host console > Class demo) and press Play.

### 4b. Email sign-in: not needed

The owner decided on Fri 13 Nov: players sign in with GitHub or as a guest; email sign-in is not set up.

### 4c. ✅ Done (Wed 11 Nov): the Finnhub key is re-entered; live stock prices verified

Finnhub answers every stock request with HTTP 401 (key rejected, seen in the live log on 10 Nov).
1. finnhub.io > Dashboard > copy the API key (or create a new one).
2. Vercel > project the-great-plot-twist > Settings > Environment Variables > `STOCK_API_KEY` > Edit: paste with no spaces or quotes, Production and Preview > Save.
3. Redeploy the latest production deployment (or wait for the next push).

### 4d. Prediction questions: no longer needed

The fortune teller was removed from the game on 11 Nov at the owner's request (no prediction market, [D035](DECISIONS.md)), so the questions in `backend/content/predictions/questions.json` need no review. The backend code stays, switched off, until a later cleanup.

## 5. Before the class demo (the new game)

- [ ] **Two-phone test** (20 minutes): presenter laptop on the projector, signed in. Play › **Create a game**, show the lobby QR. Two phones scan it and join; check that all three appear in the lobby in different colours. Press **Start** (the narrator speaks), build a cannon, ring the bell and win a wave together, let one captain fall and help them up with E, and check the Harbor stall stays closed until wave 4.
- [ ] **Presenter laptop check** (5 minutes): on power, full screen, `https://the-great-plot-twist.vercel.app/?demo=1&captains=40&perf=1`; the FPS number stays around 50 or higher.
- [ ] **Two rehearsals** of the 5-minute script in [PRESENTER-SCRIPT.md](PRESENTER-SCRIPT.md) (it is rewritten for the pirates after the freeze), with roles: who drives the projector, who holds the phones, who explains which part.
- [ ] **The day before:** open the Supabase dashboard once, so a sleeping free project wakes up.
- [ ] **On the day:** host console (`/host.html`) > **Class demo** > **New class code**, then show the QR. **After:** **New class code** again.

## 6. Submission

- [ ] README complete by Fri 20 Nov: deployed URL, every member's name and student number, the install / run / test commands on the first screen.
- [ ] One member submits the repository link on Moodle by **Sun 22 Nov** (deadline Mon 23 Nov, 23:59; later commits do not count); a named backup can submit if needed. Keep a screenshot of the confirmation.

## 7. Status on Thu 12 Nov, ~05:30: v3 is live

- **Live (main):** v3, see §2 and [GAME-V3.md](GAME-V3.md). The database has six new migrations (20261112020000 inner walls to 20261112070000 tower tiers), applied in order, each stored text checked against its file (md5), only the server may run the new functions (security advisor: nothing new above INFO).
- **Checks before release:** frontend 2,744 tests, build, budgets, text lint, `test:mp` (4 pages: same ships and boarders on every screen, a fall and a revive on the same tick, a tower skill seen by all), `test:a11y`, `test:demo`, `test:market` green; backend 15,919 tests and ruff green; 87 SQL tests on a scratch Postgres; an independent review of the four new money migrations (two fixes taken).
- **Live check:** health ok, security headers, flags, signed-out 401s and the build stamp were checked in a browser. Vercel's bot checkpoint now answers scripted requests (`curl`, `scripts/smoke-live.sh`) with a challenge page, so run the live check from a browser or ask the owner.
- **Known small issues (good first tasks):** in a friend's game the arrival banner still says "Your island"; on phones the game chip covers the top of the goals strip; `docs/HOW-TO-PLAY.md` predates v3; five stars overlap a little over a level-5 building; a firing cannon or mortar shows the level-1 frame for a moment; the narrator lines without audio show as captions only. The late game (waves 30–100) is tuned on a headless model, not by playing (T3).

## 8. Small follow-ups (good first tasks if your lane waits)

- [x] ✅ **Staggered arrivals** in rehearsal `?demo=1&captains=40`, so the arrival ripple plays (`frontend/src/class-demo/rehearsal.js`). Done (owner's agents): the captains step ashore one by one over about 25 s (`&stagger=0` brings them all at once).
- [x] ✅ **Busy-laptop timing check**: the presenter-tour check "one key skips each step quickly" fails under heavy load; measure in frames, not milliseconds. Done (owner's agents): nothing left to fix; the check left with the highlights tour in g30 (10 Nov), and no millisecond key check remains.
- [x] **Host-console probes** for the new tables (`islands`, `wave_runs`, `demo_class_code`, `demo_guests`): done by the owner's agents, `20261113030000_host_console_v3.sql` redefines `host_console_overview()` (one new `game` key, counts only). Live (Fri 13 Nov): applied and checked.
