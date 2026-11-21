# The Great Plot Twist

Plot Twist game expansion for Nova SBE’s Introduction to Programming group project.

**Live:** [the-great-plot-twist.vercel.app](https://the-great-plot-twist.vercel.app/)

## Run and test

Requirements: Node.js 22+ with npm, Python 3.12+ with [uv](https://docs.astral.sh/uv/). Run every line from the repository root.

```bash
# Install
(cd frontend && npm install)
(cd backend && uv sync)

# Run the game on your laptop (offline: an in-memory island and waves, no account needed)
(cd frontend && npm run dev)
# then open the address Vite prints, adding ?islands=fake

# Run the API on your laptop (optional; copy .env.example to .env in the repository root and fill in the Supabase values)
(cd backend && uv run --env-file ../.env uvicorn main:app --reload --port 8000)

# Tests
(cd frontend && npm test && npm run build)    # game: unit tests and production build
(cd backend && uv run ruff check . && uv run pytest -q)   # API: style check and tests (about 10 minutes)
```

A quicker backend run skips the exhaustive settings matrix (about 5 of the 10 minutes): `cd backend && uv run pytest -q --ignore=server/tests/correctness/test_settings_contract.py`. Browser checks such as the two-player journey (`npm run test:mp`) need an installed Chrome. More commands: [ENGINEERING.md, section 3](docs/ENGINEERING.md#3-commands).

## Members

| Member | Student number |
|---|---|
| Nils Christoph Lenke | 81651 |
| Ianno Miranda Hollensteiner | 81858 |
| Johannes Franz Lang | 83476 |
| Nicolas Radomski | 80028 |

## Start here

We are four equal teammates building with coding agents. Everyone can propose features, contribute code, review and merge changes under the same rules.

1. Read [how we collaborate](CONTRIBUTING.md).
2. Give your coding agent [AGENTS.md](AGENTS.md).
3. Pick a small task, create a branch and open a pull request.
4. Test it, get another teammate’s approval and merge.

| Need | Go to |
|---|---|
| **Every document, sorted into current and history** | [Docs index](docs/README.md) |
| **What the game is now (product direction, 10 Nov)** | [Pitch](docs/PITCH.md) |
| **Who builds what this week (lanes, contracts, tasks)** | [Build plan](docs/BUILD-PLAN.md) |
| **The plan to the deadline (Mon 23 Nov, 23:59) and the task board** | [Final roadmap](docs/FINAL-ROADMAP.md) |
| **A ready prompt for your coding agent** | [Agent prompt](docs/contribute/AGENT-PROMPT.md) |
| **Answering the walkthrough questions: how each part is built, why, its limits** | [Walkthrough](docs/WALKTHROUGH.md) |
| **What the tests cover and what they do not** | [Test map](docs/TEST-MAP.md) |
| Branches, features, reviews and handovers | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Instructions for coding agents | [AGENTS.md](AGENTS.md) |
| Shared technical and product decisions | [Decision log](docs/DECISIONS.md) |
| What works right now, next steps per lane and the log | [Status](docs/STATUS.md) |
| Your island, the waves, the Harbor, Pirate Point and the controls | [How to play](docs/HOW-TO-PLAY.md) |
| Player data, deletion and play money | [Privacy](docs/PRIVACY.md) |
| Your own first contribution and explain-back | [Teammate starter kit](docs/contribute/QUICKSTART.md) |
| The story and its approved decisions | [Story](docs/STORY.md) |
| One-time setup of GitHub, Supabase and Vercel | [Setup guide](docs/SETUP.md) |
| How the game, the API and the database fit together | [Architecture](docs/ARCHITECTURE.md) |
| Shared contracts: API routes, browser events, tables, wallet reasons, feature flags | [Interfaces](docs/INTERFACES.md) |
| Commands to install, run and test, and how we write code | [How we write code, section 3](docs/ENGINEERING.md#3-commands) |

**Spoiler warning.** The solution of the case is in this repository, labelled: [docs/STORY.md](docs/STORY.md), [docs/story/](docs/story/README.md), decision D013 in the [decision log](docs/DECISIONS.md) and `backend/content/secret/`. To solve the case yourself, play it before you open them. In the game, the culprit's name reaches only crews that solved the case.

## Repository map

`frontend/` is the browser game (plain JavaScript and Vite: `src/` code, `public/` assets, `tests/` Vitest suites, `scripts/` build helpers and browser checks). `backend/` is the Python API (FastAPI in `server/`, game data in `content/`, developer tools in `tools/`), deployed with the frontend by `vercel.json`. `supabase/migrations/` holds the database schema in order. `docs/` holds the team and project documents linked above, with `docs/evidence/` and `docs/handoff/` keeping screenshots and handovers that current specs link to. `specs/` holds one implementation spec per feature package (T29–T47 for the current sprint). `scripts/` holds repository-wide tools: the live smoke test, the secret and text checks, the dependency audit, the local dev server and the voice-line generator. `CLAUDE.md`, `GEMINI.md` and `.github/copilot-instructions.md` are tool entry files that only point to [AGENTS.md](AGENTS.md).

## Project status

*Last updated: Wed 18 Nov 2026.*

- A multiplayer pixel-art tower defense in the browser: build and upgrade towers, walls, crew and your captain on your own island; hold pirate waves up to 100 with boss warships ([TOWER-DEFENSE.md](docs/TOWER-DEFENSE.md)).
- Up to four players defend one island via a `?visit=ISLE-…` link; every browser runs the same seeded simulation ([walkthrough, part 12](docs/WALKTHROUGH.md#12-how-four-players-see-the-same-battle)).
- Pirate Point: the class joins from the projector QR, builds together and lights three lamps to sink the flagship.
- The Harbor: up-or-down market calls, a football match board, a weather board and duels; play money only, no prediction market (D035).
- Live on `main` since 11 Nov evening; known small issues in [OPEN-TODOS.md, section 7](docs/OPEN-TODOS.md).
