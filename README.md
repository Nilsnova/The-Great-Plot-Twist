# The Great Plot Twist

A browser mystery set among original pixel-art islands, built for Nova SBE's Introduction to Programming group project. Explore on foot, sail using the sea chart, play a text-adventure introduction, and follow a highlights tour. The Python API contains account, crew and play-money rules; the browser presents the world. This README describes implemented code rather than promising every planned feature is playable.

**Live game:** <https://the-great-plot-twist.vercel.app/>. A deployment can lag behind the repository: follow the [release checks](docs/RELEASE-CHECKLIST.md) before presenting or submitting it.

**Spoiler warning:** this public repository contains the case solution. Play first; open the labelled [story index](docs/story/README.md) only when you want to read it. No solution is printed here.

## What you can play

- Walk around Lighthouse Isle and the other open destinations, interact with hotspots, and sail from the keyboard-accessible sea chart. A further destination has an unlock gate.
- Start the introduction with **New game**; **Continue** replays this browser's saved introduction actions. That local journal is different from a cloud save.
- Change visual quality, sound and accessibility preferences; use keyboard, touch controls or a connected gamepad.
- Open `?demo=1` for the explicit, memory-only **Highlights tour**. It uses recorded intro/weather data and makes no game-state writes. For class, follow the [presenter script](docs/PRESENTER-SCRIPT.md) and stop at the schooner.
- Inspect the art and UI workshops at `/asset-library.html` and `/ui-kit.html`.

Weather is connected to the API with recorded fallback data. Account/crew/referee and Exchange routes exist in Python, but the main game does **not** yet connect its case screens to an authoritative online adapter. Prediction desk, duels and the islet building economy are not complete playable systems. The [lane pages](docs/lanes/README.md) distinguish working code, presentation hooks and remaining integration.

## Run locally, without secrets

Prerequisites: Git, Node matching `frontend/package.json` (`^22.12.0`, `^24.0.0` or `>=26`), and [uv](https://docs.astral.sh/uv/). Python is pinned to 3.12 in `backend/.python-version`; uv manages the environment. These Bash commands begin at the repository root.

```bash
git clone https://github.com/Nilsnova/The-Great-Plot-Twist.git
cd The-Great-Plot-Twist
# Preserve any private settings that already exist.
test -e .env || cp .env.example .env
(cd backend && uv sync --locked)
(cd frontend && npm ci)
```

Start the API in one terminal, from the repository root:

```bash
cd backend
APP_ENV=local DEMO_MODE=true FEATURE_FLAGS='' uv run --locked --env-file ../.env uvicorn main:app --host 127.0.0.1 --port 8000
```

In another terminal, again from the repository root:

```bash
cd frontend
npm run dev -- --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/`. Vite forwards `/api` to port 8000. Empty settings are sufficient; demo mode uses recorded outside data. Open `http://127.0.0.1:5173/?demo=1` for the self-contained tour. For developers, `http://127.0.0.1:5173/?case=local` selects a memory-only case adapter in development. The separate `/case-lab.html?demo=1` workshop also rehearses case screens. Neither grants real balances, crews or progress; both can show later story stages and must stay out of the class demo.

For hosted sign-in and database work, follow [SETUP.md](docs/SETUP.md). Vite currently reads frontend-local env files, not the root `.env`; the Python command above reads the root file explicitly. Never put server credentials in browser configuration. No hosted credentials are needed for this local workflow.

## Test and build

```bash
(cd backend && uv run --locked pytest -q)
(cd backend && uv run --locked ruff check .)
(cd frontend && npm test)
(cd frontend && npm run build)
```

The build includes the spoiler guard. A fresh checkout check runs these from lock files:

```bash
bash scripts/fresh-clone-check.sh
```

For the production WebGL smoke check, install Chrome/Chromium and set its executable (Linux example):

```bash
cd frontend
CHROME_PATH=/usr/bin/chromium CAPTURE_PREFIX=Release-Smoke npm run test:production
```

Browser checks use the installed browser, not a download. Run GPU checks sequentially; use a new capture prefix each time and preserve historical evidence. [ENGINEERING.md](docs/ENGINEERING.md) documents further checks.

## Architecture in eight lines

1. `frontend/src/main.js` starts the title and loads the game on demand.
2. Three.js renders the original pixel world; HTML supplies readable controls and dialogue.
3. Pure JavaScript modules hold testable input, presentation and intro rules.
4. Vite proxies local `/api` calls to the Python service.
5. `backend/main.py` creates the FastAPI app from `backend/server/`.
6. Python validates identity, crew intents, account changes and play-money transactions.
7. Supabase provides hosted Auth/Postgres, constrained functions, grants and row-level security.
8. `vercel.json` routes one deployed address to the static client and the Python API.

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and [INTERFACES.md](docs/INTERFACES.md) for contracts. D003 makes the server authoritative: a browser view or local fake cannot award money or shared progress.

## Team and explain-back

Four equal teammates work with coding agents, small branches and documented checks. Under **D015**, agent-built packages reach Claude's merge gates only after tests, style, build, a secret scan and an independent agent review. Database changes also require the specified additional review and live-database check. Nils reviews at the end or ad hoc; teammates' own PRs keep peer review. See [the decision log](docs/DECISIONS.md), [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md); D015 records the later exception for agent-built work.

**Credits status:** `frontend/src/shell/team.js` is absent on the audited main. The actual Credits view in `frontend/src/shell/screens.js` still contains four name placeholders. Nils is named in the existing project decisions; the complete teammate list must be confirmed from the future team module or existing approved docs before submission. No identities have been invented here.

For Thu 19 and Sat 21 November 2026, use the [explain-back cards](docs/drills/README.md). The [presenter script](docs/PRESENTER-SCRIPT.md) includes timing, a name-check inventory and fallbacks. The [release checklist](docs/RELEASE-CHECKLIST.md) covers the Mon 23 November hand-in.

## Assets and licences

[ASSETS.md](frontend/ASSETS.md) is the source register. Sprites, backgrounds, procedural graphics and synthesized audio are original code-authored work; no third-party game-art pack, external font or sound recording is shipped. The register does not grant a separate blanket open-source licence to original project assets. Preserve authorship and notices; do not infer redistribution rights from the repository being public. Retired studies are separate from the active build.

Weather data is credited to Open-Meteo, adapted for the game, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Three.js, Vite and Vitest use MIT; Playwright Core uses Apache-2.0; Pillow, used for art generation, uses HPND. Installed packages carry their notices. See the register for sources, adaptations and regeneration commands.
