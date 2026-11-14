# T28 Learn boss minigames with optional first-time practice

> **What this is:** clearer instructions and optional practice before a player's first scored boss minigame on an island.
>
> **Who uses it:** players, Ianno and the teammate reviewing this contribution.

- **Status:** in progress; gameplay verification and human review pending
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`)
- **Agent assistance:** Codex; Ianno remains responsible for explaining the change.
- **Branch:** `docs/t28-minigame-introduction` (implementation added after Ianno expanded the scope)

## Scope

Cover Haul the chain, Aim the great cannon and Board and duel, including those
tasks inside Redtide's combination. Explain the goal, keyboard and touch controls,
and success condition before scoring starts. Offer Practice and Skip practice.
Practice uses the same controls and scoring rules, but changes no boss health,
crew score, coins or rewards. Reset all practice input before the scored attempt.

First-time eligibility is per player, island and minigame, in solo and multiplayer.
Another player on the same island still gets their own introduction; the same
player on another island gets it again. Store this guidance locally, separately
from authoritative game progress; another device or cleared storage may show it again.
Only finishing or explicitly skipping the introduction marks it seen.

## Multiplayer contract

Before the scored attempt, each standing participant announces readiness through
the existing wave room. Experienced players become ready automatically. New
players become ready after finishing or skipping practice. The battle and scored
clock stay frozen while the crew prepares. A bounded preparation period must
prevent a disconnected or inactive participant from blocking the wave indefinitely.
Show the remaining preparation time and explain the automatic start. Watchers
cannot ready another player or submit practice input into the real attempt.

## Likely files and verification

Reuse `frontend/src/pirates/finisher/`, its recorder and rules; connect player/island
identity through `pirates/controller.js`, `pirates/index.js` and `game.js`.
Readiness crosses `pirates/sync.js`, `pirates/sim.js` and `net/live-rules.js`.
Record the exact new message contract in `docs/INTERFACES.md` before shipping.

- [ ] Tests distinguish player, island and each of the three task kinds.
- [ ] Finish, skip, later encounters and unavailable storage work safely.
- [ ] Practice input never changes real scores or rewards; held controls reset.
- [ ] Two clients wait for the new player, start together and handle the wait limit.
- [ ] Keyboard and touch work at 1280 × 720 and 375 × 812; before/after evidence exists.
- [ ] Frontend install, tests, build, budget, text lint, accessibility and demo checks run with exact results in the PR.
- [ ] Walkthrough and test map describe the final code and evidence limits.
- [ ] Ianno completes explain-back; a different human teammate approves before merge.

No new package, service, account, backend route or database migration is planned.
Keep the change explainable; split the implementation into reviewable PRs if it
cannot stay near the agreed 400-line code budget. No merge or deployment is implied.
