# MP-ECO-02: global operation identities

> **What this is:** an immutable identity shared by converted free and paid player actions, with separate financial effect identifiers.
>
> **Who uses it:** shared domain transactions, personal Captain mutations and canonical financial completion adapters.

- **Status:** foundation extension; no public route or admission activation.
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.
- **Issue:** [MP-ECO-02 #494](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/494).
- **Branch:** `feat/mp-eco-02-operations`.
- **Dependency:** the [treasury foundation](MP-ECO-02-island-treasury.md), including its scope guard, account/ledger tables and private-helper privilege model.

## Problem and boundary

A treasury ledger cannot identify a free house-role change. Separate free-domain and financial receipts would let the same actor reuse one request UID first for that change and then for construction. The converted player operation must be identified before either kind of effect.

`island_economy_operations` uniquely binds `(actor_id, action_uid)` to its original account/run, server-selected domain action and canonical request fingerprint. Account and epoch are both null only for personal actions independent of island accounting. The same personal UID cannot later target an island, and an island UID cannot target another account or reset run.

This covers converted version-one player domains. Existing personal-wallet protocols remain unchanged. Existing direct shared-treasury identities become opaque internal financial history; they are never inferred to prove a new player request. Raw financial primitives are internal compatibility/test mechanisms, not public player intent endpoints.

## SQL and Python interfaces

The additive migration is `20261118050150_island_economy_operations.sql`. It changes no balance or existing receipt and admits no island. `backend/server/island/economy_operations.py` provides the immutable `OperationClaim`, checked claim-response parsing and pure identifier formatters; it makes no network mutation call.

```sql
island_economy_claim_operation_locked(
  p_actor_id uuid, p_account_id uuid, p_run_epoch uuid, p_action_uid text,
  p_domain_action text, p_fingerprint jsonb
) returns jsonb
```

- A new accepted identity returns `{status: 'claimed', operationId: <uuid>, repeat: false}`.
- An identical committed identity returns `{status: 'replay', operationId: <same uuid>, repeat: true}`.
- A changed account/epoch/domain/fingerprint or opaque financial identity returns `{status: 'refused', reason: 'action_conflict'}`. The API adapter maps this to `409 idempotency_conflict`.
- Malformed root IDs, mismatched null scope fields or a non-object fingerprint return `invalid_change`; a wrong new epoch returns `epoch_mismatch`; an unavailable/retired/paused new shared scope returns `path_unavailable`. Existing matching replay is resolved before those mutable scope checks.

Domain names follow `[a-z][a-z0-9_:.-]{0,79}`, including `construction:build` and `progression:research`. Fingerprints are server-built JSONB objects representing normalized request intent, including expected quote/resource versions. They must not be reconstructed from today's prices, balances or choices on retry. The complete original result remains in the domain's immutable receipt, linked by operation UUID or the same actor/UID identity. A claim is not a replacement for that receipt, a permission grant or proof of combat outcome.

The immutable table contains `id`, `actor_id`, `action_uid`, `account_id`, `run_epoch`, `is_player_intent`, `domain_action`, `fingerprint` and creation time. Actor references do not cascade on member deletion; retention/de-identification follows the existing shared-history policy gate. RLS is enabled. Anonymous/authenticated clients receive no access; `service_role` receives select only. Private SQL helpers are invoked only inside owner-defined domain functions, not exposed as claim-only service/browser RPCs.

## Transaction and lock rules

For an island action, acquire all required existing island scope guards and account locks first. Claim the one player root before personal Captain/Engineer and domain row locks. A standalone personal action uses null account/epoch and claims before its personal profile lock. Do not acquire a root identity late after a personal/domain mutation.

On replay, load the original immutable domain result before checking current catalogue/phase/resource state. On a new claim, perform all current authorization, expected-version and domain validation before effects. If a later validation, financial debit, asset mutation or receipt write fails, roll back the whole enclosing transaction, including the inserted claim. A returned business refusal after a claim must pass through the domain's exception/savepoint rollback path; merely returning a refusal would leave an incomplete operation. The SQL tests inject failure after both charge and domain mutation to verify rollback and a corrected retry.

Dedicated personal state belongs in its own row class. Legacy Captain fields physically stored on `islands` do not become earlier-class personal locks: discover and lock all touched island rows together in UUID order. When a public profile row is the personal creation/serialization anchor, `FOR NO KEY UPDATE` permits the legacy ledger's foreign-key `KEY SHARE`; dedicated personal profile rows still use their required update locks.

All newly converted public intent paths must follow early claiming before admission is enabled. The registry cannot make an omitted domain claim or a wrongly split network debit/asset transaction correct.

## Financial children and system origins

```sql
island_economy_effect_uid(p_operation_id uuid, p_effect_key text) returns text
island_economy_system_uid(p_origin_id uuid, p_effect_key text) returns text
```

Python exposes matching `effect_uid` and `system_uid` formatters. Effect keys match `[a-z][a-z0-9_]{0,15}`. Their outputs fit the existing 64-character financial UID limit:

| Identifier | Meaning |
|---|---|
| `fx_<32 lowercase UUID hex>_<effect key>` | Financial child of a checked player operation, such as `charge` or `refund`. |
| `sys_<32 lowercase UUID hex>_<effect key>` | Server-derived canonical effect, such as `system_uid(wave_id, 'wave_loot')` or a reserved stake's settlement. |

New client root UIDs reject both reserved prefixes. Multiple financial effects of one intent use distinct stable child labels; they do not create new user intents. A retry reuses the same root and child identities. Never pass the user's root UID directly as a new financial effect.

The ledger's new `BEFORE INSERT` trigger verifies every `fx_` child against an existing player root with the exact operation UUID, actor, account and epoch. A formatter alone grants no authority. A forged/malformed child fails through the existing treasury rollback/idempotency-conflict path. The trigger does not insert a second player operation for a valid child.

Other internal/raw financial identities are inserted atomically into the same registry as `is_player_intent=false`, with their original ledger UUID and fingerprint. This closes both directions of raw-financial versus free-intent collision, including cross-account concurrent insertion. Failure rolls back the financial balance update through the existing ledger helper. It introduces no late per-intent advisory lock.

New canonical system effects must use `sys_` or an explicitly valid child. They use their existing saved origin authority and account; no player claim/current-membership requirement is added during settlement. Reserved-prefix separation prevents a client from creating a competing root identity for a known late system completion while that completion holds personal/domain locks. Non-prefixed raw compatibility paths are not a substitute for the early-root protocol in new public domain transactions.

## Historical backfill, reset and rollback

Existing shared ledger identities are backfilled as opaque financial tombstones, including historically prefixed `fx_`/`sys_` rows. They cannot be adopted as player proof, even if some fields happen to match. Reapplication skips only a child already proven by an exact existing player operation; it checks all other backfilled identities for contradiction and creates no additional operation or grant.

The migration requires the documented default `READ COMMITTED` transaction isolation. Other modes fail at entry with `25000 island_economy_operation_cutover_requires_read_committed`, before locks or DDL. A transaction-wide older snapshot could otherwise miss a newly committed admission and its ledger identity even after relation locks drain its writer. The migration does not silently change the caller's isolation.

Before any registry DDL, the migration collects three relation barriers: accounts in `EXCLUSIVE`, the existing operations table in `ACCESS EXCLUSIVE`, and the ledger in `SHARE ROW EXCLUSIVE`. Every acquisition uses `NOWAIT` inside the same exception/savepoint block. An unavailable lock rolls back the entire partial set before a 50 ms retry. After 30 seconds of contention, `55P03 island_economy_operation_cutover_busy` fails before schema or history changes; the migration can be retried after activity drains.

The migration never waits for an island scope, island row or personal row while holding those relation locks. A barrier on accounts alone would be insufficient: even a null-scope personal operation takes the account parent's `ROW SHARE` relation lock for its nullable foreign key, after touching operations. All-or-nothing acquisition avoids both that inversion and the first-application account-FK DDL inversion. On first application the absent operations table is skipped without creating it early. New account admissions either finish before the complete barrier or wait until the backfill and trigger installation commit; no owner-inventory snapshot can miss them. Plain ledger history reads remain compatible with its barrier. Runtime scope/account/personal lock ordering is unchanged. Application still follows the separately reviewed migration/release procedure.

Historical financial replay continues to return its original receipt before insertion, including after backfill. New roots never import private-wallet history or relabel a financial receipt as a free-domain result. No broad backfill of later personal/domain receipt families is invented; any independently deployed unregistered domain history requires its reviewed mapping before that path is admitted.

A reset retains operations and financial receipts. A known old intent can return its old domain result, but changing its account or epoch conflicts. A new identity cannot initiate spending on a retired/paused run. Legitimate original settlement may still credit its retired originating account under the selected reset policy; the trigger adds no current-membership or current-run redirection. No result can fund the replacement account through UID reuse.

Precommit failure rolls back claim, child receipt and every effect. After a committed operation, pause or corrective work must retain its immutable identity; deleting identities is not a rollback strategy. This migration enables no route, converts no save and applies no live change.

## Verification

Required cases are covered by `test_economy_operations.py` and the disposable PostgreSQL `island_sql/test_economy_operations_sql.py`:

- Free before paid and paid before free; raw financial before free and free before raw financial.
- Same/altered replay, cross-account and personal/island retargeting, wrong epoch, reserved prefixes and malformed scope.
- Simultaneous same-intent and cross-account/raw races; one complete effect, no second charge.
- Failure after claim, financial effect and domain mutation; no orphan claim and corrected retry succeeds.
- Exact child actor/account/epoch proof; historical prefixed backfill and repeat-safe reapplication.
- System settlement after departure/retirement; original account changes, replacement account stays untouched.
- Private grants/RLS, immutable history and the unchanged treasury conservation/regression checks.
- First and repeated cutover overlapping an existing financial writer or a newly admitted account; a new admission queued behind the barrier uses the installed trigger.
- Personal null-scope foreign-key overlap and exhausted cutover attempts that release all partial locks without schema changes.
- Unsupported transaction snapshots fail before DDL while an admission remains uncommitted; a later `READ COMMITTED` retry backfills its identity.

Run the focused Python tests and Ruff; run the new and existing treasury SQL suites with `CASE_PG_SCRATCH=1` and the existing disposable PostgreSQL tools. Parse the complete additive migration chain as documented in [ENGINEERING](../docs/ENGINEERING.md#42-add-a-database-table). No configured database or credentials are used. Final local command results are reported separately; independent human review and full authenticated domain integration remain pending.

Verification on 18 Nov 2026, from `backend/` with a writable uv cache:

- `uv run --no-sync pytest -q server/tests/test_economy_operations.py server/tests/test_island_treasury.py server/tests/test_island_treasury_store.py`: **62 passed in 0.35s**.
- `CASE_PG_SCRATCH=1 uv run --no-sync --with pgserver --with 'psycopg[binary]' --with pglast pytest -q --tb=short server/tests/island_sql/test_economy_operations_cutover_sql.py server/tests/island_sql/test_economy_operations_sql.py server/tests/island_sql/test_island_treasury_sql.py`: **54 passed in 23.14s**. The main fixture applies the complete migration chain twice; cutover cases also use isolated pre-registry clusters. All PostgreSQL servers use private Unix sockets.
- `uv run --no-sync ruff check .`: **All checks passed**.
- The documented pglast check: **67 migration files parsed**.
- Relative documentation links, content and `git diff --check`: passed.

The initial plain test collection failed on the absent new module before implementation. No full-backend, public route, authenticated browser, deployed database or activation test is claimed by these focused checks.

Runtime integration must document the operation/child contracts in INTERFACES and the Supabase policy matrix. No old production module, public endpoint, feature flag or existing personal-wallet contract is changed by this extension.
