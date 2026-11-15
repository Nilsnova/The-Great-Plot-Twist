# Respect closing the harbor while it loads

- Task: B3 follow-up; https://github.com/Nilsnova/The-Great-Plot-Twist/issues/91.
- Responsible: Johannes Franz Lang (@frcola), with Codex assistance.
- Branch: `fix/b3-harbor-loading`, based on main `e8c61c6`.
- Status: claimed; implementation and checks pending.

## Goal

Do not open a harbor card after the player closes it during a delayed module load. Keep later explicit opens working and resolve overlapping opens to the most recent intent.

## Acceptance

Close before load resolves, repeated opens, latest overview/weather intent, retry after failed load, disposal before completion.

## Scope and limits

frontend/src/harbor/host.js; focused host/browser tests. Reuse existing helpers. Login, APIs, backend, database, dependencies and game rules unchanged. Browser fixtures are not live-server or physical-device proof. No PR merge is authorized.
