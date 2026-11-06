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

*Last updated: 6 Nov 2026, Codex server integration.*

The team is turning the text mystery Plot Twist into a browser game: a top-down pixel-art island world with GitHub sign-in, a shared mystery and a play-money economy.

- **Live:** [the-great-plot-twist.vercel.app](https://the-great-plot-twist.vercel.app/) runs Lighthouse Isle in original pixel art (decision D005) from `frontend/`, with the Python API from `backend/` behind it (`/api/health`).
- **Built:** the playable intro, sea chart and harbor, original music/ambience/effects, weather,
  account/save and crew services, live presence, Exchange v2, predictions and Lantern Duels.
  The case backend includes earned clues, the shared board, three-light finale, Relighting and
  free NPC orders, with solo and four-player API playthroughs over real scratch PostgreSQL.
- **Online play is still being connected:** the G9 browser adapter is paused until Nils' laptop
  returns. Backend multiplayer proofs do not mean the complete mystery is already playable in
  normal browser play. [Status](docs/STATUS.md) records exact releases and flag checks.
- **Current release:** reviewed festival, host console and sports, with their database chain applied.
  Reliability, accessibility, help/privacy and submission checks follow; sports activation waits for
  its provider key and verified live source.
  The optional [spoiler-safe AI helper](specs/AI-helper.md) requires official ChatGPT website-client
  approval before its login can be activated. The [roadmap](ROADMAP.md#execution-update--6-nov-2026)
  gives the remaining order.
- **Local development:** the [disposable local API](docs/LOCAL-TEST-SERVER.md) runs the current API against a fresh PostgreSQL database, with four fixture captains and no Supabase credentials.

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
