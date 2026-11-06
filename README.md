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
- **On main:** the foundation, story/account/referee/crew work, open-world weather and bulletin, presence, home islets and group 3 (Exchange v2, prediction desk and Lantern Duels). Claude's group 3 release checkpoint is `c12a707`; production settings and migration application remain Claude's responsibility.
- **Built for review:** all four minimum case backend phases on `feat/case-backend`, including the board, three-light finale, relighting and NPC partners. The labelled [specification](specs/case-backend.md) and [G10 checkpoints](docs/handoff/) describe contracts, scratch SQL evidence and remaining deployment checks. The `case` flag stays off and `RELIGHT_OPEN` stays unset until Claude activates them.
- **Browser integration:** G9 connects the screens to the real API. The [disposable local API](docs/LOCAL-TEST-SERVER.md) runs the actual backend and full SQL chain with four fixed test players and no live credentials. Start it from `backend/` with `LOCAL_TEST_SERVER=1 APP_ENV=local uv run --with pgserver --with 'psycopg[binary]' python -m tools.local_server`.

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
