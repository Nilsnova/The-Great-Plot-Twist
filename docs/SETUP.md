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
   - a strong database password, saved only in a password manager.
2. Invite the other teammates from **Organization > Team** as **Developer**, never Administrator or Owner: Owners and Administrators count against the two-project limit. Invite links expire after 24 hours.
3. Note from **Project Settings > API Keys**: the Project URL and the publishable key. The secret key stays here until Step 4.
4. Apply the first migration: open **SQL Editor**, paste [supabase/migrations](../supabase/migrations) in order, run, then follow the two-user test plan in [supabase/README.md](../supabase/README.md).

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
   - Redirect URLs: `http://localhost:5173/**` and the preview pattern `https://*-<vercel-account-slug>.vercel.app/**`.
5. Do **not** switch on email sign-up or magic links: the built-in mailer sends 2 emails per hour and only to team members.
6. **Test:** open **Authentication > Rate Limits** and note whether the free plan lets you raise them. The whole class shares one Wi-Fi address, and sign-in limits are counted per address (for example 30 sign-ins per 5 minutes).

## Step 4. Vercel: hosting (15 minutes)

1. In the browser, sign out of every other GitHub account. Go to vercel.com/signup and choose **Continue with GitHub** as **Nilsnova** (Hobby plan, free, non-commercial use only). Only the owner of a personal repo can import it, and a Hobby account has exactly one GitHub login. If Nilsnova is already linked to another Vercel account, linking it to a new one removes it from the old one.
2. **Add New > Project**, import `Nilsnova/The-Great-Plot-Twist`. The build settings come from `vercel.json` in the repo (Vercel Services: the game in `frontend/`, the Python API in `backend/`). Until the foundation branch is merged, `main` has nothing to build; that is expected.
3. **Settings > Functions > Function Region**: Dublin (`dub1`), next to the Supabase project in Ireland. New projects default to Washington.
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

## Step 5. Prove it works (15 minutes, once the foundation branch is pushed)

| # | Check | Pass when | If it fails |
|---|---|---|---|
| 1 | A teammate pushes a branch | Vercel shows the preview as **Ready**, not Blocked | **Test.** Vercel's docs and its newest help article disagree on whether non-owners can deploy on Hobby. Fallback: only Nilsnova merges to `main`, which triggers production. |
| 2 | Open `/api/health` on the preview | `{"status": "ok", ...}` | Check the `vercel.json` services block and the function logs. |
| 3 | The daily keep-alive | Vercel > Cron Jobs lists `/api/keepalive`, and it succeeds on production | **Test.** Cron together with Services is not documented. Fallback: a GitHub Actions schedule (only with Nils' OK) or Supabase Cron. |
| 4 | Two test users | each sees only their own rows ([supabase/README.md](../supabase/README.md)) | Stop: fix the access rules before any real data. |
| 5 | GitHub sign-in on the preview | a round trip ends signed in | Check the callback URL and the redirect list (Step 3). |

## Keep it awake until the demo

Free Supabase projects pause after **7 days of low activity**. The daily keep-alive runs a few small database reads. In demo week also open the Supabase dashboard yourself, and the day before the demo check that the project is active. A paused project can be resumed from the dashboard (allow a few minutes).

## Afterwards

Tell the team (or Claude) the Project URL and the publishable key, so `.env.example` and the README can be completed. Never share the secret key, the database password or the OAuth client secret.
