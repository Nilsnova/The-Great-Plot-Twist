# Finish a saved session departure after membership removal

Responsible teammate: Ianno Hollensteiner. This bounded MP-ECO-20 follow-up changes only the canonical session client's handling of an exact saved departure. It adds no endpoint, controller authority, database writer or financial effect.

A member can use the normal Leave game action before its queued canonical session departure is acknowledged. The existing `game_leave` transaction removes membership, withdraws matching frozen slots and idle control, handles held stock and rotates the old topic atomically. A later `shared_session_leave` checks current membership before checking the obsolete controller generation, so that original-origin request can return **403 `not_member`** instead of **409 `stale_controller`**. Retrying that now-impossible departure forever blocks an otherwise valid home attachment.

The client now treats only the exact authenticated **403 `not_member`** leave result as a terminal old-departure acknowledgment. It removes the matching saved departure through the existing identity-checked intent store. It does not fabricate a canonical receipt or grant control. A fresh destination attachment, exclusive document lock and independently verified current control read remain required. The existing API adapter continues to authenticate the original actor and captured origin; an identity change invalidates the response.

Generic 403, `not_controller`, 401, network/unknown outcomes and server failures keep the original UID/body for retry. Existing epoch-replacement and generation-stale behavior stays unchanged.

## Verification and limits

The new regression first failed because an exact saved old-origin departure receiving 403 `not_member` prevented home attachment. After the fix it retires that exact departure, attaches home with expected generation zero and exposes proof only after a fresh accepted read. Five negative status/code combinations retain the original intent and do not attach another source.

The five focused suites passed **76 tests**:

```sh
cd frontend
npm test -- --maxWorkers=1 tests/island/shared-session-client.test.js tests/island/shared-session-api.test.js tests/island/shared-session-http.test.js tests/island/shared-session-intents.test.js tests/island/shared-session-lock.test.js
npm run build
```

The production build and spoiler guard passed. These are source-level client, transport and locking regressions. The separately retained real-provider finding observed normal membership Leave HTTP 200, an actual old-topic departure, home selection and a persistent pending-session message. A later authenticated diagnostic using the same actor and a retained server-issued old-origin proof returned 403 `not_member`; its diagnostic UID is new, because the original browser departure UID/request body was not captured. It is not presented as that lost original request or as a post-fix browser journey. No hosted migration, database alteration or activation was performed.
