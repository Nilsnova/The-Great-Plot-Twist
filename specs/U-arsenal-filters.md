# Filter and group the shared arsenal inventory

- Lane: U, approved addition; https://github.com/Nilsnova/The-Great-Plot-Twist/issues/97.
- Responsible: Johannes Franz Lang (@frcola), with Codex assistance.
- Branch: `feat/u-arsenal-filters`, main `e8c61c6`.
- Status: claimed; implementation/checks pending.

## Goal

Add All, Available and Carried filters with counts and group the rack by weapon type. Preserve every copy id, holder and existing Take/Swap rules. Filters are local view state only, with clear empty states.

## Acceptance

Empty/full 20-slot rack, carried copies, stable ordering and ids, repeat renders, empty filtered results, pending/wave restrictions, keyboard and phone target/overflow checks; no reads/writes from changing filters.

## Scope

frontend/src/island/arsenal-model.js, arsenal-ui.js, arsenal.js and island.css; focused model/controller and browser tests. No login/API/backend/database/dependency/game-rule changes. Reuse current helpers; one small feature per PR. Controlled fixtures are not live-server or physical-phone evidence. No merge authorized.
