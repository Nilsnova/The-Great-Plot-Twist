# The docs folder: what to read, and what is history

> **What this file is:** the index of `docs/`. The project changed direction on 10 Nov 2026 (decision
> [D031](DECISIONS.md)): the two-hour mystery became a pirate tower-defense game. Many files here were
> written before that. This page sorts every file into "current" and "history", so nobody reads an
> old plan as today's rules.
>
> **Who uses it:** anyone new to the repository, and the staff during the walkthrough.

## Start here

| File | What it gives you |
|---|---|
| [../README.md](../README.md) | What the game is, the live address, the members, how to install, run and test. |
| [HOW-TO-PLAY.md](HOW-TO-PLAY.md) | The player's guide: the loop, the controls, what opens after which wave. |
| [WALKTHROUGH.md](WALKTHROUGH.md) | How each part is built, why, its limits and its tests. The sheet for the walkthrough questions. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The big picture on one page: browser, server, database, who may do what, where secrets live. |
| [TEST-MAP.md](TEST-MAP.md) | Per area: which tests cover it, the command, and what no test covers. |
| [OUTAGES.md](OUTAGES.md) | What happens when a key is missing, a provider is down or the connection drops, with the test for each case. |

## The game as it is now

| File | What it gives you |
|---|---|
| [PITCH.md](PITCH.md) | The product direction since 10 Nov: build, trade, fight the pirates together. |
| [GAME-V3.md](GAME-V3.md) | The binding contract of version 3: one island per game, the campaign by wave, the narrator. |
| [TOWER-DEFENSE.md](TOWER-DEFENSE.md) | The tower-defense rules: spots, towers, crew, captain, waves to 100. Valid where GAME-V3 does not change it. |
| [INTERFACES.md](INTERFACES.md) | Every API route, browser event and database table, with examples. |
| [ECONOMY.md](ECONOMY.md), [economy/](economy/) | The play-money economy: balance tests, the shared-island transactions and their acceptance record. |
| [DATA-INVENTORY.md](DATA-INVENTORY.md), [PRIVACY.md](PRIVACY.md) | What the game stores, sends and logs, and the notice for players. |
| [design/reference-village/](design/reference-village/) | The visual reference for the village look. |

## How we work

| File | What it gives you |
|---|---|
| [../AGENTS.md](../AGENTS.md), [../CONTRIBUTING.md](../CONTRIBUTING.md) | The rules for people and coding agents: one branch per task, a pull request, a human review. |
| [ENGINEERING.md](ENGINEERING.md) | The engineering rulebook: principles, folder map, commands, recipes, testing rules. |
| [DECISIONS.md](DECISIONS.md) | Every shared decision with its reason, D001 onwards. Later entries supersede earlier ones. |
| [STATUS.md](STATUS.md) | What works now, and the dated log of who did what (newest first). |
| [OPEN-TODOS.md](OPEN-TODOS.md) | The one checklist of what is still open. |
| [FINAL-ROADMAP.md](FINAL-ROADMAP.md) | The plan for the last two weeks, ranked by what moves the grade. |
| [SIMPLIFICATION-PLAN.md](SIMPLIFICATION-PLAN.md) | The measured list of clean-ups: what was removed, what waits, and why the switched-off features stay for now. |
| [contribute/](contribute/) | Quick start for a new contributor, the agent prompt, and how to explain your own code. |
| [evidence/](evidence/) | The screenshots and records that pull requests point to. A record, not code. |
| [tests/](tests/) | One test that keeps DATA-INVENTORY.md in step with the migrations. |

## Running, releasing and staying safe

| File | What it gives you |
|---|---|
| [SETUP.md](SETUP.md) | The one-time setup of GitHub, Supabase and Vercel (owner only). |
| [DEVELOPING.md](DEVELOPING.md), [LOCAL-TEST-SERVER.md](LOCAL-TEST-SERVER.md) | Running the game on your own computer with throw-away data. |
| [RUNBOOK.md](RUNBOOK.md) | What to do when something is down or slow during the demo. |
| [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) | The checks before a release and before the submission. |
| [PRESENTER-SCRIPT.md](PRESENTER-SCRIPT.md), [HOST-CONSOLE.md](HOST-CONSOLE.md) | The class demo and the host's page (`/host.html`). |
| [SECURITY.md](SECURITY.md), [THREAT-MODEL.md](THREAT-MODEL.md) | How to report a problem, and the reviewed risks. |
| [LICENSES-THIRD-PARTY.md](LICENSES-THIRD-PARTY.md) | The licences of everything we did not write ourselves. |

## History: kept for the record, not today's rules

These files describe the game before 10 Nov or a finished piece of work. They stay because decisions and
pull requests link to them. If one of them disagrees with a file above, the file above is right.

| File | What it was |
|---|---|
| [STORY.md](STORY.md), [story/](story/) | The mystery story of the first version (retired by D031). Its backend code is switched off, not deleted; see SIMPLIFICATION-PLAN.md. |
| [UX-SIMPLIFICATION.md](UX-SIMPLIFICATION.md) | The 6 Nov plan to make the first version simpler. |
| [UX-AUDIT.md](UX-AUDIT.md) | The 10 Nov audit of the old game that led to the new direction. |
| [BUILD-PLAN.md](BUILD-PLAN.md) | How the new game was built in four lanes up to the feature freeze of 19 Nov. |
| [SPRINT-T29-T47-GUIDE.md](SPRINT-T29-T47-GUIDE.md) | A reading guide to the 14 Nov sprint (walls, targeting, pathing). Still useful for the walkthrough of those parts. |
| [B3-FEEDBACK-AUDIT.md](B3-FEEDBACK-AUDIT.md) | The audit of connection and error feedback (task B3). |
| [handoff/](handoff/) | Notes and one-paste SQL files handed to the owner for single tasks. Each is finished once applied. |

## Where the old mystery still shows in the code

The mystery's server code (`backend/server/game/case_*`, `crews/`, `festival/`, `predictions/`, `daily/`)
is **switched off by feature flags**, not removed. It stays until after the submission because parts of the
live game still use pieces of it (guest admission reads the story engine, the market reads one of its
states, the host console reads crew rows) and because applied database migrations are never edited
([ENGINEERING.md](ENGINEERING.md)). The exact list of what is off, what is still used and what could go
first is in [SIMPLIFICATION-PLAN.md](SIMPLIFICATION-PLAN.md).
