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

## 1. Every member, today (30 minutes)

- [ ] Accept the GitHub invite (write access to `Nilsnova/The-Great-Plot-Twist`), set your own git name and email, clone `main`, and run the checks once ([ENGINEERING.md](ENGINEERING.md#3-commands)).
- [ ] Pick **one lane** in [BUILD-PLAN.md](BUILD-PLAN.md#4-lanes-and-tasks): **P** pirates, **H** Harbor and coins, **U** look and feel. Lane 0 (server, database, release) is the project owner's.
- [ ] Give your coding agent the prompt in [contribute/AGENT-PROMPT.md](contribute/AGENT-PROMPT.md) and tell it your lane.
- [ ] Open your first **draft pull request** today from your own account, titled with the task ID (for example `[P1] Wave simulation`).

## 2. Lane tasks (by Thu 19 Nov; details in BUILD-PLAN.md)

Start with the ★★★ tasks; each member merges at least two pull requests of their own.

| Lane | ★★★ first | Then |
|---|---|---|
| P, Pirates | P1 wave simulation + fake API · P2 pirate pixel art · P3 waves on screen | P4 man a cannon / repair · P5 sounds |
| H, Harbor and coins | H1 `formatCoins()` 🪙 everywhere · H2 market stall "up or down?" · H3 match board and fortune teller | H4 weather board · H5 stalls in the world |
| U, Look and feel | U1 new panel style · U2 HUD with three things · U3 first 3 minutes · U4 play with friends | U5 toasts and feedback |

Work against the fakes in BUILD-PLAN section 3 until the real API is wired in (planned Sat 14 – Sun 15 Nov). The real API's error shape is `{"error": {"code", "message"}}`. Lanes U and H: start from [UX-AUDIT.md](UX-AUDIT.md).

## 3. Every member, before the freeze (walkthrough = 20% of the grade)

- [ ] **Walkthrough sheet** ([FINAL-ROADMAP A1](FINAL-ROADMAP.md#a-repository-walkthrough-criterion-6-20)): each member writes the page about their own lane (what, where, why, limits, how it could change) in `docs/WALKTHROUGH.md`; one member adds the database/server page with the project owner.
- [ ] **Mock walkthrough** (A2): each member answers 6 random questions aloud, without notes, about **any** part, including the three course questions: where the data is stored, what the tests cover and miss, what happens when an external API is down.
- [ ] **Invalid input** (D1): one test per rejected input in your lane (empty, too long, wrong type, repeated click).
- [ ] **Test map** (E1): add your lane's row to `docs/TEST-MAP.md`: which tests cover it and what they do not.
- [ ] **README line** (F1, by Fri 20 Nov): add your own name and student number to the README members table yourself.

## 4. Account setup (needs dashboard access; the project owner or a member with access)

### 4a. Guest sign-in for the class code (3 minutes, once, after the class-code release is live)

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

### 4c. Stock prices: re-enter the Finnhub key (5 minutes, project owner)

Finnhub answers every stock request with HTTP 401 (key rejected, seen in the live log on 10 Nov).
1. finnhub.io > Dashboard > copy the API key (or create a new one).
2. Vercel > project the-great-plot-twist > Settings > Environment Variables > `STOCK_API_KEY` > Edit: paste with no spaces or quotes, Production and Preview > Save.
3. Redeploy the latest production deployment (or wait for the next push).

### 4d. Approve the prediction questions (10 minutes, project owner or any member)

The fortune teller shows nothing because all questions in `backend/content/predictions/questions.json` still say `reviewedBy: pending`. Read each question; approve the suitable ones for a class (no politics, violence or gambling-adjacent topics) by a pull request that sets `reviewedBy` to your name; replace unsuitable ones.

## 5. Before the class demo (the new game)

- [ ] **Two-phone test** (20 minutes): presenter laptop on the projector, signed in with the host account, press **J**. Two phones scan the QR and press Play. Check: both appear, build a cannon, ring the bell and win a wave, visit each other's island by code, place a 10 🪙 stake at the Harbor, and fight one Pirate Point wave together with the three lamps.
- [ ] **Presenter laptop check** (5 minutes): on power, full screen, `https://the-great-plot-twist.vercel.app/?demo=1&captains=40&perf=1`; the FPS number stays around 50 or higher.
- [ ] **Two rehearsals** of the 5-minute script in [PRESENTER-SCRIPT.md](PRESENTER-SCRIPT.md) (it is rewritten for the pirates after the freeze), with roles: who drives the projector, who holds the phones, who explains which part.
- [ ] **The day before:** open the Supabase dashboard once, so a sleeping free project wakes up.
- [ ] **On the day:** host console (`/host.html`) > **Class demo** > **New class code**, then show the QR. **After:** **New class code** again.

## 6. Submission

- [ ] README complete by Fri 20 Nov: deployed URL, every member's name and student number, the install / run / test commands on the first screen.
- [ ] One member submits the repository link on Moodle by **Sun 22 Nov** (deadline Mon 23 Nov, 23:59; later commits do not count); a named backup can submit if needed. Keep a screenshot of the confirmation.

## 7. Lane 0 (project owner with Claude): status on Tue 10 Nov, evening

**Merge `main` into your branch now:** the mystery is gone from `main` (D031), so files you may have looked at this morning no longer exist.

- **Live:** the class code for guests (D030) and email sign-in (hidden until 4b is done); the mystery, festival, bulletin and rewards pages removed; the islands and waves server (D032) with its database, switched off (flag `islands`) until the pirate frontend is wired in.
- **Real API ready for wiring:** `/api/island`, `/api/island/build`, `/api/island/visit/{code}`, `/api/waves/start`, `/api/waves/join`, `/api/waves/current`, `/api/waves/finish` (BUILD-PLAN section 3.4). New players get 100 🪙 when their island opens.
- **Next:** the new voiced pirate intro, the wiring day (Sat 14 – Sun 15 Nov), the fresh start for all players and the release on Thu 19 Nov.
- **Known gaps:** a brand-new player has 0 🪙 until their island opens (the wiring fixes it); football shows no matches during the international break (back around 21 Nov); the prediction questions all settle after the deadline (lane H task H3 picks short-term ones).

## 8. Small follow-ups (good first tasks if your lane waits)

- [ ] **Wind on flags** in the harbor (`frontend/src/world/wind.js`): only tree crowns move today.
- [ ] **Staggered arrivals** in rehearsal `?demo=1&captains=40`, so the arrival ripple plays (`frontend/src/class-demo/rehearsal.js`).
- [ ] **Busy-laptop timing check**: the presenter-tour check "one key skips each step quickly" fails under heavy load; measure in frames, not milliseconds.
- [ ] **Host-console probes** for the new tables (`islands`, `wave_runs`, `demo_class_code`, `demo_guests`): write the migration that redefines `host_console_overview()`; the project owner applies it.
