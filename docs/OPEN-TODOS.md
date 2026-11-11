# Open to-dos

> **What this file is:** the one checklist of what is still open, for every team member. Tick a box in the same pull request that does the work. No task is assigned to a person; take what fits you and claim it with a draft pull request.
>
> **The plan behind it:** [PITCH.md](PITCH.md) (what the game is now), [BUILD-PLAN.md](BUILD-PLAN.md) (the lanes and their tasks), [FINAL-ROADMAP.md](FINAL-ROADMAP.md) (grading criteria and dates).
>
> **Key dates:** feature freeze **Thu 19 Nov** · README complete **Fri 20 Nov** · submit by **Sun 22 Nov** (deadline Mon 23 Nov, 23:59) · presentations Tue 24 Nov or Fri 4 Dec.
>
> **Never** paste keys, SMTP passwords, tokens or student numbers into a chat, an issue or a commit message. Student numbers go only into the README line of their owner.
>
> Last updated: Tue 10 Nov 2026.

## 1. If you jump in now (30 minutes to start)

The game is built and live; nobody waits for anyone. You extend it.

- [ ] Accept the GitHub invite (write access), set your own git name and email, clone `main`, run the checks once ([ENGINEERING.md](ENGINEERING.md#3-commands)).
- [ ] Read [PITCH.md](PITCH.md) and [TOWER-DEFENSE.md](TOWER-DEFENSE.md) (how the game works now) and play it once on the live site.
- [ ] Give your coding agent the prompt in [contribute/AGENT-PROMPT.md](contribute/AGENT-PROMPT.md), pick ONE task below, and open a draft pull request from your own account, titled with the task ID.
- [ ] Every member needs at least one merged pull request of their own before Sun 22 Nov (course rule: every member contributes code).

## 2. Open tasks you can pick (small, independent; updated Wed 11 Nov, evening)

| ID | Task | Where | Size |
|---|---|---|---|
| T1 | **A new tower**: e.g. a harpoon tower (slows ships) or a fire tower (damage over time): stats in the simulation, a sprite, a build-card line, tests | `frontend/src/pirates/sim.js`, `frontend/scripts/pixel_art/pirates.py`, `docs/TOWER-DEFENSE.md` | M |
| T2 | **A new pirate ship type** (fast raider or a ship that targets towers): sprite, stats, appears from wave N, tests | same as T1 | M |
| T3 | **Balance pass**: play waves 1–15 with friends, write down what felt too easy or too hard, tune the numbers in the simulation's CONFIG, keep the balance tests green | `frontend/src/pirates/sim.js` | S–M |
| T4 | **Sounds**: better cannon, mortar, musket, warship horn and victory sounds with the procedural audio | `frontend/src/audio/pirates.js` | S |
| T5 | **Island decoration**: flags that show your best wave, a statue at wave 25, trees that grow with houses | `frontend/src/island/`, art | M |
| T6 | **Harbor idea**: one more simple stall on real data (e.g. "Will it rain in Lisbon tomorrow?" on the weather API), same card style | `frontend/src/harbor/`, backend weather | M |
| T7 | **Leaderboard**: best waves of all islands this week (read-only route + a small card) | backend `island/`, `frontend/src/island/` | M |
| T8 | **Walkthrough page for the part you touched** (what, where, why, limits, how it could change) | `docs/WALKTHROUGH.md` | S |
| T9 | **Invalid-input tests** for one route you understand (empty, too long, wrong type, repeated click) | `backend/server/tests/` | S |
| T10 | **Your README line**: your name and student number (by Fri 20 Nov) | `README.md` | XS |

**Live since Wed 11 Nov, ~19:50:** tower defense v2 (upgrades to level 3, the mortar, crew, the fighting captain, unlocks by wave, boss warships, waves up to 100, building together on a friend's island and on Pirate Point, play-with-a-friend links for up to 4 players), clean detailed art, more football leagues. Merge `main` before you start; build on [TOWER-DEFENSE.md](TOWER-DEFENSE.md).

## 3. Every member, before the freeze (walkthrough = 20% of the grade)

- [ ] **Walkthrough sheet** ([FINAL-ROADMAP A1](FINAL-ROADMAP.md#a-repository-walkthrough-criterion-6-20)): each member writes the page about their own lane (what, where, why, limits, how it could change) in `docs/WALKTHROUGH.md`; one member adds the database/server page with the project owner.
- [ ] **Mock walkthrough** (A2): each member answers 6 random questions aloud, without notes, about **any** part, including the three course questions: where the data is stored, what the tests cover and miss, what happens when an external API is down.
- [ ] **Invalid input** (D1): one test per rejected input in your lane (empty, too long, wrong type, repeated click).
- [ ] **Test map** (E1): add your lane's row to `docs/TEST-MAP.md`: which tests cover it and what they do not.
- [ ] **README line** (F1, by Fri 20 Nov): add your own name and student number to the README members table yourself.

## 4. Account setup (needs dashboard access; the project owner or a member with access)

### 4a. ✅ Done (Wed 11 Nov): guest sign-in for the class code is on (verified: anonymous sign-ins allowed)

Guests can only play with the current class code from the projector QR, so this setting stays on for good.
1. supabase.com/dashboard > project **great-plot-twist** > **Authentication** > **Sign In / Providers** > under "User Signups" switch on **Allow anonymous sign-ins** > **Save**.
2. **Authentication** > **Rate Limits** > **anonymous sign-ins per hour**: **100** > **Save** (a whole class shares one Wi-Fi address).
3. Check: open the live site on a phone with the current class link (host console > Class demo) and press Play.

### 4b. Email sign-in with a 6-digit code (15 minutes)

Supabase's built-in mailer only reaches the project team, so email login needs a mail service. Sign-in options: GitHub, email and guests (Google was dropped).
1. **brevo.com**: free account > **Senders, Domains & Dedicated IPs** > **Senders** > **Add a sender**: name "The Great Plot Twist", an address the team controls; confirm it.
2. Brevo > **SMTP & API** > **SMTP** > **Generate a new SMTP key**.
3. Supabase > **Authentication** > **Emails** > **SMTP Settings** > **Enable custom SMTP**: sender = the Brevo sender, name "The Great Plot Twist", host `smtp-relay.brevo.com`, port `587`, username = the Brevo SMTP login, password = the SMTP key > **Save**.
4. Supabase > **Authentication** > **Emails** > **Templates**: put `{{ .Token }}` into **three** templates and save each:
   - **Magic Link**: subject `Your Great Plot Twist sign-in code`, body `<p>Your sign-in code is <strong>{{ .Token }}</strong>. It works for 1 hour.</p>`
   - **Confirm signup**: same subject and body.
   - **Change Email Address**: subject `Confirm your email for The Great Plot Twist`, body `<p>Your confirmation code is <strong>{{ .Token }}</strong>. It works for 1 hour.</p>`
5. Supabase > **Authentication** > **Sign In / Providers** > **Email**: enabled; **Confirm email** on; **Email OTP length** 6; **Email OTP expiration** 3600 s or less; Google off. **Rate Limits** > emails per hour: **100**.
6. Tell the project owner "email is on": the game's email option is switched on (Vercel `AUTH_PROVIDERS=github,email`) after one test code arrived. Players should check their spam folder.

### 4c. ✅ Done (Wed 11 Nov): the Finnhub key is re-entered; live stock prices verified

Finnhub answers every stock request with HTTP 401 (key rejected, seen in the live log on 10 Nov).
1. finnhub.io > Dashboard > copy the API key (or create a new one).
2. Vercel > project the-great-plot-twist > Settings > Environment Variables > `STOCK_API_KEY` > Edit: paste with no spaces or quotes, Production and Preview > Save.
3. Redeploy the latest production deployment (or wait for the next push).

### 4d. Prediction questions: no longer needed

The fortune teller was removed from the game on 11 Nov at the owner's request (no prediction market, [D035](DECISIONS.md)), so the questions in `backend/content/predictions/questions.json` need no review. The backend code stays, switched off, until a later cleanup.

## 5. Before the class demo (the new game)

- [ ] **Two-phone test** (20 minutes): presenter laptop on the projector, signed in with the host account, press **J**. Two phones scan the QR and press Play. Check: both appear, build a cannon, ring the bell and win a wave, visit each other's island by code, place a 10 🪙 stake at the Harbor, and fight one Pirate Point wave together with the three lamps.
- [ ] **Presenter laptop check** (5 minutes): on power, full screen, `https://the-great-plot-twist.vercel.app/?demo=1&captains=40&perf=1`; the FPS number stays around 50 or higher.
- [ ] **Two rehearsals** of the 5-minute script in [PRESENTER-SCRIPT.md](PRESENTER-SCRIPT.md) (it is rewritten for the pirates after the freeze), with roles: who drives the projector, who holds the phones, who explains which part.
- [ ] **The day before:** open the Supabase dashboard once, so a sleeping free project wakes up.
- [ ] **On the day:** host console (`/host.html`) > **Class demo** > **New class code**, then show the QR. **After:** **New class code** again.

## 6. Submission

- [ ] README complete by Fri 20 Nov: deployed URL, every member's name and student number, the install / run / test commands on the first screen.
- [ ] One member submits the repository link on Moodle by **Sun 22 Nov** (deadline Mon 23 Nov, 23:59; later commits do not count); a named backup can submit if needed. Keep a screenshot of the confirmation.

## 7. Status on Wed 11 Nov, ~19:50: tower defense v2 is live

- **Live (main `395b309`):** your island with 16 build spots; walls, cannons and mortars up to level 3, watchtower and houses; crew (gunner, carpenter, lookout); your captain's musket (5 levels); unlocks after waves 1, 2, 3, 5 and 8; boss warships every 5th wave; waves up to 100 with a 15-second break and "Next wave"; friends join with one link (`?visit=ISLE-…`, "Join as guest", no account) and build with their own coins on your island; Pirate Point battles with shared buildings; Harbor market calls and football (Premier League, Primeira Liga, Champions League, Brazil, Spain, Italy, Germany, France, Championship, Netherlands); weather changes the waves.
- **Database:** 24 migrations, the last `20261111030000_tower_defense` (applied and verified).
- **Checks before release:** backend 15,876 tests, frontend 2,540, build, budgets, text lint, CSP, accessibility, panels, market and class-demo browser checks all green; live smoke 0 failures; every API answered live (weather, Binance, Finnhub, football-data).
- **Not tested yet:** four real players on live Realtime at once. Report anything odd as a GitHub issue with steps.
- **Known small issues (good first tasks):** outside a wave your island's buildings always look level 1 (levels show in the card and in battle); the musket pose is very short; at Pirate Point the lamp hint covers part of the island on phones.

## 8. Small follow-ups (good first tasks if your lane waits)

- [ ] **Wind on flags** in the harbor (`frontend/src/world/wind.js`): only tree crowns move today.
- [ ] **Staggered arrivals** in rehearsal `?demo=1&captains=40`, so the arrival ripple plays (`frontend/src/class-demo/rehearsal.js`).
- [ ] **Busy-laptop timing check**: the presenter-tour check "one key skips each step quickly" fails under heavy load; measure in frames, not milliseconds.
- [ ] **Host-console probes** for the new tables (`islands`, `wave_runs`, `demo_class_code`, `demo_guests`): write the migration that redefines `host_console_overview()`; the project owner applies it.
