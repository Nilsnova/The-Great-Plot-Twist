# MP-ECO-15 Boat routes and shared reward presentation

> **What this is:** authenticated boat status/start/claim routes, atomic legacy separation, and isolated browser round/retry helpers.
>
> **Who uses it:** the boat UI, common island integration and runtime acceptance tests.

- **Status:** implementation in progress.
- **Branch:** `feat/shared-boat-runtime`
- **Issue:** [#504](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/504)
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`), with Codex assistance.

## Bounded scope and source

Build on the reviewed shared ship transaction and common treasury/permission contracts.
Update `routes/island_boat.py`; add boat runtime/status models/services, additive migration
`20261118181500_shared_boat_runtime.sql`, and isolated browser API/session/card/scene helpers.
Existing island API/controller/card-model and online transport consume these helpers through
small documented calls. No competing global economy state,
account, epoch, receipt or capability protocol is introduced.

Browser helpers consume the shared interface:
`getEconomy()` yields the current canonical envelope or null; `onEconomy(economy, expectedOrigin)`
projects a matching authorized snapshot; the existing transport accepts header options and
exports `ECONOMY_CAPABILITY_HEADERS`. The backend uses the common pure
`require_economy_capability(request)` check. These negotiate protocol only; SQL owns authority.

## Runtime behavior

Authenticated `GET /api/island/boat` returns persisted-mode-specific status. Shared status
contains the exact common economy envelope and island-wide per-game paid/remaining/maximum
amounts for the canonical current island record. A shared response requires capability version
one. Unknown or failed persistence never becomes legacy. Status rechecks membership and
canonical reservation authority under the same island scope/account boundary as mutations.

`POST /api/island/boat/start` accepts common economy intent, game and root UID; completion
`POST /api/island/boat/claim` accepts that intent, bound round UUID, stars and root UID.
Authentication alone supplies actor. Existing real shared SQL freezes original account/epoch,
record and formula; both operations return common immutable receipts. The original completion
context is checked against the stored round, and historic receipt reads reveal no fresh
current treasury. No request accepts a client coin amount or paying account.

Legacy `POST /api/island/boat` remains personally financed only outside shared admission.
Its persisted-mode check and stable legacy payout reference execute atomically with the
wallet mutation under scope/wallet/island locks. Admission cannot race a Python-only check.
Legacy existing reward semantics and source verification remain intact.

Before each shared attempt, including Again, the browser creates one server round. It saves
original context and start/claim root UIDs before sending; reload, lost response and retry
reuse that exact operation. It never rewrites an old owner/account/epoch to today's island.
An unresolved completion is retried before starting another attempt. Zero scores still close
rounds and preserve receipts. Shared status/result copy describes island improvement/cap,
while explicit legacy mode keeps personal rewards. Current-state projection is origin-fenced.

## Verification

Write meaningful route/service/browser tests and disposable PostgreSQL checks for membership,
capability, strict contexts, legacy admission races, shared status, actual start/claim dispatch,
durable retry/reload and epoch switching, Again round renewal, zero/lower scores and cap copy.
Run affected pytest/Vitest, backend Ruff, frontend build, SQL parse and diff/content checks.
Actual checks are recorded separately from planned authenticated browser acceptance.

No production authority provider is invented. Missing canonical authority fails closed;
fixture tokens/authority remain explicitly labeled. Full authenticated multiple-client
acceptance requires the real provider and common integration. No external write, configured
DB migration, admission activation, deployment or public publication is included here.

## Actual checks for the route/helper package

With writable `UV_CACHE_DIR`, from `backend/`:

- `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_boat_runtime_sql.py server/tests/island_sql/test_boat_runtime_http_pg.py server/tests/test_boat_routes.py server/tests/test_economy_http.py`: **26 passed in 17.61s**.
- `uv run ruff check .`: **All checks passed!**
- Documented `pglast` migration parser: **SQL parses: 76 file(s)**.

From `frontend/`, `npm test -- --run tests/island/shared-boat-runtime.test.js`:
**7 passed**. These cover durable unknown-outcome/reload retries, immutable score/epoch,
actor switches, zero-score completion during closure, next-round identity and shared cap copy.
`git diff --cached --check` passed before commit.

The HTTP/SQL tests use the real route, verifier code and domain SQL, with
`httpx.MockTransport` supplying TEST-ONLY user IDs and an explicitly injected authority
provider. They are not provider-issued authenticated runtime acceptance. Real browser
scene/Again checks and the production build follow the application wiring. Actual-provider
sessions and the canonical shared-context/authority producer remain separate acceptance
requirements; no fixture result establishes their completion.
