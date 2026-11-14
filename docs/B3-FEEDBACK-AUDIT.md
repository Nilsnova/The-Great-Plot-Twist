# B3 current-game feedback audit

Johannes Franz Lang (@frcola), with Codex assistance. Main baseline: `430b7b6`.
Parent [issue #30](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/30).

## Agreed scope and interpretation

This pass concerns the current v3 island game and recoverable help loads. Login, API
contracts and server messages are unchanged. The historical B3 row also names the
retired mystery/class-demo flow and email OTP; those are outside this agreed pass.
No mystery solution, credentials or real-player data are used.

## Confirmed gaps fixed in two independent PRs

| Case | Before | Result | Evidence |
|---|---|---|---|
| How to play module fails | Silent return; no next step | Loading, plain error, Try again, Back to game; late/cancelled responses ignored | [PR #31](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/31), [before/after](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/fix/b3-help-feedback/docs/evidence/B3-help/README.md) |
| Shortcuts module fails | Press ? only; repeated menu opens could stack notices | Loading and retry/back controls usable on phones, one view, cancelled/disposed results ignored | [PR #32](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/32), [before/after](evidence/B3-shortcuts/README.md) |

## Existing feedback checked

These screenshots exercise the actual UI components with controlled model/API answers.
They do not prove the backend refusal, database rules or a real network outage.
Both independent PRs ran the whole frontend suite; the existing tests remain unchanged.
Disabled-action rows are preventive feedback, not a claim that a rejected request occurred.

| Case | Existing behavior / available next step | Component | Captures |
|---|---|---|---|
| Invalid join code | The existing form explains the expected code and lets the player edit it. | [source](../frontend/src/front-door/games.js) | [1280x720](evidence/B3-audit/join-code-1280x720.png), [375x812](evidence/B3-audit/join-code-375x812.png) |
| Full game | The existing form shows the refusal; edit the code or choose Create a game. | [source](../frontend/src/front-door/games.js), [tests](../frontend/tests/island/games.test.js) | [1280x720](evidence/B3-audit/join-full-1280x720.png), [375x812](evidence/B3-audit/join-full-375x812.png) |
| Create game transport exception | The existing form says to check the internet and try again; Create is enabled again. | [source](../frontend/src/front-door/games.js) | [1280x720](evidence/B3-audit/create-offline-1280x720.png), [375x812](evidence/B3-audit/create-offline-375x812.png) |
| Too few coins | The existing card gives the shortfall and prevents the unavailable purchase. | [source](../frontend/src/island/card-model.js), [tests](../frontend/tests/island/card-model.test.js) | [1280x720](evidence/B3-audit/build-coins-1280x720.png), [375x812](evidence/B3-audit/build-coins-375x812.png) |
| Locked building kind | The existing card names the wave required to unlock it. | [source](../frontend/src/island/card-model.js), [tests](../frontend/tests/island/card-model.test.js) | [1280x720](evidence/B3-audit/build-locked-1280x720.png), [375x812](evidence/B3-audit/build-locked-375x812.png) |
| Build already pending | The existing card says Building and disables competing actions. | [source](../frontend/src/island/card-model.js), [tests](../frontend/tests/island/dom.test.js) | [1280x720](evidence/B3-audit/build-busy-1280x720.png), [375x812](evidence/B3-audit/build-busy-375x812.png) |
| Offline leaderboard | The existing card explains the online requirement and offers Try again. | [source](../frontend/src/island/ui.js), [tests](../frontend/tests/island/leaderboard.test.js) | [1280x720](evidence/B3-audit/leaderboard-offline-1280x720.png), [375x812](evidence/B3-audit/leaderboard-offline-375x812.png) |
| Offline connection | The existing banner offers Retry connection and the problem-report link. | [source](../frontend/src/ui/connection-banner.js) | [1280x720](evidence/B3-audit/connection-offline-1280x720.png), [375x812](evidence/B3-audit/connection-offline-375x812.png) |

## Additional source/test review and limits

- [Weather model](../frontend/src/harbor/weather-model.js) explicitly uses calm sea
  while weather is missing and explains stale data. [Weather-board tests](../frontend/tests/island/weather-board.test.js)
  cover missing/stale/storm/fog states. No new live-weather or provider-outage proof is claimed.
- [Duel status text](../frontend/src/screens/duels/steps.js) distinguishes declined and
  expired challenges and returned stakes; [logic tests](../frontend/tests/duels-logic.test.js)
  are included in the frontend suite. A full duel invitation/settlement journey was not replayed here.
- Existing demolition and wave actions keep their server messages and controls. Recovery,
  placement, arsenal and reset redesigns are separately claimed in T29–T47. This pass does
  not approve or duplicate those evolving contracts.
- Physical phones, screen readers, prolonged provider outages and real multiplayer were
  not tested. The screenshots show isolated UI fixtures, not a 40-player deployment.
- The two PRs are independently based on main, independently tested and remain draft;
  no combined-branch test or merge is claimed. Human review and explain-back remain.

## Evidence totals

Help PR: 2,997 frontend tests, build/budget/text lint, 33 accessibility screens and
33 demo checks passed. Shortcuts PR: the same 2,997-test count on its independent
branch, plus its native failed-module request/retry tests, and the same applicable gates.
Exact commands/results are in the two PR descriptions. No existing test was removed,
skipped or weakened. Shortcuts red proof selected only its new native-load regression;
the final full run did not exclude tests.
