# One-time setup: GitHub, Supabase, Vercel

Who does this: the owner of the repository account (Nilsnova), with one teammate for Supabase. Time: about 60 minutes. Every fact below was checked against the official docs on 5 Nov 2026; anything not yet proven in practice is marked **test**.

## The golden rule for secrets

Only two values may ever appear in this repo, in chat or in screenshots: the **Supabase project URL** and the **publishable key** (`sb_publishable_...`). Everything else stays in the Supabase and Vercel dashboards (and a password manager):

- the Supabase **secret key** (`sb_secret_...`): it bypasses all access rules;
- the database password;
- the GitHub OAuth **client secret**;
- `CRON_SECRET`;
- any later API keys (market data, sports data, language model).

A variable whose name starts with `VITE_` is copied into the public browser bundle. Never give a secret a `VITE_` name.

## Step 1. GitHub: give the team access (10 minutes)

1. Check that **Nilsnova is a personal GitHub account**, not an organization. Vercel's free plan cannot reliably connect repos owned by organizations.
2. Turn on two-factor authentication for Nilsnova and store the recovery codes.
3. Repo **Settings > Collaborators > Add people**: add the three teammates with **Write** access. Teammates push branches inside this repo and never use forks: Vercel holds pull requests from forks until the owner approves them.
4. Each teammate runs once, with the email that is verified on their own GitHub account:
   ```bash
   git config --global user.email "their-verified-github-email@example.com"
   ```
   Vercel checks commit authors, and the course checks that every member contributed code from their own account.
5. Protect `main` (see "Repository settings to enable" in [CONTRIBUTING.md](../CONTRIBUTING.md)): require a pull request with one approval, dismiss stale approvals, block force pushes and deletion, and apply the rules to the owner too.

## Step 2. Supabase: the database and login service (15 minutes)

**Who owns it.** Supabase allows **two active free projects per person**, counted across every organization where that person is Owner or Administrator. Nils' own Supabase account already has two active projects, so the team project must be owned by someone else. Recommended: the teammate who owns lane A (accounts and multiplayer) creates it, and invites the others.

1. The owner signs in at supabase.com and creates an organization (Free plan) and a project:
   - name: `great-plot-twist`;
   - region: **West EU (Ireland), eu-west-1** (chosen on 5 Nov). Vercel's functions then run in Dublin (`dub1`), next to it;
   - security options: Data API **on**, "Automatically expose new tables" **off**, "Enable automatic RLS" **on** (see [supabase/README.md](../supabase/README.md#project-settings-this-migration-relies-on));
   - a strong database password, saved only in a password manager.
2. Invite the other teammates from **Organization > Team** as **Developer**, never Administrator or Owner: Owners and Administrators count against the two-project limit. Invite links expire after 24 hours.
3. Note from **Project Settings > API Keys**: the Project URL and the publishable key. The secret key stays here until Step 4.
4. First switch **Email** off under **Authentication > Sign In / Providers** (see Step 3, point 5), so that nobody can create a user before our rules exist. Then apply the first migration: open **SQL Editor**, paste [supabase/migrations](../supabase/migrations) in order, run, then follow the two-user test plan in [supabase/README.md](../supabase/README.md).

## Step 3. Sign in with GitHub (10 minutes)

The Supabase owner (or an Administrator) does this; Developers cannot change login settings.

1. Supabase: **Authentication > Sign In / Providers > GitHub**. Copy the callback URL, which looks like `https://<project-ref>.supabase.co/auth/v1/callback`.
2. GitHub, signed in as Nilsnova: **Settings > Developer settings > OAuth Apps > New OAuth App**.
   - Application name: The Great Plot Twist.
   - Homepage URL: the Vercel production address once it exists (the repo URL is fine until then).
   - Authorization callback URL: the Supabase callback from point 1.
   - Leave "Enable Device Flow" unticked. Register, copy the **Client ID**, click **Generate a new client secret** and copy it.
3. Supabase: paste the Client ID and Client Secret into the GitHub provider, switch it on, save.
4. Supabase: **Authentication > URL Configuration**.
   - Site URL: the production address, e.g. `https://<project>.vercel.app`.
   - Redirect URLs: `http://localhost:5173/**` and the production address `https://<project>.vercel.app/**`. Do **not** add a wildcard for preview addresses (`https://*-<vercel-account-slug>.vercel.app/**`). Anyone can create a Vercel project, and a stranger who can register an address that fits the wildcard (we have not tested whether Vercel allows it) could start a sign-in from their own site and receive a session for any teammate who follows their link. If you need a sign-in on one preview, add that preview's exact address for the test and remove it afterwards. If the wildcard is already in the list, remove it.
5. Keep the **Email** provider **off** (a new project has it on) until Step 3b, and keep phone off. Anonymous sign-ins stay off except during the class demo (Step 3c). The built-in mailer sends 2 emails per hour and only to team members, so email sign-in needs your own SMTP first (Step 3b).
6. **Test:** open **Authentication > Rate Limits** and note whether the free plan lets you raise them. The whole class shares one Wi-Fi address, and sign-in limits are counted per address (for example 30 sign-ins per 5 minutes).

### Step 3b. Email sign-in with a 6-digit code, the second provider (optional, 20 minutes)

GitHub stays the default. Email users are ordinary players, with no demo gating. The browser offers
**Email me a sign-in code** in Settings > Account only when the Vercel setting `AUTH_PROVIDERS`
lists it (`github,email`; an unknown name stops the server, `google` included since it was dropped),
and `GET /api/config` then answers `"auth": {"provider": "github", "providers": ["github",
"email"], ...}`. The player types the code into the same tab (`signInWithOtp`, then `verifyOtp`
with type `email`); no link or redirect is used, so the CSP needs nothing new. A guest who enters
an email gets a confirmation code instead (`updateUser({email})`, then `verifyOtp` with type
`email_change`), and the same player id keeps its progress.

1. Supabase: **Authentication > Emails > SMTP Settings**: switch on custom SMTP with the project's
   mail provider (sender address, host, port, user, password stay in the dashboard only). The
   built-in mailer is not enough for players.
2. Supabase: **Authentication > Emails > Templates**: put the code `{{ .Token }}` into the
   **Magic Link** template (players who already have an account), the **Confirm signup** template
   (first sign-in of a new address) and the **Change Email Address** template (a guest keeping
   progress). The game never follows `{{ .ConfirmationURL }}`; leave it out or keep it as a
   second way, but the code is what the screen asks for. Suggested text: "Your code for The Great
   Plot Twist is {{ .Token }}. It expires in one hour. If you did not ask for it, ignore this email."
3. Supabase: **Authentication > Sign In / Providers > Email**: switch **Email** on, keep **Confirm
   email** on (otherwise a guest could claim an address without the code), set **Email OTP
   Length** to 6 and **Email OTP Expiration** to 3600 seconds or less. Leave password sign-up
   unused: the game has no password field.
4. Supabase: **Authentication > Rate Limits**: set **Rate limit for sending emails** to what the
   mail provider allows for the class (for example 60 per hour). Supabase also allows one code per
   address every 60 seconds; the screen offers **Send a new code** only after 60 seconds and
   answers a 429 with "Too many requests. Wait a minute, then try again."
5. Test with your own address on a preview (receive, wrong code, right code, resend after 60 s).
6. Vercel: set `AUTH_PROVIDERS=github,email` for Production (and Preview if wanted), then redeploy.
7. To take email away again, remove it from `AUTH_PROVIDERS` first, then switch it off in Supabase.
   Google is no longer offered: if it is still switched on in Supabase, switch it off there.

### Step 3c. Guest play for the class demo (on the day, 5 minutes)

Guests sign in with Supabase's anonymous sign-in and may use the API only while the feature flag
`demo` is on and a host has opened the demo window (`POST /api/host/demo`, decision D029). Apply
migration `20261109010000_demo_window.sql` before the flag goes on.

1. Supabase: **Authentication > Sign In / Providers**: switch **Allow anonymous sign-ins** on.
2. Supabase: **Authentication > Rate Limits**: raise **anonymous sign-ins per hour** (for example to
   300). The whole class shares one Wi-Fi address, and the limit counts per address.
3. Vercel: add `demo` to `FEATURE_FLAGS`, redeploy, then open the window: in `/host.html`, the **Class demo** panel, **Open for 2 hours**; or in the game, the host's J projector button **Open demo for 2 hours**.
4. Afterwards: in the **Class demo** panel of `/host.html`, press **Close now**, then **Clean up guests** (tick the confirm box first; it deletes anonymous users older than 24 hours, at most 100 per press), and
   switch anonymous sign-ins off again. While anonymous sign-in is on, guests hold Supabase's
   `authenticated` role, so the read policies and Realtime rooms admit them even with the window
   closed; only this API is gated.

## Step 4. Vercel: hosting (15 minutes)

1. In the browser, sign out of every other GitHub account. Go to vercel.com/signup and choose **Continue with GitHub** as **Nilsnova** (Hobby plan, free, non-commercial use only). Only the owner of a personal repo can import it, and a Hobby account has exactly one GitHub login. If Nilsnova is already linked to another Vercel account, linking it to a new one removes it from the old one.
2. **Add New > Project**, import `Nilsnova/The-Great-Plot-Twist`. The build settings come from `vercel.json` in the repo (Vercel Services: the game in `frontend/`, the Python API in `backend/`).
3. **Function region**: Dublin (`dub1`), next to the Supabase project in Ireland. `vercel.json` sets it (`regions`), so the dashboard setting (Settings > Functions) no longer decides it. New projects default to Washington.
4. **Settings > Environment Variables**, for Production and Preview:

   | Name | Value | Visible in the browser? |
   |---|---|---|
   | `APP_ENV` | `production` (Production) or `preview` (Preview) | no |
   | `SUPABASE_URL` | the Project URL | no |
   | `SUPABASE_PUBLISHABLE_KEY` | the publishable key | no |
   | `SUPABASE_SECRET_KEY` | the secret key, pasted straight from Supabase | **no, never** |
   | `VITE_SUPABASE_URL` | the Project URL | yes (safe) |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | the publishable key | yes (safe) |
   | `CRON_SECRET` | a long random string | no |
   | `DEMO_MODE` | `false` | no |
   | `FEATURE_FLAGS` | empty | no |

5. Deployment protection: the production address is public, preview addresses ask for a Vercel login. In class, always use the production address.
6. Free-plan limits worth knowing: 100 deployments per day and one build at a time (every pushed branch builds a preview); going over the free usage pauses the project for up to 30 days, so never leave a loop polling an API.

## Local API without Supabase credentials

For browser integration with disposable players and real local database rules, follow
[LOCAL-TEST-SERVER.md](LOCAL-TEST-SERVER.md). From `backend/`, one command starts port 8000:
`LOCAL_TEST_SERVER=1 APP_ENV=local uv run --with pgserver --with 'psycopg[binary]' python -m tools.local_server`.
The tool refuses preview/production, ignores injected Supabase settings and removes all local
data when stopped. The normal server's sign-in flow is unchanged.

## Step 5. Prove it works (15 minutes, once the foundation branch is pushed)

Run checks 1, 2, 4 and 5 on a branch that contains `frontend/` (merge `main` first). Check 3 runs the daily keep-alive workflow on GitHub (see "Keep it awake until the demo" below). Do not try to pass it with a `crons` entry in `vercel.json`: that breaks our deploys.

| # | Check | Pass when | If it fails |
|---|---|---|---|
| 1 | A teammate pushes a branch | Vercel shows the preview as **Ready**, not Blocked | **Test.** Vercel's docs and its newest help article disagree on whether non-owners can deploy on Hobby. Fallback: only Nilsnova merges to `main`, which triggers production. |
| 2 | Open `/api/health` on the preview | `{"status": "ok", ...}` | Check the `vercel.json` services block and the function logs. |
| 3 | The daily keep-alive: in GitHub open **Actions > Keep Supabase awake > Run workflow** on `main`, or wait for the daily run at 06:17 UTC. Vercel Cron is out: `vercel.json` has no cron entry and must never get one while we use Vercel Services. | The run is green and its log says `keep-alive answered 200`. | `401`: the repository secret `CRON_SECRET` differs from Production's (Step 4). `503`: Production's `CRON_SECRET` is empty or the database cannot be read. Fix the setting and run it again. Never fall back to a `crons` entry in `vercel.json`. |
| 4 | Two test users | each sees only their own rows ([supabase/README.md](../supabase/README.md)) | Stop: fix the access rules before any real data. |
| 5 | GitHub sign-in, on the check page `/auth-check.html` (see below) | a round trip ends with `Signed in as Captain-xxxxxx, coins 0, crews 0` | Check the callback URL and the redirect list (Step 3, and the note below). |

**Before check 5 can work: tell Supabase where the check page lives (one time).** The check page signs in through Supabase and comes back to `/auth-check.html` on the same address, and Supabase sends the browser back only to addresses on its list. In the Supabase dashboard open **Authentication > URL Configuration** and make sure that:

- **Site URL** is `https://the-great-plot-twist.vercel.app`, and
- **Redirect URLs** lists `https://the-great-plot-twist.vercel.app/**`, next to `http://localhost:5173/**` (and no preview wildcard, see Step 3).

If the address is missing, Supabase sends the browser to the Site URL instead, with a one-time sign-in code in the address bar (never a token), and the check page never sees it. Close that tab (the code is useless without the secret that only the check page's own tab holds), fix the list and try again.

**The check page.** Open `https://the-great-plot-twist.vercel.app/auth-check.html` (use the production address: preview addresses ask for a Vercel login first). It is a team check page, not the game. Press **Sign in with GitHub**. The first sign-in creates your player account, and the page then prints one line from `GET /api/me`: your placeholder name, your coins and how many crews you sit in. **Forget me** clears the login token from the page. The page signs in with Supabase's PKCE flow: it makes a secret and keeps it in its own tab, Supabase sends the browser back with a one-time code (the address never holds a login token, so none ends up in the browser history), and our server swaps the code for a login token (`POST /api/auth/exchange`). The refresh token and GitHub's own token never reach the browser. Do the whole sign-in in one tab: if the page says "This sign-in link does not work any more", the secret was gone (another tab, or the same link used twice), so press the button again. If the page says "Your player record is not set up yet", the account was made before the migration was applied: delete that user under **Authentication > Users** and sign in again ([supabase/README.md](../supabase/README.md#if-someone-signed-in-before-you-ran-the-migration)). The page needs the API on the same address, so it works on Vercel but not (yet) on your laptop, where the Vite dev server does not pass `/api` on to the API.

## Opening the relight switch

`case` stays off until every case migration read by the deployment is applied. `RELIGHT_OPEN` stays unset during team tests. Only explicit `true` with `APP_ENV=production` opens this irreversible switch; local and preview copies refuse to start with it. Claude opens it only after the last team test crew has finished, then redeploys production. Phase 1 has an empty world hook, so its solves change only their crew. Later phases implement the world change; locked solves never replay into the world after the switch opens (Nils, 6 Nov 2026).

## Keep it awake until the demo

Free Supabase projects pause after **7 days of low activity**. The route `GET /api/keepalive` does a few small database reads, which count as activity. **A scheduled GitHub Actions workflow calls it once a day:** `.github/workflows/keepalive.yml`.

We tried Vercel Cron first. On 5 Nov 2026 a `crons` entry in `vercel.json` stopped our production deploys: production stayed on an old version until commit `409316e` took the entry out. We cannot see a failed deploy from outside, because Vercel keeps serving the last good one. **Never add `crons` back to `vercel.json` while we use Vercel Services.** The full story is in [ARCHITECTURE.md](ARCHITECTURE.md#the-7-day-pause-and-the-keep-alive).

**Decided by Nils on 5 Nov 2026: a scheduled GitHub Actions workflow.** It runs every day at 06:17 UTC and sends the header `Authorization: Bearer <CRON_SECRET>`. It costs nothing because the repository is public, and GitHub turns a schedule off after 60 days without activity in the repository.

**One-time setup (Nils, about 3 minutes):**

1. In Vercel, open the project, then **Settings > Environment Variables**, and copy the value of `CRON_SECRET`. If Vercel does not show it (a sensitive variable), make a new long random value, save it there as the new `CRON_SECRET` for Production, and redeploy (any push to `main` does that).
2. In GitHub, open the repository's **Settings > Secrets and variables > Actions > New repository secret**, name it `CRON_SECRET` and paste the same value. The secret lives only in these two settings, never in the repository, a file or chat.
3. Open **Actions > Keep Supabase awake > Run workflow** and run it on `main`. A green run whose log says `keep-alive answered 200` passes check 3.

In demo week, still open the Supabase dashboard the day before the demo and check that the project is active. A paused project can be resumed from the dashboard (allow a few minutes).

## Afterwards

Tell the team (or Claude) the Project URL and the publishable key, so `.env.example` and the README can be completed. Never share the secret key, the database password or the OAuth client secret.
