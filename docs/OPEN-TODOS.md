# Open to-dos

> **What this file is:** the one list of work that is still open, for anyone on the team. No task here belongs to a particular person: pick one, do it, then tick it off here in the same pull request (or tell the person who keeps this list).
>
> **Last updated:** Mon 9 Nov 2026, after the G29 class-demo release (main `c7f8c95`, live on https://the-great-plot-twist.vercel.app).
>
> **Never** paste keys, SMTP passwords, tokens or student numbers into this file, a commit, an issue or a chat. They go straight into the Supabase or Vercel dashboard.

## 1. Account setup in the Supabase dashboard (needs dashboard access)

### 1a. Guest sign-in for the class code (about 3 minutes, once)

Wait until the class-code release (section 3) is live on main. Then guests can only play with the current class code from the projector QR, so this setting stays on for good. There is no switching on and off per lecture.

1. supabase.com/dashboard > project **great-plot-twist** > **Authentication** > **Sign In / Providers** > under "User Signups" switch on **Allow anonymous sign-ins** > **Save**.
2. **Authentication** > **Rate Limits** > **anonymous sign-ins per hour**: set **100** > **Save**. A whole class shares one Wi-Fi address, and the default of 30 is too low.
3. Check: open the live site on a phone with the current class link (host console > Class demo) and press Play. You should land in the class harbor.

### 1b. Email sign-in with a 6-digit code (about 15 minutes)

Supabase's built-in mailer only delivers to the project team's own addresses, about two emails an hour, so email login needs a mail service. Google sign-in was dropped; the options are GitHub, email and guests.

1. **brevo.com**: create a free account (300 emails a day). **Senders, Domains & Dedicated IPs** > **Senders** > **Add a sender**: name "The Great Plot Twist", an email address the team controls. Confirm the email Brevo sends.
2. Brevo > **SMTP & API** > **SMTP** tab > **Generate a new SMTP key**. Keep it only in the next step.
3. Supabase > **Authentication** > **Emails** > **SMTP Settings** > **Enable custom SMTP**:
   - sender email: the Brevo sender; sender name: The Great Plot Twist
   - host `smtp-relay.brevo.com`, port `587`
   - username: the Brevo SMTP login; password: the SMTP key
   - **Save**.
4. Supabase > **Authentication** > **Emails** > **Templates**: put the code `{{ .Token }}` into **three** templates, then **Save** each. The game asks for this 6-digit code; a code works better on phones than a link.
   - **Magic Link** (returning players): subject `Your Great Plot Twist sign-in code`, body `<p>Your sign-in code is <strong>{{ .Token }}</strong>. It works for 1 hour.</p>`
   - **Confirm signup** (a new email address gets this one): subject `Your Great Plot Twist sign-in code`, same body.
   - **Change Email Address** (a guest who adds an email to keep their progress): subject `Confirm your email for The Great Plot Twist`, body `<p>Your confirmation code is <strong>{{ .Token }}</strong>. It works for 1 hour.</p>`
5. Supabase > **Authentication** > **Sign In / Providers** > **Email**: enabled; **Confirm email** stays on (without it a guest could claim someone else's address); **Email OTP length** 6; **Email OTP expiration** 3600 seconds or less. If Google is still switched on there, switch it off. Then **Rate Limits** > emails sent per hour: **100**.
6. Once the game's email option is switched on (Vercel `AUTH_PROVIDERS=github,email`, section 3), send one test code to your own address from the live site and report it here.

Note: mail sent from a free-mail address (for example Gmail) through Brevo can land in spam. Tell players to check their spam folder. Owning a domain fixes this but costs money, so it needs the project owner's decision.

## 2. Before the class demo

- [ ] **Two-phone test** (20 minutes): the presenter laptop on the projector, signed in with the host GitHub account, press **J**. Two phones scan the QR and press Play. Check that both appear on the laptop, then wave, start a friendly duel (two taps), open the Keeper's Lock with the real weather, and light the three lamps (laptop + two phones, or the host's "Fill missing lamps").
- [ ] **Presenter laptop check** (5 minutes): on power, browser full screen, open `https://the-great-plot-twist.vercel.app/?demo=1&captains=40&perf=1`. The FPS number should stay around 50 or higher.
- [ ] **One rehearsal** of the 5-minute script in [PRESENTER-SCRIPT.md](PRESENTER-SCRIPT.md).
- [ ] **The day before:** open the Supabase dashboard once, so a sleeping free project wakes up.
- [ ] **On the day:** host console (`/host.html`) > **Class demo** > **New class code** (or the J projector panel), then show the QR.
- [ ] **After the demo:** **New class code** again, so the projector code stops working for new guests. Old guest accounts are removed after 24 hours whenever the host console is opened.

## 3. In this release (merged on `integrate/g29`, waiting for review and release to main)

- **Class-code gate** (was `feat/g29-classcode`): replaces the on/off demo window. Guests need the current class code from the QR; the database rules let an anonymous user without a code do nothing. Its migration `20261109020000_class_code.sql` is already applied to the live database. The account setup in section 1a is still needed once the release is live.
- **Email sign-in** (was `feat/g29-email`): "Email me a sign-in code" next to GitHub in Settings > Account; the Google option is removed. A guest who joined with the class code can keep their progress with GitHub or an email code. It is switched on in the game (Vercel `AUTH_PROVIDERS=github,email`) only after section 1b is done and one test code arrived.

## 4. Smaller follow-ups (good first tasks)

- [ ] **Wind on flags:** the wow-graphics pass moves tree crowns in the wind but not the harbor flags (`frontend/src/world/wind.js`).
- [ ] **Arrival ripples in rehearsal:** in `?demo=1&captains=40` all simulated captains arrive in the first snapshot, so the arrival ripple never plays. Stagger their arrival (`frontend/src/class-demo/rehearsal.js`).
- [ ] **Old title buttons in two browser scripts:** `frontend/scripts/check-festival-ui.js` and `check-friends-entry.js` still drive the removed title buttons (New game, Play with friends). They are not in a gate list; update them to Play, Join and Settings like the other scripts.
- [ ] **Host-console migration probes:** `host_console_overview()` in the database probes a fixed table list without `demo_window` (and without the sports desk). Adding them needs a small migration that redefines the function; the server list is in `backend/server/host_console.py`.
- [ ] **Busy-laptop timing check:** `test:g8`'s presenter-tour check "one key skips each step quickly" fails when the laptop is under heavy load (23 fps). Make it measure in frames rather than milliseconds, or skip it when the measured frame rate is low.
- [ ] **Restart a half-finished prologue:** the Lighthouse prologue resumes an unfinished intro and offers "Start a new intro" only at its ending. Decided to leave as is for now; reopen if players ask.

## 5. Course deadline

- [ ] **End review** of the whole game, then the **Moodle submission by Mon 23 Nov 2026, 18:00**: the live link, the repository and the report, with a named backup person who can submit if the first one cannot.
