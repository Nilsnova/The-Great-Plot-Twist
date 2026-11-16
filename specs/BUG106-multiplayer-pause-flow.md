# Multiplayer pause/break flow regression

> **What this is:** a scoped investigation and regression plan for the co-op between-waves Pause/Resume flow.
>
> **Who uses it:** Ianno and the frontend contributors reviewing issue [#106](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/106).

- **Responsible teammate:** Ianno (`Iannomh123456`)
- **Agent assistance:** Codex, `gpt-6-luna` (high reasoning)
- **Branch:** `fix/multiplayer-pause-flow`
- **Status:** investigating current `main` (`a9386656`); no diagnosis or product change approved yet

## Goal

Reproduce the reported multiplayer pause/break failure against current source and determine whether the defect is in the game flow or the browser check. Preserve current timing limits and the existing pause permissions. Add a regression for the reproduced behavior and make only the smallest justified change.

## Checks

- Host can pause a between-waves break and the other client shows who paused it.
- The break remains open beyond its normal duration while paused.
- A permitted resume dismisses the paused state on both clients and both can continue the next wave.
- Repeated rendering and click handling preserve the control; close/dismissal and focus behavior remain safe.
- The multiplayer journey and documented frontend gates pass at their existing bounds.

## Scope

Likely surface: `frontend/scripts/check-multiplayer.js`, `frontend/src/pirates/hud.js`, `frontend/src/pirates/controller.js`, and `frontend/src/island/game-room.js`, only as justified by reproduction. No changes to pause permissions, multiplayer rules, `sim.js`, dependencies, backend, or deployment are authorized by this issue.

## Evidence

The current journey checks the pause flow around `frontend/scripts/check-multiplayer.js` lines 592–600. Earlier runs differed and are not treated as one reproduced failure. Record exact command, output directory, failing assertion or result, and any environmental limit in the PR before review.
