# MP ECO 04 Shared construction and demolition

> **What this is:** atomic build, building-level upgrade and demolition primitives for an explicitly admitted shared island.
>
> **Who uses it:** shared-island purchase routes, treasury accounting and construction tests.

- **Status:** transaction primitives implemented; shared route/admission integration pending.
- **Branch:** `feat/mp-eco-04-construction`.
- **Issue:** [#507](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/507), under [#492](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/492).
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.
- **Reviewer:** a different human teammate, not yet assigned.

## Why and scope

The new island treasury must pay for its own structures and receive their demolition proceeds. Charging one account and updating a structure through a later network request would permit partial purchases. Legacy refund code also infers missing payments from catalogue prices and pays personal wallets; the shared path must instead require an explicit shared financial basis.

This task adds isolated Python construction rules/adapter code, additive SQL and focused tests. Existing route/service code remains unchanged. No new mode is admitted or activated. Research, crew, tower skill/tree purchases, placement redesign and executable legacy-save conversion are outside this scope.

## Server and transaction contract

The server builds a trusted construction manifest from its flag-filtered catalogue: each kind has exact positive integral prices and required island wave per level; each permitted spot has allowed kinds and its required wave. Browser input cannot choose a payer, price table, actor role or unlock level. Client quote fields identify action, spot/kind, expected instance/level and exact quoted charge/refund. SQL repeats the domain checks against the current island record and personal Captain state.

`island_economy_construct(actor, account, epoch, actionUid, intent, catalogue)` is service-only. The intent is one of `build`, `upgrade` or `demolish`. It binds the operation identity to the original account/epoch, exact instance/level and quote. Successful responses separate an immutable domain receipt from fresh originating-account state. A repeated identical action returns that receipt before validating the current catalogue or structure; changed target/quote/payload returns SQL `action_conflict` (`idempotency_conflict` at the adapter boundary). No retry may silently act on a replacement structure. Fresh `currentEconomy` requires current membership and the original active account/epoch to remain the current active admission pointer. Departed actors and retries after retirement, pointer replacement or admission pause receive their original receipt with `currentEconomy: null`.

Claim the global root action through `island_economy_claim_operation_locked` under scope/account locks before taking personal or asset locks. Domain names are `construction:build`, `construction:upgrade` and `construction:demolish`. Finance uses `island_economy_effect_uid(operationId, 'charge' | 'refund')`, never the root UID. This also fences a zero-refund demolition against another domain or financial action. Client root UIDs cannot use the reserved `fx_` or `sys_` namespaces. Every refusal after a new claim raises into the enclosing SQL exception boundary so the claim and all purchase effects roll back together; a corrected request may reuse an unsuccessful action identity.

Take the MP-ECO-01 scope guard, account lock, personal state lock for purchases, island/admission/recovery state, then structure/health locks. Demolition changes no Captain state and does not require personal initialization. New mutations require current invited membership, active account/epoch and no accepted reservation. The private `island_economy_require_idle_locked(owner)` locks recovery state and returns its recovery version. It conservatively refuses any unfinished wave or recovery reservation, including countdown and an expired-but-not-yet-closed attempt; wall-clock expiry alone is not permission to construct. Canonical reservation closure belongs to the wave lifecycle transaction. The final reservation integration must use that same locked boundary before admission is enabled.

Use `island_treasury_spend`/`island_treasury_credit` within the same SQL transaction as structure mutation and its receipt. Account free funds are `balance - committed`; wager holds therefore compete with construction correctly. Recoverable business failure must roll back the entire domain change, including any financial debit or Engineer commitment. Never call a financial RPC over HTTP and then update the structure separately.

## Asset and price rules

- All invited members may build, upgrade and demolish between reservations; island ownership determines payment and resulting asset ownership.
- Build only an empty allowed spot; use the island's wave record for spot/kind unlocks. Preserve stored layout coordinates and existing placement/instance identities.
- Upgrade exactly the expected existing instance/level, preserve kind/spec/tree/layout, and apply the next catalogue increment. Keep recovery health/level guards and refresh the future structure state through existing recovery hooks outside reservations.
- Read Engineer role from locked personal state. Reuse the existing integer rounding: `max(1, floor((basePrice * 90 + 50) / 100))`. An actual discounted purchase binds the personal Engineer generation atomically through MP-ECO-07; several purchases before the next reservation share one generation. Failed purchases, unchanged-price rounding and retries do not create or extend a commitment.
- A personal reservation blocks a discounted purchase because it would change the buyer's Engineer commitment. A full-price purchase on another idle island leaves the frozen personal profile unchanged; it does not create an extra global construction restriction.
- Record actual shared payments per account/epoch/instance/level, linked to their immutable treasury receipt. Do not manufacture legacy `building_payments` rows or private-payer refunds.
- Preserve cumulative `islet_buildings.coins_paid` as a finite integral nonnegative numeric value. Its former one-million ceiling applied to a single legacy price rather than the sum of valid levels. Existing values are preserved; catalogue prices and legacy transaction caps are unchanged. Inline constraints keep legacy invoker writes independent of private treasury helper grants.
- Demolition returns `floor(sum(actual eligible shared payments) / 2)` to the originating island account, regardless of which member demolishes. A 100-coin base purchase discounted to 90 refunds 45, not 50. Paid repairs, research and tower skills/trees do not enter this refundable base.
- A legacy structure without a complete explicitly converted shared basis is refused with `construction_basis_missing`; do not infer its value from today's prices or pay private contributors again. MP-ECO-17 supplies any approved conversion mapping.
- A zero-coin refund still creates an immutable domain receipt without a fabricated positive treasury credit. Distinct retries or a later new UID cannot pay again for the same removed instance.

## Compatibility and integration boundaries

Legacy defaults and route payloads stay unchanged. Additive wrappers guard `island_build`, `island_upgrade`, `island_demolish` and `island_demolish_quote` before any old wallet/island locks. They acquire the same scope guard as admission and refuse every admitted shared mode, including a paused one. Original bodies remain private aliases with no browser or standalone service execute grant. Capture each original only once, then recreate public wrappers on reapplication; this prevents capturing a wrapper and recursing when the complete migration chain is applied twice. No admitted route may fall back to a personal wallet or catalogue-based private refund.

The existing building/layout/health schema remains authoritative. Additional perimeter placement rules, if introduced by another accepted version, need a matching trusted manifest/guard before those new offers are enabled; this task does not grant land or invent placement rights.

## Checks and acceptance

- [x] Python tests validate trusted manifest values, strict quote/intent types, precise refund arithmetic and immutable-response parsing; tests preceded the corresponding Python implementations.
- [x] Disposable PostgreSQL tests apply the additive migration chain twice and prove member purchases/refunds, private-wallet preservation, RLS/execute restrictions and receipt immutability.
- [x] Tests cover insufficient available funds, wager/build race, duplicate and changed retries, stale instance/level/price, replacement buildings, paid-basis completeness and no private fallback.
- [x] Countdown, unclosed expiry and a reservation committed while a purchase waits on the shared scope all refuse permanent changes. The actual shared bell RPC integration remains a separate activation gate.
- [x] A discounted buy commits its structure, actual charge and Engineer generation together; deliberate later failure rolls back all three. A repeated buy does not extend the obligation. A new discount after a previously frozen/withdrawn generation creates the next generation; old completion/replay cannot clear it.
- [x] Build/upgrade/demolish preserve stored coordinates, specialization and unrelated structures; recovery-v1 instance/health state stays consistent, including existing time-based health projection before an eligible upgrade.
- [x] Record exact focused/full relevant backend and SQL checks; disposable test results imply no live migration, mode admission or deployment.
- [ ] A different human teammate reviews the eventual change before merge.

## Expected files

`backend/server/island/construction*.py`, focused Python and `island_sql` tests, `supabase/migrations/20261118050400_island_economy_construction.sql`, and `supabase/migrations/20261118050401_island_economy_construction_legacy_guards.sql`. The transaction depends on the treasury, shared-operation registry and personal Captain foundations. Shared route/service, catalogue data and existing migration bodies are unchanged. Required API overview and Supabase policy-matrix updates accompany final route integration.

The two historical migration-author tests retain their original body assertions and explicitly allow only the new construction guard migration. They also verify scope/mode checks precede private legacy dispatch; real PostgreSQL verifies alias privileges, repeated migration application and unchanged legacy results.

## Verification

Run from `backend/`, with the existing test environment and disposable PostgreSQL tools:

```sh
uv run --no-sync pytest -q server/tests/test_construction_rules.py server/tests/test_construction_store.py server/tests/test_demolish_matches_migration.py server/tests/test_tower_tiers_match_migration.py server/tests/test_personal_captain.py server/tests/test_captain_progression_routes.py server/tests/test_economy_operations.py server/tests/test_island_treasury.py server/tests/test_island_treasury_store.py
```

Result: **155 passed**. This includes 38 construction boundary/rule cases and both narrowly updated historical migration-author checks.

```sh
CASE_PG_SCRATCH=1 uv run --no-sync --with pgserver --with 'psycopg[binary]' --with pglast pytest -q --tb=short server/tests/island_sql/test_shared_construction_sql.py server/tests/island_sql/test_demolish_sql.py server/tests/island_sql/test_structure_recovery_mutations_sql.py server/tests/island_sql/test_personal_captain_sql.py server/tests/island_sql/test_island_treasury_sql.py server/tests/island_sql/test_economy_operations_sql.py
```

Result: **120 passed**, including 29 new shared-construction cases. The complete 71-migration chain is applied twice by the fixture. `uv run --no-sync ruff check .` passed, and `pglast.parse_sql` parsed all 71 migrations. Spec links/content and `git diff --check` passed.

The earlier full `uv run --no-sync pytest -q` run reported **536891 passed, 307 skipped, 2 failed** in 653.56 seconds. Both failures were the historical migration-author allowlists rejecting the new wrapper definitions. Their exact allowlists and wrapper-order assertions were corrected and passed in the final 155-case focused run. The full suite was not repeated after those corrections and the final dependency updates.

Not verified here: shared HTTP route integration, the final canonical bell RPC, admitted-save conversion, frontend cards or authenticated multi-client behavior. No live database or deployment was used.

### Exact totals and historical projection follow-up

After the corrected operation-registry cutover, the focused construction/Python boundary
checks passed **51 cases**. The real PostgreSQL group listed above passed **130 cases** in
7.43 seconds, including **39 construction cases**, with the complete migration chain
applied twice. Added cases reproduce actual account retirement/replacement and admission
pause, preserving the exact receipt while withholding current state. A valid catalogue
loaded with 700,000-coin levels supports discounted 630,000-coin build and upgrade,
stores the exact 1,260,000 total and refunds half the actual basis. Nonfinite, fractional
and negative totals are rejected; a wide legacy bookkeeping total cannot inflate a refund.
