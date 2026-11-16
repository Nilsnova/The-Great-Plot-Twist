# Multiplayer pause/break flow regression

> **What this is:** a scoped investigation and regression plan for the co-op between-waves Pause/Resume flow.
>
> **Who uses it:** Ianno and the frontend contributors reviewing issue [#106](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/106).

- **Responsible teammate:** Ianno (`Iannomh123456`)
- **Agent assistance:** Codex, `gpt-6-luna` (high reasoning)
- **Review:** Franz (`frcola`) must approve the current revision; Ianno manually reviews every PR.
- **Merge:** this task agent will not merge or enable auto-merge; Ianno's task authorization excludes merging.
- **Branch:** `fix/multiplayer-pause-flow`
- **Status:** diagnosis confirmed on current `main` (`a9386656`); minimal journey fix in progress

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

The current journey failed at the pause click after all earlier multiplayer checks passed, including the captain revive. Its `04-break-upgrade-me.png` capture showed only about 3 seconds left in the authored 8-second break when setup and both renderer waits had finished; the `failure-me.png` capture after Playwright's existing 30-second click limit showed that the break HUD had naturally closed. This establishes an expired interaction window, not a broken room permission or a per-render detach reproduced within the valid break. The fix pauses as soon as the host's break appears, then checks the peer state, 9-second hold, upgrade propagation, and resume.

Initial reproduction: `cd frontend && npm run test:mp -- /tmp/multiplayer-pause-flow-main-repro` on current `main` with `/usr/bin/chromium`. It failed at line 592 with `locator.click: Timeout 30000ms exceeded`; the locator found the enabled Pause button, but the break ended before Playwright's stability wait completed.

After reordering the check, one full journey proved the pause path: 8 seconds remained when the host clicked; both clients showed `Paused by Nils`, remained in the break for more than 8 seconds, saw cannon_2 level 2 while paused, resumed and joined wave 4; wave 1 ship/boarder synchronization was 17/17. It later failed the existing unrelated musket pose assertion (`0 !== 2`, no browser errors). One unchanged-bound rerun stopped earlier at the existing revive tick equality assertion (`73.1 !== 72.4`, no browser errors) and did not reach the pause or pose phase. No timing bounds or assertions were weakened, and no pose/product code changed. Exact outcomes and remaining limits are in [draft PR #106](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/106); the full frontend `npm test` suite is still pending.
