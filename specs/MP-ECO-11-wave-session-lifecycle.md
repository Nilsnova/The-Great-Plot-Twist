# MP-ECO-11 wave session lifecycle

> **What this is:** an inactive, deterministic domain layer for shared-island wave reservations.
>
> **Who uses it:** the server session-authority implementation and its acceptance tests.

- **Status:** implementation preparation; persistent authority integration is blocked.
- **Branch:** `feat/shared-wave-participation`
- **Issue:** [MP-ECO-11](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/501)
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`).
- **Agent assistance:** Codex. A different human reviewer remains required.

## Goal and scope

Implement immutable server-domain transitions for one controlling session per player,
bell-time roster/loadout freezing, disconnect retention, immediate withdrawal, reconnect,
combat participation and canonical closure. Preserve the trusted journal checkpoint unchanged
when connection state changes; a disconnected retained Captain remains targetable and cannot
send inputs. Difficulty and roster never shrink. Only acknowledged combat participation can
qualify for personal victory receipts; later withdrawal does not erase that evidence.

Files: new `backend/server/island/wave_session_*.py` modules and focused Python tests.
The modules take trusted state; they do not authenticate HTTP input, own treasury or permission
APIs, replace the recovery journal, persist rows, or activate behavior on legacy waves.

## Authority and integration boundary

Use the common [economy contract](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/493)
and [permission prerequisite](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/495).
The future caller resolves the authenticated actor and persisted economy context, rechecks
membership/session authority under the agreed locks, and atomically persists the entire
transition plus its journal events. A separate read/check/write sequence is insufficient.
Existing wave routes, protocol 1/2 journals, personal Captain assignments, receipt storage,
arsenal returns and background expiry scheduling require coordinated integration.

Frozen special-copy identity includes its tenure generation. Withdrawal/grace expiry must
dispatch that identity to the arsenal lifecycle under the same transaction; canonical closure
releases pending copies even if every client is gone. Owner deletion remains separate scope.
Retained slot and control leases also carry a connection generation: reconnect advances it,
and old disconnect/input/withdrawal callbacks cannot affect the new connection. The future
atomic adapter must keep both generations synchronized, apply the same trusted disconnect
clock/deadline to the controller and retained slot, and resolve operation retries from
durable receipts before checking the current generation.

The agreed disconnect grace is 60 seconds for both a retained Captain slot and session
leadership. An eligible current leader retains leadership while connected or strictly before
their trusted disconnect deadline. At the deadline, choose the eligible connected member
with the earliest start of their current continuous activity interval, breaking exact ties
by stable player ID. Explicit departure or lost membership revokes leadership immediately.
Reconnection starts a new activity interval. These rules rely on trusted session state,
not browser presence. A pause is a between-reservation session setting and never changes a
wave clock, combat state or financial settlement deadline.

## Acceptance and tests first

- Duplicate tabs/cross-island session claims fail; exact retries keep one lease.
- Bell requires the existing controlling lease and no other live assignment; frozen
  loadouts, roster and difficulty survive disconnect, withdrawal and reconnect.
- Countdown-only acknowledgment earns no participation; post-start active acknowledgment
  qualifies once, without a damage quota, and survives falling/disconnect/withdrawal.
- Disconnect cannot renew grace through repeated messages. Reconnect before the deadline
  preserves the exact journal checkpoint; reconnect at/after it cannot reclaim a slot.
- Explicit leave immediately rejects old commands, including after another session is acquired.
- Expiring the last retained Captain closes the wave as abandoned, including with no browser;
  canonical closure is immutable and late victory cannot reopen it.
- Leader retention honors the 60-second absence boundary; explicit departure or membership
  loss revokes immediately. Successors come only from connected eligible sessions, ordered
  by continuous activity then player ID. Repeated disconnect messages cannot extend grace.
  Break/auto-next control never grants reset or treasury authority.

Run `cd backend && uv run pytest -q server/tests/test_wave_session_*.py`,
`cd backend && uv run ruff check .` and `git diff --check`. Run existing relevant wave
route/recovery tests for compatibility. SQL/concurrent authenticated clients, protocol
runtime reconnect, physical devices and durable receipt/expiry execution remain unverified
until the prerequisite persistence and integration implementations exist.

## Actual local verification

- Session domain tests: `uv run pytest -q server/tests/test_wave_session_lifecycle.py
  server/tests/test_wave_session_control.py` — **43 passed**, including leadership-grace boundaries.
- Existing compatibility suites: `uv run pytest -q server/tests/test_wave_routes.py
  server/tests/test_wave_recovery_routes.py server/tests/test_wave_recovery_transport.py
  server/tests/test_wave_revive_routes.py server/tests/test_wave_rules.py
  server/tests/test_captain_recovery_policy.py` — **177 passed**.
- `uv run ruff check .` — passed across the backend.
- `git diff --check` — passed.

Python commands used a writable temporary `UV_CACHE_DIR`; no dependency files changed.
These are domain and existing mocked-route checks. They do not exercise persistent exclusive
assignments, concurrent cross-island changes, background expiry execution, treasury/Captain
receipt integration or authenticated runtime reconnect. No current runtime route imports
these modules. The full backend suite and browser/SQL acceptance remain integration work.
