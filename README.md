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
| One-time setup of GitHub, Supabase and Vercel | [Setup guide](docs/SETUP.md) |
| How the game, the API and the database fit together | [Architecture](docs/ARCHITECTURE.md) |
| Shared contracts: API routes, browser events, tables, wallet reasons, feature flags | [Interfaces](docs/INTERFACES.md) |
| Commands to install, run and test, and how we write code | [How we write code, section 3](docs/ENGINEERING.md#3-commands) |

## Project status

*Last updated: 5 Nov 2026.*

The team is turning the text mystery Plot Twist into a browser game: a top-down island world with GitHub sign-in, a shared mystery and a play-money economy.

- **Foundation (package F0): a skeleton, not a game.** It is built on the branch `chore/foundation`: the Python API in `backend/` (health, config and keep-alive routes, the sign-in check, the wallet rules and the pattern for outside data), the first database migration in `supabase/`, `vercel.json` and the docs in `docs/`. No game feature uses it yet.
- **The game: merged into `main`.** The browser game from the graphics package (G1) is merged into `main`, in `frontend/`. Its art style is decision D005. A branch needs `main` merged in to have `frontend/`.
- **Not proven on the real services yet.** The migration is applied by hand ([supabase/README.md](supabase/README.md)), and the hosted version counts as working only when the checks in [docs/SETUP.md](docs/SETUP.md), Step 5, pass. Until then, do not treat the skeleton as a working app.

### What the final README must contain

By the submission on Mon 23 Nov, this README must give the exact installation, run and test commands, the deployed URL, and every member’s name and student number. Fill in the placeholders below then, with real values only.

- **Deployed URL:** `<added after the deploy checks pass>`
- **Commands:** today in [docs/ENGINEERING.md, section 3](docs/ENGINEERING.md#3-commands). Copy the final ones here.

| Member | Student number |
|---|---|
| `<name>` | `<student number>` |
| `<name>` | `<student number>` |
| `<name>` | `<student number>` |
| `<name>` | `<student number>` |
