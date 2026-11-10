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
| **The plan to the deadline (Mon 23 Nov, 23:59) and the task board** | [Final roadmap](docs/FINAL-ROADMAP.md) |
| **A ready prompt for your coding agent** | [Agent prompt](docs/contribute/AGENT-PROMPT.md) |
| Branches, features, reviews and handovers | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Instructions for coding agents | [AGENTS.md](AGENTS.md) |
| Shared technical and product decisions | [Decision log](docs/DECISIONS.md) |
| What we build, in which order, and the lanes | [ROADMAP.md](ROADMAP.md) |
| What works right now, next steps per lane and the log | [Status](docs/STATUS.md) |
| Player controls, crews and spoiler-free guidance | [How to play](docs/HOW-TO-PLAY.md) |
| Player data, deletion and play money | [Privacy](docs/PRIVACY.md) |
| Your own first contribution and explain-back | [Teammate starter kit](docs/contribute/QUICKSTART.md) |
| The story and its approved decisions | [Story](docs/STORY.md) |
| One-time setup of GitHub, Supabase and Vercel | [Setup guide](docs/SETUP.md) |
| How the game, the API and the database fit together | [Architecture](docs/ARCHITECTURE.md) |
| Shared contracts: API routes, browser events, tables, wallet reasons, feature flags | [Interfaces](docs/INTERFACES.md) |
| Commands to install, run and test, and how we write code | [How we write code, section 3](docs/ENGINEERING.md#3-commands) |

**Spoiler warning.** The solution of the case is in this repository, labelled: [docs/STORY.md](docs/STORY.md), [docs/story/](docs/story/README.md), decision D013 in the [decision log](docs/DECISIONS.md) and `backend/content/secret/`. To solve the case yourself, play it before you open them. In the game, the culprit's name reaches only crews that solved the case.

## Project status

*Last updated: 8 Nov 2026, Codex player-experience integration.*

The team is turning the text mystery Plot Twist into a browser game: a detailed top-down island world with GitHub sign-in, a shared mystery and a play-money economy.

- **Live:** [the-great-plot-twist.vercel.app](https://the-great-plot-twist.vercel.app/) runs Lighthouse Isle in original pixel art (decision D005) from `frontend/`, with the Python API from `backend/` behind it (`/api/health`).
- **Visual redesign:** detailed title/island art, compact replacing story passages, full-screen rooms,
  a quiet HUD with optional controls, smoother motion and stable visual light challenges. See the
  [redesign evidence](docs/handoff/visual-redesign-release.md).
- **Built:** the playable intro, sea chart and harbor, original music/ambience/effects, weather,
  account/save and crew services, live presence, Exchange v2, predictions and Lantern Duels.
  The case backend includes earned clues, the shared board, three-light finale, Relighting and
  free NPC orders, with solo and four-player API playthroughs over real scratch PostgreSQL.
- **Online browser adapter:** G9 account, cloud-save, crew, presence and case connections are integrated.
  The latest release also adds phone tap-to-walk, clearer guidance and polished inspection/settings screens.
  **3,719 frontend tests pass**; [release evidence](docs/handoff/player-experience-visual-pass.md) separates
  recorded browser proofs from live private-account and physical-device checks.
- **Current release:** festival and host tools deployed; sports is enabled with a verified live football-data.org
  feed. Account and crew entry use the G9 browser adapter. Reliability, regression coverage,
  help/privacy, security/notices and submission materials are deployed with passing release gates.
  The [roadmap](ROADMAP.md#execution-update--6-nov-2026) gives the remaining order.
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
