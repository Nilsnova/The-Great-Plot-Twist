# Retry a failed arsenal load from its card

- Task: B3 follow-up; https://github.com/Nilsnova/The-Great-Plot-Twist/issues/89.
- Responsible: Johannes Franz Lang (@frcola), with Codex assistance.
- Branch: `fix/b3-arsenal-retry`, based on main `e8c61c6`.
- Status: claimed; implementation and checks pending.

## Goal

Offer a native Try again control when the initial arsenal read fails. Show pending feedback and suppress repeated retry clicks, using the existing read method.

## Acceptance

Initial failure, repeated failed retry, successful retry, pending duplicate clicks, keyboard/phone control.

## Scope and limits

frontend/src/island/arsenal.js, arsenal-model.js, arsenal-ui.js; focused controller/DOM tests. Reuse existing helpers. Login, APIs, backend, database, dependencies and game rules unchanged. Browser fixtures are not live-server or physical-device proof. No PR merge is authorized.
