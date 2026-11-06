# Your first contribution in one hour

For each teammate starting their own work. This is a one-hour target for a tiny first PR, assuming repository access, installed tools and an available reviewer; review and merge can take longer. The credits change teaches the workflow. It does **not** replace your own code contribution for the course.

Any teammate may start now, choose any lane or bring an idea. Nobody needs to wait for a lane assignment or for Nils to finish. Start with [CONTRIBUTING.md](../../CONTRIBUTING.md), [AGENTS.md](../../AGENTS.md) and decisions **D001** and **D015** in the [decision log](../DECISIONS.md). This guide does not change those rules.

## Current starting point · 6 November 2026

The repository now includes the case backend, Exchange v2, predictions, Lantern Duels, festival, host console and sports packages. That is source readiness, not a claim that every feature is open in production. The G9 connection for the complete online browser mystery is being built in a cloud session. The festival waits for the first Relighting; sports remains off without its provider key. Read the latest [status](../STATUS.md) and your screen's own availability message before claiming a live flow works.

Start with the workshop below or the [disposable local API](../LOCAL-TEST-SERVER.md). Neither needs production credentials. Player instructions live in [How to play](../HOW-TO-PLAY.md); data handling is in [Privacy](../PRIVACY.md). Keep your first change independent of those pending connections.

## Minutes 0–10: get your own checkout

Accept the repository invitation and use your own GitHub account. Install Git and a Node version supported by [package.json](../../frontend/package.json); Node 24 is a suitable choice ([official download](https://nodejs.org/en/download)). For later Python work, install [uv](https://docs.astral.sh/uv/getting-started/installation/); the backend pins Python 3.12. Do not install a database for this first exercise.

Commands below use Bash (or Git Bash on Windows). In a terminal:

```bash
git clone https://github.com/Nilsnova/The-Great-Plot-Twist.git
cd The-Great-Plot-Twist
git status --short
git config --get user.name
git config --get user.email
```

The status should be empty. If you already have a checkout, preserve any changes before switching branches; do not clone over it. Check that Git uses **your** name and an email linked to **your** GitHub account (a GitHub noreply email is fine). If necessary, set them locally with `git config user.name "Your own name"` and `git config user.email "Your GitHub commit email"`, replacing the quoted text. Never use another teammate's identity or ask an agent to impersonate them.

## Minutes 10–20: run the fake workshop

From the repository root:

```bash
node --version
npm --version
(cd frontend && npm ci)
(cd frontend && npm run dev -- --port 5173 --strictPort)
```

Leave that terminal running. In a browser on **your laptop**, open `http://127.0.0.1:5173/case-lab.html?demo=1`. This workshop uses the memory-only fake adapter: no sign-in, Supabase, API, `.env` or credentials are needed. You should see the case workshop and its rehearsal controls. Try a crew/board screen and confirm that refreshing discards the fake state. Fake coins and progress are not a real account.

These modes are different:

| Address | Purpose |
|---|---|
| `/case-lab.html?demo=1` | Self-contained fake case screens; easiest first run. |
| `/?case=local` | Fake case adapter in the Vite development world; the intro still needs public story content from the API. |
| `/?demo=1` | Title menu with a separate **Highlights tour**; not a connected multiplayer session. |

For the full title/world/intro, start the API in another terminal from the repository root, then use the frontend's `/` address. This optional local/demo command uses recorded outside data:

```bash
cd backend
uv sync --frozen
```

Then start the API with `APP_ENV=local DEMO_MODE=true uv run --frozen uvicorn main:app --host 127.0.0.1 --port 8000` in Bash/macOS/Linux. In PowerShell, set `$env:APP_ENV='local'` and `$env:DEMO_MODE='true'` first, then run the `uv run` part. Vite already forwards `/api` to port 8000. The readiness check is `http://127.0.0.1:8000/api/health`, which must return `status: "ok"`. More commands are in [ENGINEERING.md](../ENGINEERING.md#3-commands).

If port 5173 is busy, stop only your own earlier dev server or pick another port and use its printed address. If Node is incompatible, install a supported version rather than changing package requirements or the lockfile. If installation fails, keep the error for your agent; never disable TLS verification or paste secrets into chat.

## Minutes 20–30: branch and change only your credits row

Open a second terminal at the repository root. Replace `yourname` below with your own short identifier:

```bash
git fetch origin main
git switch -c feat/yourname-first-change origin/main
git status --short
```

Open `frontend/src/shell/team.js`. Its `teamMembers` array contains four display-name strings: Nils's entry and three `Teammate name pending` placeholders. Replace **one unused placeholder with your own name**, preserving the other entries and their order. Inspect the latest main before opening your PR so you do not overwrite a slot another teammate has just filled. Do not fill anybody else's entry or add student numbers; the file explicitly excludes them.

From the title menu, open **Settings → Credits** and verify your name and the unchanged neighbouring entries. This is your first small change; leave the credits renderer and all other rows alone.

## Minutes 30–45: verify and commit

For a credits/frontend change, from the repository root:

```bash
(cd frontend && npm test)
(cd frontend && npm run build)
git diff --check
git diff
git status --short
```

Tests and build must pass. The build also runs the spoiler guard. Manually check Credits and the unchanged neighbouring rows. Review for credentials, personal data and unrelated files; stage individual intended files, never a real `.env`, dependencies, captures or generated `dist/` output.

Once you have changed and verified your own credits row:

```bash
git add frontend/src/shell/team.js
git diff --cached
git commit -m "docs: add my own credits entry"
git push -u origin HEAD
```

Run these on your own task branch, never on `main`. For Python changes later, run the affected tests and `(cd backend && uv run --frozen ruff check .)`, then the checks required for that package. Coordinate the complete backend gate with the integrator rather than repeatedly running thousands of unrelated tests for a tiny change. A docs-only change needs link/content checks, not an invented passing app test.

## Minutes 45–60: PR, human review, merge

For **your own contribution**, open a PR from your task branch into `main` using the [PR template](../../.github/pull_request_template.md). Describe the problem, your change, exact check results and limits. Name yourself as the responsible teammate and disclose agent assistance. A tiny documentation task can be defined in the PR; for a feature, agree its goal/scope and use the issue/spec workflow in CONTRIBUTING before implementation.

Ask a **different human teammate** to review the current diff. Address their comments, refresh from `origin/main` if necessary, and rerun checks affected by changes. Merge with a **merge commit** only after current human approval, passing configured checks and resolved conversations. Do not force-push or bypass review. If nobody can review within the hour, leave the PR ready for review; do not merge just to meet the clock.

**D001 applies to teammates' own PRs.** D015 separately authorizes the Claude/Codex package-integration workflow; it does not give your personal contribution an exemption from human peer review. No particular lead is the mandatory reviewer.

Next, choose one bounded idea from [IDEAS.md](IDEAS.md), or propose your own, and prepare [your explain-back](EXPLAIN-YOUR-CODE.md). Make real decisions, understand every submitted line, and keep your own commits and review evidence. An attribution row alone does not demonstrate that you wrote and understand game code.

**Source note:** G7/G8 supplied the credits file. Its schema and Settings → Credits path were checked on `origin/feat/g8-islet-harbor-demo` at `ea89e35` and again on `origin/main` at `60f7fd0` on 6 November 2026; see the [audited team file](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/60f7fd0b89fcbaad346b05ac365b1386aa6c0f8d/frontend/src/shell/team.js). The file is now on main. G28 supplies the instructions and does not fill anyone's row.
