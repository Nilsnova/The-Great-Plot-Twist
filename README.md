# The Great Plot Twist

Plot Twist game expansion for Nova SBE’s Introduction to Programming group project.

## Start here

We are four equal teammates building with coding agents. Everyone can propose features, contribute code, review and merge changes under the same rules.

1. Read [how we collaborate](CONTRIBUTING.md).
2. Give your coding agent [AGENTS.md](AGENTS.md).
3. Pick a small task, create a branch and open a pull request.
4. Test it, get another teammate’s approval and merge.

| Need | Go to |
|---|---|
| Branches, features, reviews and handovers | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Instructions for coding agents | [AGENTS.md](AGENTS.md) |
| Shared technical and product decisions | [Decision log](docs/DECISIONS.md) |
| What we build, in which order, and the lanes | [ROADMAP.md](ROADMAP.md) |
| What works right now, next steps per lane and the log | [Status](docs/STATUS.md) |
| The story and its approved decisions | [Story](docs/STORY.md) |
| One-time setup of GitHub, Supabase and Vercel | [Setup guide](docs/SETUP.md) |
| How the game, the API and the database fit together | [Architecture](docs/ARCHITECTURE.md) |
| Shared contracts: API routes, browser events, tables, wallet reasons, feature flags | [Interfaces](docs/INTERFACES.md) |
| Commands to install, run and test, and how we write code | [How we write code, section 3](docs/ENGINEERING.md#3-commands) |

**Spoiler warning.** The solution of the case is in this repository, labelled: [docs/STORY.md](docs/STORY.md), [docs/story/](docs/story/README.md), decision D013 in the [decision log](docs/DECISIONS.md) and `backend/content/secret/`. To solve the case yourself, play it before you open them. In the game, the culprit's name reaches only crews that solved the case.

## Project status

*Last updated: 6 Nov 2026, G10 cloud checkpoint.*

The team is turning the text mystery Plot Twist into a browser game: a top-down pixel-art island world with GitHub sign-in, a shared mystery and a play-money economy.

- **Live:** [the-great-plot-twist.vercel.app](https://the-great-plot-twist.vercel.app/) runs Lighthouse Isle in original pixel art (decision D005) from `frontend/`, with the Python API from `backend/` behind it (`/api/health`).
- **Foundation (package F0) is on `main`:** the API skeleton (health, config and keep-alive routes, the sign-in check, the wallet rules, the pattern for outside data), the first database migration in `supabase/`, `vercel.json` and the docs in `docs/`. Group 1 adds account, referee and crew features on that foundation.
- **On main:** group 1 includes the story round, account/referee work and crews. G5/G6 browser screens are also present.
- **In progress:** G9 connects the browser. Case backend Phase 1 is ready on `feat/case-backend`; its labelled spec is [specs/case-backend.md](specs/case-backend.md) and the cloud inputs and checkpoints are in [docs/handoff/](docs/handoff/). Group 3 and case Phase 2 wait for group 2 and the L2 migration on `origin/main`. The [disposable local API](docs/LOCAL-TEST-SERVER.md) starts from `backend/` with `LOCAL_TEST_SERVER=1 APP_ENV=local uv run --with pgserver --with 'psycopg[binary]' python -m tools.local_server`.

### What the final README must contain

By the submission on Mon 23 Nov, this README must give the exact installation, run and test commands, the deployed URL, and every member's name and student number. Fill in the placeholders below then, with real values only.

- **Deployed URL:** [the-great-plot-twist.vercel.app](https://the-great-plot-twist.vercel.app/) (confirm before submission)
- **Commands:** today in [docs/ENGINEERING.md, section 3](docs/ENGINEERING.md#3-commands). Copy the final ones here.

| Member | Student number |
|---|---|
| `<name>` | `<student number>` |
| `<name>` | `<student number>` |
| `<name>` | `<student number>` |
| `<name>` | `<student number>` |
