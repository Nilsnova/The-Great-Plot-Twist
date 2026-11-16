# Show island preparation before ringing the bell

- Lane: U, approved addition; https://github.com/Nilsnova/The-Great-Plot-Twist/issues/93.
- Responsible: Johannes Franz Lang (@frcola), with Codex assistance.
- Branch: `feat/u-wave-preparation`, main `e8c61c6`.
- Status: claimed; implementation/checks pending.

## Goal

Extend the existing bell card with the actual next wave, built defenses, known wall damage and upcoming campaign unlocks. Read only existing island answers; unknown or other-island wall data is not treated as healthy.

## Acceptance

Correct nextWave after defeat and at wave 100; current/visitor isolation; missing wall data; bounded unlock preview excluding unbuilt later items; desktop/phone and unchanged bell action.

## Scope

frontend/src/island/preparation-model.js (new), card-model.js, ui.js, index.js; focused model and browser tests. No login/API/backend/database/dependency/game-rule changes. Reuse current helpers; one small feature per PR. Controlled fixtures are not live-server or physical-phone evidence. No merge authorized.
