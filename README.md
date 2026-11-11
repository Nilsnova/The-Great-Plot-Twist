# The Great Plot Twist

Plot Twist game expansion for Nova SBE’s Introduction to Programming group project.

**Live:** [the-great-plot-twist.vercel.app](https://the-great-plot-twist.vercel.app/)

## Run and test

```bash
# Backend (Python API)
cd backend && uv sync && uv run pytest -q

# Frontend (the game)
cd frontend && npm install && npm test && npm run build && npm run test:mp
```

`npm run test:mp` drives an installed Chrome. Run locally: `cd frontend && npm run dev` (with `?islands=fake` for an in-memory island and waves). Details: [ENGINEERING.md, section 3](docs/ENGINEERING.md#3-commands).

## Members

Each member fills in their own line (by Fri 20 Nov).

| Member | Student number |
|---|---|
| `<name>` | `<student number>` |
| `<name>` | `<student number>` |
| `<name>` | `<student number>` |
| `<name>` | `<student number>` |

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

- A multiplayer pixel-art tower defense in the browser: build and upgrade towers, walls, crew and your captain on your own island; hold pirate waves up to 100 with boss warships ([TOWER-DEFENSE.md](docs/TOWER-DEFENSE.md)).
- Up to four players defend one island via a `?visit=ISLE-…` link; every browser runs the same seeded simulation ([walkthrough, part 12](docs/WALKTHROUGH.md#12-how-four-players-see-the-same-battle)).
- Pirate Point: the class joins from the projector QR, builds together and lights three lamps to sink the flagship.
- The Harbor: up-or-down market calls, a football match board, a weather board and duels; play money only, no prediction market (D035).
- Live on `main` since 11 Nov evening; known small issues in [OPEN-TODOS.md, section 7](docs/OPEN-TODOS.md).

### What the final README must contain

By the submission on Mon 23 Nov: the exact install, run and test commands, the deployed URL (both at the top) and every member's name and student number in the [members table](#members), with real values only.
