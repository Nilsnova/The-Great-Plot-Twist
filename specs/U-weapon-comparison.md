# Compare arsenal weapons with the carried weapon

- Lane: U, approved addition; https://github.com/Nilsnova/The-Great-Plot-Twist/issues/95.
- Responsible: Johannes Franz Lang (@frcola), with Codex assistance.
- Branch: `feat/u-weapon-comparison`, main `e8c61c6`.
- Status: claimed; implementation/checks pending.

## Goal

Offer an optional direct comparison of damage per hit, range, reload time and firing mode against the carried weapon. Reuse captainStats with the current level, learned skills and role. Do not rank a different firing mode as universally better.

## Acceptance

All weapon types, level/skill/role effects, same type and rounding; native keyboard comparison disclosure at desktop/phone widths; no buy/take side effects.

## Scope

frontend/src/island/arsenal-model.js, arsenal-ui.js, arsenal.js, ui.js, island.css and index.js; focused model and browser tests. No login/API/backend/database/dependency/game-rule changes. Reuse current helpers; one small feature per PR. Controlled fixtures are not live-server or physical-phone evidence. No merge authorized.
