# B2 — Island action targets

Johannes Franz Lang (@frcola), with Codex assistance. Screenshots of the actual
local game using its existing in-memory island transport, not a live account.
Before: main `4d83dcd`; after: this branch. Chrome viewport sizes, not physical phones.
No login, real server writes, API contracts or game rules changed.

## Measured change

Hire crew, Move, Tear down and Players each measured **40px high before** and
**44px after**, at all three sizes. The shared `.kit-button` already sets 44px;
four smaller overrides were removed. Widths remain at least 44px. The game chip
ends at y=126 and the goals start at y=130 on both phone sizes: 4px clear space.
No document horizontal overflow was measured.

| Size | Building card before | Building card after | Friend's game before | Friend's game after |
|---|---|---|---|---|
| 1280x720 | [Before](before-card-1280x720.png) | [After](after-card-1280x720.png) | [Before](before-island-1280x720.png) | [After](after-island-1280x720.png) |
| 375x812 | [Before](before-card-375x812.png) | [After](after-card-375x812.png) | [Before](before-island-375x812.png) | [After](after-island-375x812.png) |
| 390x844 | [Before](before-card-390x844.png) | [After](after-card-390x844.png) | [Before](before-island-390x844.png) | [After](after-island-390x844.png) |

[Before measurements](before-measurements.json), [after measurements](after-measurements.json).
The fake game builds one cannon, opens its card, then visits the existing fake
friend ISLE-FR3ND for the Players chip. Screenshot setup uses the current
`frontend/scripts/capture-placement.js` flow; camera position and time are fixed.
Transient goal/loot notices and the focused canvas are normal game elements.

## Regression and limits

`cd frontend && npm test -- --run tests/island/phone-targets.test.js`
checks all four buttons at each size, bounds/card scrolling, no horizontal overflow,
focus, Escape, and one callback per click. The fourth case preserves disabled Move
and Tear down during a wave. Before correction: 3 failed, 1 passed, with
`expected 40 to be greater than or equal to 44`; after: all four pass.

Callbacks are controlled: these tests do not move/demolish a real building or
verify purchases/refunds. Physical touch accuracy, software keyboard behavior,
screen readers, other browser engines, live multiplayer and the rest of the B2
journey remain unverified. Larger controls add up to 12px to the three-action stack;
the existing docked card scrolls. No new interaction layer or player wording.
