# COC-13 — between-wave wall connections

Responsible teammate: Johannes Franz Lang (@frcola). Tracking issue: [#154](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/154). This is a draft first slice, with no merge or activation by the agent.

## Fixture and screenshots

These images use the actual application in Chromium with its existing fake API. The fixture builds the twelve existing wall slots, then uses two normal accepted Move commands to put `wall_1` at `(-11.5, -1)` and `wall_2` at `(-7.5, -1)`. Together with `wall_10` and `wall_11`, this forms a valid T on the existing D056 lanes. The fixture does not enable free placement, add wall capacity or alter the collision rules.

The before images are served from actual main commit `a09787c079ba2921fb05facdecb41f61ca8ab84d` in a separate clone. The after images are served from this branch. Both use the same camera stand point and saved fixture positions.

| Size | Before | After |
|---|---|---|
| 1280 × 720 | [Before](screenshots/before-1280x720.png) | [After](screenshots/after-1280x720.png) |
| 375 × 812 | [Before](screenshots/before-375x812.png) | [After](screenshots/after-375x812.png) |

The script asserts twelve built walls, six actual full-side connections in the fixture, unchanged positions/levels throughout rendering and no page exceptions. Both raw reports record zero external requests; the final after report also records an intact WebGL context and no console errors. The after run also rings the normal bell and verifies that the baseline join meshes disappear for the battle handoff. Raw reports are [before](screenshots/report-before.json) and [after](screenshots/report-after.json).

## Reproduce

From `frontend/` on this branch:

```sh
node scripts/capture-wall-connections.js /tmp/coc13-after after
```

To compare with an earlier baseline, run the same script from a separate checkout of that baseline, passing `before`. The shared world-browser helper creates and closes its own ephemeral Vite server and Chromium process. It clears only the browser test context's local storage and uses synthetic game state; it does not write production data.

Focused tests:

```sh
npm test -- --maxWorkers=1 tests/island/wall-connections.test.js tests/island/world-art.test.js
```

Actual focused result: **2 test files passed; 17 tests passed**. See the [implementation spec](../../../specs/COC-13-wall-connections.md) for code ownership, exact geometry and Explain-back questions.

## Limits

- These joins are between-wave base art and Move-preview art. They are deliberately removed when combat takes over; battle-art integration is not finished by this slice.
- Missing canonical between-wave HP is not guessed. This layer retains the current spot-art convention and ignores explicitly broken rows when such data is supplied.
- Screenshots establish the browser fixture at these two viewport sizes, not physical-phone, Safari or live-service behavior.
- Full suite, production build/budget and broad accessibility/demo checks remain the orchestrator's separately reported integration checks.
