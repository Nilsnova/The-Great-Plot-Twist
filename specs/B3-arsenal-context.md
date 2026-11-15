# Keep late arsenal answers on their original island

- Task: B3 follow-up; https://github.com/Nilsnova/The-Great-Plot-Twist/issues/87.
- Responsible: Johannes Franz Lang (@frcola), with Codex assistance.
- Branch: `fix/b3-arsenal-context`, based on main `e8c61c6`.
- Status: claimed; implementation and checks pending.

## Goal

Prevent a delayed arsenal move from assigning island A inventory, messages or loadout to island B after travel. Preserve completed server purchases and existing action ids.

## Acceptance

Delayed success/refusal after travel; normal same-island buy/return/take; current island remains authoritative.

## Scope and limits

frontend/src/island/arsenal.js; focused controller/browser tests. Reuse existing helpers. Login, APIs, backend, database, dependencies and game rules unchanged. Browser fixtures are not live-server or physical-device proof. No PR merge is authorized.
