# Show island preparation before ringing the bell

- Lane: U, approved addition; https://github.com/Nilsnova/The-Great-Plot-Twist/issues/93.
- Responsible: Johannes Franz Lang (@frcola), with Codex assistance.
- Branch: `feat/u-wave-preparation`, main `e8c61c6`.
- Status: implemented; final verification and human review pending.

## Goal

Extend the existing bell card with the actual next wave, built defenses, known wall damage and upcoming campaign unlocks. Read only existing island answers; unknown or other-island wall data is not treated as healthy.

## Acceptance

Correct nextWave after defeat and at wave 100; current/visitor isolation; missing wall data; bounded unlock preview excluding unbuilt later items; desktop/phone and unchanged bell action.

## Scope

frontend/src/island/preparation-model.js (new), card-model.js, ui.js, index.js; focused model and browser tests. No login/API/backend/database/dependency/game-rule changes. Reuse current helpers; one small feature per PR. Controlled fixtures are not live-server or physical-phone evidence. No merge authorized.

## Implementation

preparation-model.js derives descriptive lines from the current island and a matching-code wall snapshot; it never blocks starting. bellModel accepts nextWave/preparation, and index.js supplies them. Opening the bell reuses the existing flag-gated walls GET; late reads/repair replies are not assigned to a different island. ui.js retains the unlock disclosure and its focus during redraws.

Read the existing server answers and campaign table instead of duplicating unlock rules or introducing a readiness score. Missing, invalid, partial or other-island health stays unknown; last-known health is labeled as such. The server still decides start/join and every repair.

## Test map and limits

15 new cases: nextWave after defeat, older-answer/final-wave fallback, built-only counts, campaign boundaries, partial/invalid/foreign health, running-wave behavior, native keyboard/phone disclosure and preserved focus, unchanged ring callback, and delayed wall read after an actual fake-island visit.

Wall health is the last successful read, not a live guarantee; a failed read may leave labeled last-known data. The late-repair UI guard does not undo a completed server repair. Physical phones, live Realtime and SQL are not proven by controlled fixtures or the fake-server run.
