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
| **What the game is now (product direction, 10 Nov)** | [Pitch](docs/PITCH.md) |
| **Who builds what this week (lanes, contracts, tasks)** | [Build plan](docs/BUILD-PLAN.md) |
| **The plan to the deadline (Mon 23 Nov, 23:59) and the task board** | [Final roadmap](docs/FINAL-ROADMAP.md) |
| **A ready prompt for your coding agent** | [Agent prompt](docs/contribute/AGENT-PROMPT.md) |
| **Answering the walkthrough questions: how each part is built, why, its limits** | [Walkthrough](docs/WALKTHROUGH.md) |
| **What the tests cover and what they do not** | [Test map](docs/TEST-MAP.md) |
| Branches, features, reviews and handovers | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Instructions for coding agents | [AGENTS.md](AGENTS.md) |
| Shared technical and product decisions | [Decision log](docs/DECISIONS.md) |
| What we build, in which order, and the lanes | [ROADMAP.md](ROADMAP.md) |
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

## Project status

*Last updated: Wed 11 Nov 2026.*

The game is a pixel pirate game for the browser ([PITCH.md](docs/PITCH.md)). Every player builds and
defends their own island, everyone trades at the shared Harbor, and the class fights one joint battle at
Pirate Point. Who builds what is in the [build plan](docs/BUILD-PLAN.md); how to play is in
[HOW-TO-PLAY.md](docs/HOW-TO-PLAY.md).

- **Your island:** build walls, cannons, a watchtower and houses with 🪙, ring the bell, and survive
  pirate waves for loot. Cannons fire on their own; you can man one or repair a wall. Friends visit with
  your island code (`ISLE-…`) or its QR and fight the same wave with you.
- **The Harbor:** a market stall (up or down in 1 hour on a real price), a match board (real football),
  a weather board (the real weather and what it does to the pirates) and the duel ring; the market and
  the match board take stakes of 🪙 5, 10 or 25. There is no prediction market in the game (D035).
- **Pirate Point:** the shared lighthouse island. Anyone rings its bell; everyone there fights the
  armada, and three captains light the three lamps to sink the flagship. In class, phones join with the
  class code (`HARBOR-…`) from the projector QR and land there.
- **Done on the integration branch:** every lane task of the build plan and the voiced pirate intro.
  **Still open:** the market calls migration on the live database, the release and the live checks.
- **Live:** [the-great-plot-twist.vercel.app](https://the-great-plot-twist.vercel.app/) still runs the
  9 Nov class demo until the release, with the Python API from `backend/` behind it (`/api/health`).
- **Removed on 10 Nov:** the 2-hour mystery (D031): the prologue, every case screen, the journal and
  hints, the festival, the bulletin, the rewards page, the arena gate and Gull's Rest. The backend case
  code is still there for a later cleanup; the browser no longer calls it and the `case` flag is off.
- **Local development:** the [disposable local API](docs/LOCAL-TEST-SERVER.md) runs the current API
  against a fresh PostgreSQL database, with four fixture captains and no Supabase credentials. In a dev
  build, `?islands=fake` runs the island, the waves and Pirate Point against an in-memory fake.

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
