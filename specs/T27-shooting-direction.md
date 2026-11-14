# T27: Captain shooting direction

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`).
Task: [#16](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/16).

## Agreed scope

Local and remote captains face shots and cutlass strikes in all four directions,
including up and down. Keep each captain’s lobby color and one visible body,
then resume walking or idle. Reuse the existing pose lifetime and room events;
no simulation, network contract, database or dependency changes.

## Acceptance evidence (pending)

- Direction tests, pose expiry, color preservation and one visible body.
- Two-browser check using the shared fake island and room.
- Before/after screenshots at 1280 × 720 and 375 × 812.
- Frontend tests, build, budget, text lint, accessibility and demo checks.
- Walkthrough and test-map updates; explain-back and independent human review.

This initial commit claims the task; implementation and verification are pending.
