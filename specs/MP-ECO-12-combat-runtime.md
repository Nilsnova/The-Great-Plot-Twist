# MP-ECO-12: Shared repair routes and treasury card

> **What this is:** the authenticated route and card integration for the atomic shared repair transaction.
>
> **Who uses it:** invited island members, the game client and multiplayer acceptance tests.

- **Status:** repair route and card implementation verified locally; canonical timed revival and complete authenticated runtime acceptance remain open.
- **Branch:** `feat/shared-combat-runtime`
- **Issue:** [#502](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/502).
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`). Coding assistance: Codex.

## Scope

Extend existing `GET /api/island/structures` and `POST /api/island/structures/repair`
with explicit persisted-economy dispatch. Shared reads require the common client capability
and current membership; shared repair intents require the published economy envelope and
use the already implemented atomic treasury/HP/quota/event/root transaction. A missing,
malformed or failed economy read never selects personal payment. Navigation codes are accepted
only by reads and legacy mutations; a shared intent targets only its common origin. Shared
replies use the common immutable receipt and optional separately
authorized state/economy, never a personal `coins` field. An owned historical receipt remains
retrievable after island deletion without restoring current island access or exposing a current
treasury. Fresh projections recheck membership after reading state and the account envelope;
revocation during the read refuses a standalone read or yields only an already committed receipt.

Legacy request/response shapes remain available only when the target's persisted context is
explicitly `personal_legacy`. Existing shared island reads cannot authorize an old personal
repair request. The route imports the common capability helper rather than defining a new
header contract or trust source. Recovery epoch and treasury run epoch remain separate.

A dedicated shared combat API adapter consumes injected authenticated transport, canonical
`getEconomy`/`onEconomy` callbacks and retry storage. It validates exact common origins,
receipt identity and financial effect, keeps an unknown outcome's original payload and UID,
and never imports island funds into a personal wallet. Thin global island/card wiring is
provided by the existing client integration; this package changes dedicated recovery
model/view files and new helpers only.

The recovery card uses exact canonical decimal-string available funds for shared affordability,
labels the island treasury as payer, and preserves the shared three-success quota. It offers
no paid repair or recovery ETA between reservations. Legacy coin rendering remains explicit;
missing/malformed shared funds disables the action without consulting personal coins.

## Timed revival boundary

The shared session implementation and canonical accepted Captain journal must supply actual
accepted fall identity and target-bound uninterrupted hold state. Existing client-only timing
and HP cannot be supplied to the revive action as authoritative facts. Server-accepted
monotone damage/fall reports may retain the game's documented combat-report trust limit;
revival may not accept a client heal or elapsed-time assertion. Frozen Medic timing, server
clock, cancellation and exact-current-fall event/receipt commit are coordinated before shared
wave/simulation files change. This route/card package introduces no runtime, full combat
verifier, fabricated provider, paid-revival fallback or unilateral wave protocol.

## Tests before implementation

Backend route tests cover strict shared bodies/capability, current member access, rejected
navigation codes on shared mutations, explicit legacy compatibility, missing context/read errors,
actual shared service
dispatch, stale quote response, and receipt-only replay without current-state/wallet reads.
Disposable PostgreSQL route tests exercise the actual atomic repair and root/financial facts.
Frontend tests cover exact large-number affordability, missing funds, payer label, reservation
quota, no between-wave offer, same-origin receipt validation, precise unknown-outcome retries
and delayed replies after switching island/epoch. Existing repair/recovery/legacy tests remain
part of regression verification. Browser evidence is recorded separately from fixture tests.

## Verification

Local checks passed: 21 repair/recovery route and service tests; 148 repair/revival policy,
transaction-adapter and wallet/migration regressions; 30 disposable PostgreSQL
repair and admission-guard tests; six disposable PostgreSQL HTTP/recovery tests; 43 client
API, exact-funds and recovery-model tests; and two actual Chromium recovery-card component
tests. Desktop and 375-pixel phone component renders show the island payer, exact insufficient
funds and no between-wave repair offer. Ruff, the production build with its spoiler guard,
and parsing all 76 SQL migrations passed. The database/HTTP fixtures label the test-only
authority and snapshot producer; they do not establish a production provider or authenticated
two-browser acceptance. The full repository suites were not rerun for this bounded package.

Global island/card wiring and its combined runtime checks are separate from these component
tests. No push, publication, live migration application, activation or deployment is included.

## Legacy admission race protection

Python mode checks are advisory. Add migration `20261118181200_legacy_repair_mode_guard.sql`
to recheck persisted shared admission inside the actual legacy repair transaction. It takes
all distinct actor/target island class-zero advisory keys in signed ascending order before
wallet or island locks, then refuses an admitted target with `economy_context_required`.
A repair linearized before admission may complete under explicit legacy accounting; a repair
linearized after admission cannot debit private money. Existing legacy receipts are preserved;
legacy mutation/retry behavior applies only while the target is explicitly legacy. An old
receipt is not new private-spending authority on a converted island.

Resolve the dedicated legacy repair target without `service.target_island`: that helper may
open the actor's island and grant personal starting money before the target mutation. An actor
who owns shared island A and repairs legacy island B must not initialize or mutate A. This
change stays within the repair service; the global island service is not rewritten.

## Follow-up: stale treasury reads and authentication retry

A structure read may complete after the canonical same-origin account revision advances.
Reject a reply whose treasury revision is below that current revision before returning a
successful projection; declining only the account setter still exposes stale funds to cards.
Keep the actor/origin completion guard and exact decimal revision comparison. An unavailable
current envelope also fails closed. A regression first demonstrates an old 90-coin response
arriving after the selected account advances to zero available coins.

An HTTP 401 on a retained repair retry does not prove that its earlier unknown request had
no effect. Keep that actor/account/run/instance's durable original payload and UID through
reauthentication. A same-actor restored session must replay that exact intent and accept its
owned immutable receipt instead of generating a new action. Test the full unknown-response,
401, reload and same-actor restoration sequence before implementation. This follow-up changes
only the dedicated helper, its tests and this spec; global client integration stays separate.

Both new regressions failed before the helper changes and pass afterward. All 45 dedicated
shared API, exact-funds and recovery-model tests and the production build with spoiler guard
passed. No backend, SQL or complete repository suite was repeated for this client-only change.
