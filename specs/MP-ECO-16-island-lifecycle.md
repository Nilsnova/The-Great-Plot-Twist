# MP-ECO-16: island reset and account deletion

> **What this is:** the lifecycle contract for replacing a shared island run without erasing personal progress or redirecting old obligations.
>
> **Who uses it:** reset, account-deletion, canonical-wave, arsenal and financial-settlement implementations and reviewers.

- **Status:** selected lifecycle policies and isolated private treasury foundation implemented locally; complete reset/deletion routes and admission remain gated below.
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.
- **Issue:** [#511](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/511), under [epic #492](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/492).
- **Branch:** `feat/mp-eco-16-reset`.
- **Rules:** [shared island economy](../docs/DECISIONS.md#shared-island-economy-2026-11-18); [task acceptance](../docs/OPEN-TODOS.md#12-shared-island-economy-and-multiplayer-rules).
- **Dependencies:** MP-ECO-02 treasury and operation identities, 03 canonical receipts, 04–07 domain/personal state, 10 arsenal lifecycle, 11 accepted-bell/canonical closure, 12 recovery, 14 saved-origin bets and 15 ship-reward identities. MP-ECO-17 supplies the reviewed conversion and deletion mappings.

## Problem and existing behavior

The [legacy fresh-start transaction](../supabase/migrations/20261117050000_structure_recovery_mutations.sql) changes a personal wallet, removes wave rows and resets the owner's Captain fields. Calling it for shared mode would erase personal state, invalidate durable completion work and leave old financial operations ambiguously attached to a replacement run. Shared reset needs a separate transaction; disabling a flag cannot restore the legacy path.

The current [account deletion function](../supabase/migrations/20261106140000_followups.sql) hands over mystery crews and deletes `auth.users`. It does not implement island transfer. Both [interactive deletion](../backend/server/account/deletion.py) and [guest cleanup](../backend/server/demo/guests.py) reach it. Guest eligibility is based on account creation more than 24 hours ago, not inactivity. Neither an active membership nor an open financial obligation currently changes that eligibility.

Verified relationships that the new deletion path must address:

| Relationship | Current behavior | Required treatment |
|---|---|---|
| `arsenal_copies.holder -> profiles` | `ON DELETE CASCADE` removes a visiting holder's communal copy. | Preserve the continuing island's copy and use the accepted return/withdrawal lifecycle. |
| `wave_runs.started_by -> profiles` | `ON DELETE CASCADE` removes another owner's wave when its starter is deleted. | Preserve the canonical attempt and continuing-island closure authority. |
| Recovery participant/checkpoint/repair actor references | Several actor links cascade; checkpoint actor links also include `SET NULL`. | Inventory each relation; preserve necessary continuing-island outcome, payment and retry evidence under an explicit retention policy. |
| `building_payments.payer -> profiles` | `ON DELETE SET NULL` preserves actual cost/refund state. | Keep that evidence; null payer is not proof that the owner paid. |
| Shared treasury account/state owner references | `ON DELETE RESTRICT` prevents deleting the owning island while retained accounts exist. | Resolve owned-island disposition and historical identity explicitly; a foreign-key error is not the deletion workflow. |
| Shared canonical accounting/completion player IDs | Historical UUIDs have no live-profile cascade. | Preserve valid continuing-island receipts while applying the approved actor retention/de-identification policy. |
| Personal Captain profile and dependent rows | Deleted with that person's profile. | Account deletion may remove that person's personal data; island reset must never do so. |

The existing repair-receipt immutability trigger rejects updates, not deletes; it does not protect actor-cascaded receipt history. No protection is inferred from a table comment alone. The source inventory is completed against the exact integration revision before admission.

## Settled reset rules

Only the authenticated island owner may reset or delete the island. Session leadership and membership confer no such right. All ordinary member purchase, betting, research-switch and demolition rights remain as specified by MP-ECO-08.

A successful reset creates a new server-generated account UUID and a new economy run epoch, retires the old account from new player spending and points the persistent shared-mode state to the new account. The economy version stays one. The new account receives the configured run-start capital once; neither balance nor reserved principal is transferred from the old account. Open island bets do not block reset. All old remaining cash, held principal and later payouts/refunds remain solely in the retired original account and cannot fund the new run. There is no private-wallet import or bailout grant.

The reset confirmation must explain that the new run receives its configured capital while remaining old cash and pending wager returns stay in the retired run. Show saved originating scope and distinguish those historical amounts from the new treasury; do not imply that resetting cashes out or transfers a pending bet.

Reset clears the run's buildings/upgrades, research, tower specialization/trees, crew, arsenal, layout, wreck/ship progress and island wave progress using their accepted initial-state rules. It preserves the island identity/code and membership. It does not clear arbitrary player cloud saves or account settings. It must retire active asset state without removing immutable construction/payment/refund, financial, wave, participation, personal-completion or ship-reward identities. A new building/copy uses a new instance identity; an old demolition/refund cannot act on its replacement.

Every player's personal Captain state survives equally, including the owner's acquired level, personal best, points, skills, role, personal snapshots/consumed completion effects and Engineer generation. Existing legacy mirror fields must not be reset in a way that can re-import or erase personal entitlement later. Reset cannot satisfy or clear an Engineer commitment. A reset on one island cannot release an assignment on another island.

An accepted countdown or active/unsealed reservation blocks reset. Wall-clock expiry alone does not permit clearing the reservation: canonical expiry/HP/session/inventory settlement must commit first. Closed personal receipts remain readable/claimable without current membership or current epoch; reading one cannot pay a second island reward. Reset must preserve the `wave_runs` data still required by existing canonical helpers, rather than relying only on the absence of a cascading foreign key from newer receipt tables.

## Proposed transaction seam

This section reserves behavior, not an activated RPC or final route signature. Existing legacy routes remain unchanged until integration supplies the complete transaction and compatibility guards.

1. Authenticate the owner and validate the shared mutation envelope, expected old epoch, confirmation code and client root `actionUid`. The client never supplies new account/epoch IDs or the starting grant amount.
2. Acquire the island scope guard, then existing account rows in deterministic UUID order. Claim the global player intent against the **old** account/epoch with domain action `lifecycle:reset`, before personal or domain row locks. Its fingerprint represents normalized request intent, including original scope and confirmation, not today's mutable prices or balances.
3. On an exact registry replay, load the original immutable reset result before checking today's phase, catalogue or current epoch. Do not apply the reset again. A different request/domain/account/epoch using the same actor/UID conflicts. The initial actor authentication and access boundary still apply.
4. For a new claim, recheck owner, current shared pointer/epoch, admission state, phase and reset prerequisites under locks. Preserve every open bet's original account and settlement identity; open bets are not a reset refusal. Acquire any required personal anchors/state before all affected physical island/domain rows; discover all touched scopes/rows before later locks. The public profile anchor uses `FOR NO KEY UPDATE`; dedicated personal rows use `FOR UPDATE`. No root claim or earlier scope/account lock may be introduced late.
5. Create the new empty account under the existing scope guard, retire the old account and apply all approved asset/recovery/session/inventory reset hooks in this same transaction. Recovery's reset epoch is a separate identity, not a substitute for the economy epoch. No network sequence may separately debit/grant and reset assets.
6. Credit the configured new-run capital with a server financial identity derived from the new epoch: `island_economy_system_uid(new_epoch, 'run_start')`, reason `starting_coins`, a run-specific reference and server-pinned grant configuration. An `fx_` child of the old-account reset operation cannot credit the new account: child proof deliberately requires identical root account/epoch. Zero configured capital, if authorized, still has one durable grant identity.
7. Store the immutable reset result and publish the new shared pointer atomically. A downstream refusal or failed hook rolls back root claim, both account changes, grant, pointer, asset changes and reset receipt. An injected failure after the grant must leave the old run fully intact.

The proposed additive receipt is `island_economy_reset_receipts`, keyed by the global operation UUID, with immutable actor/island identity, old account/epoch, new account/epoch, original request fingerprint, reset/grant policy version, grant receipt UUID, canonical reset time and original effect/counts. It records old balance, committed principal and financial revision at retirement as historical values; later original settlements may change the retired account without rewriting the reset receipt. Unique old-account and new-account identities prevent multiple replacements of the same run or duplicate publication of a replacement. It has restrictive account/ledger references and no cascading personal-profile foreign key. RLS denies browser access; direct writes and private helpers follow the treasury's restricted privilege model.

Its result separates the immutable effect (`oldAccountId`, `oldRunEpoch`, `newAccountId`, `newRunEpoch`, receipt IDs and original counts) from any authorized fresh `currentEconomy` projection. A delayed retry after several more resets must not promote its historical new account back to current or roll back the UI's current scope. An old reset UID cannot reset the later run.

The bounded foundation supplies this receipt/schema, strict immutable result parsing and one private treasury-transition helper, with isolated transaction/failure/concurrency tests. `island_economy_reset_treasury_locked(operation_id uuid, starting_coins numeric, grant_policy_version text, effects jsonb)` accepts only a matching already-claimed owner `lifecycle:reset` operation. Its encompassing caller must claim before personal/domain locks, prepare all earlier locks and apply the approved asset/recovery/session/inventory reset in the same transaction. The helper rechecks the current original account and idle boundary, including an unclosed MP-ECO-03 accounting snapshot even if old wave metadata appears closed. It preserves old cash/holds, creates/grants the new account and records the pointer/receipt once. Every refusal raises so the outer transaction can roll back the root claim and all prior effects; returning a refusal after an outer claim is insufficient.

The helper has no browser or service-role execute grant and no public route. It does not accept a client `hooksComplete` flag, initialize a Captain, perform guessed copy/session changes or make an incomplete reset available. A complete authorized domain wrapper is still required; final route DTO and public error mapping remain later integration contracts.

### Implemented private interfaces

Migration `20261118051600_island_economy_reset.sql` adds the restricted receipt table, immutable trigger, private result formatter and the helper above. `backend/server/island/island_lifecycle.py` validates results only; it exposes no network reset/grant operation. Its `read_result(value, context, action_uid)` requires the original owner/account/epoch and checks old/new separation, exact integral strings and current-projection scope.

The helper returns `{status:'done', repeat, currentEconomy, receipt}`. Receipt fields are `receiptId`, `actorId`, `actionUid`, `action:'reset'`, old `origin:{mode,version,islandOwner,accountId,runEpoch}` and `result:{newAccountId,newRunEpoch,retiredTreasury,startingCoins,grantReceiptId,grantPolicyVersion,effects}`. `retiredTreasury` has decimal-string `balanceCoins`, `committedCoins`, `availableCoins` and `revision`. `startingCoins` and every current money/revision value are also strings; `effects` contains server-derived nonnegative integer counts. They are not asset-cleanup authorization. Exact replay resolves before today's grant settings/phase/current pointer; `currentEconomy` is null after a later replacement and never republishes the historical run.

The server chooses the configured grant/policy; no client has direct execute access or supplies authority through those arguments. A new account's financial effect uses `sys_<new epoch UUID hex>_run_start`, including an authorized zero grant. A malformed/mismatched finance result raises `reset_grant_conflict` and rolls the outer transaction back. Other private refusals cover wrong root/owner, unavailable current scope, invalid configuration and unfinished waves; they are not a new HTTP error protocol.

Apply the entire migration in one `READ COMMITTED` transaction. Before FK/trigger DDL, all account/registry/ledger and existing-reset-receipt relation barriers are acquired with `NOWAIT` inside one retry/savepoint block; a partial set is released before waiting. Unsupported isolation raises `25000 island_economy_reset_requires_read_committed`; 30 seconds of contention raises `55P03 island_economy_reset_migration_busy`. Roll back and leave history unapplied on either error. Exact migration-tool transaction behavior and live execution remain release checks, not consequences of local tests.

## Outstanding obligations: retire the original run

The selected policy permits reset with outstanding island bets. Retirement stops new player spending on the old account; it does not transfer, erase, cancel or re-open its original financial obligations.

| Original state | Reset behavior | Later behavior |
|---|---|---|
| Uncommitted old available cash | Preserve its exact balance in the retired account; transfer none. | No new player spending or cash-out into the replacement run. |
| Open shared wager/position, including held principal and supported fees | Preserve the source reservation/product identity and original terms; allow reset. | Close, liquidate, void or refund once against the original account/epoch only. |
| Valid old canonical reward/refund/ship entitlement | Preserve its original economic origin and immutable eligibility evidence. | A valid delayed effect may reach only its original account; reset does not create eligibility. |
| Original personal bet or valid late legacy personal claim | Keep its personal origin and prior receipt identity unchanged. | Remain personal; never become either shared account's money. |

Positive committed principal is retained, not a reset blocker. It is not a complete product inventory: fees, liquidations, unsettled zero-principal products, ship sessions and pending canonical recovery journals also need explicit handling. The ledger cannot infer an arbitrary product's lifecycle from a balance. Before admission, every supported obligation needs a durable saved-origin settlement path; unsupported or unclassified origins are an implementation/admission gate, not an extra betting limit. An unsealed wave/recovery reservation still blocks reset until canonical closure.

Server completion/refund is authorized by the stored original operation, not renewed membership, presence or the current selected island. A player leaving or deleting their account does not cancel the island's valid source obligation. Replay of an already settled old bet returns its original effect. New player spending on any retired account is refused, including when the old owner/member remains authenticated.

Ship reward eligibility and score improvements follow MP-ECO-15's exact policy. Reset itself cannot claim/replay an old reward into the new run, and no migration reconstructs eligibility from today's lower `wave_best`. A genuinely new played attempt and its reward, if eligible under that policy, need new server-owned origin evidence.

## Account deletion and guest cleanup

Account deletion is distinct from resetting a run. An owner-account deletion deletes that owner's island after explicit destructive confirmation; it creates no replacement run or starting grant. It deletes the requesting player's private wallet/profile/Captain data according to the approved deletion policy, while preserving every other Captain's personal progress and a continuing island's communal assets and valid settlement authority. It does not transfer the owned island or select a successor.

Before profile cascades, the encompassing transaction must revoke the deleted player's controlling sessions/assignments using MP-ECO-11, and use MP-ECO-10's reserved-copy disposition. Outside a reservation, the continuing island's copy returns immediately. During a reservation, removal revokes control and records a pending return until canonical closure/expiry; it cannot make the same copy available to a second fighter. Browser reads or future reconnects are not the cleanup mechanism.

Missing personal state remains an error for canonical completion. MP-ECO-03 may omit the deleted player's personal hook only when an explicit, durable account-deleted disposition was established before deletion and is bound to the relevant player/attempt. Ordinary leave, disconnect, an unknown player UUID or a missing profile is not such proof. Other participants' existing receipts/progression and the island's one canonical payout must still complete atomically. The exact disposition helper and permissible retained identity are prerequisites, not invented APIs in this package.

The confirmed deletion removes the owned island's active assets/membership/session state using the checked canonical/copy disposition, while preserving other players' earned personal receipts and progress. It must first obtain the required canonical closure/disposition for reservations; a raw cascade is not that proof. A departing visitor's communal copies on another continuing island follow the return rule above, not the deleted owner's island disposition.

Historical financial accounts, operations, valid outstanding bets and required shared completion evidence must remain settleable against their saved original identity after the live owned island is deleted. Current restrictive account/state foreign keys require an explicit detachment of live-island ownership from retained historical origin; preserve original account/epoch keys and never retarget them to a surviving member. No new privacy retention period is selected here. Implement the approved minimum retained/de-identified facts and privacy/data-inventory contract before enabling deletion. The canonical participant disposition, copy lifecycle and historical identity schema are still prerequisites; this foundation implements no owner-delete executor.

Apply the same approved policy to interactive deletion and automatic/manual guest cleanup. Cleanup cannot invent the owner's explicit destructive confirmation; its authorization/consent and owned-island disposition must be defined before it handles admitted owners. Both paths must serialize against admission, bell, purchases and settlements. Discover affected continuing-island scopes/accounts before taking personal deletion locks; revalidate discovery before applying deletion so a concurrent join/admission cannot escape the inventory. A stale preflight alone is insufficient. The legacy mystery-crew/auth lock sequence cannot simply be prepended to a new economy transaction without concurrency proof.

The existing deletion response promises account data was removed. Do not answer success while merely pausing an island, retain a private profile indefinitely as an accounting workaround, silently skip protected guests forever or expose raw foreign-key errors as the product policy. Until a complete policy and privacy/data-inventory update are approved and tested, shared admission and destructive new-mode deletion remain gated. This preparation does not change production deletion behavior.

## Required checks before implementation is complete

- Owner succeeds; members/session leaders cannot reset/delete; confirmation and expected epoch are checked atomically.
- Exact reset retry, altered retry, cross-domain UID reuse and retry after later resets cause at most one replacement/grant and preserve current scope.
- Failure after root claim, old retirement, asset mutation, new grant and pointer publication rolls the complete transaction back; corrected retry remains possible.
- Races with purchase/demolition/refund, accepted bell, canonical close, ship claim, wager placement/settlement and another reset never duplicate money or resurrect old assets.
- Countdown, expired-but-unsealed and rescue-pending attempts block reset until canonical closure. Old unclaimed completion evidence and every personal Engineer generation survive.
- Reset with open bets preserves exact old available cash/held principal; fees, source reservation closure and late payouts/refunds remain in the retired origin after departure or actor deletion. The replacement account receives only its one configured grant. The confirmation explains that boundary.
- Legacy wallets/claims remain unchanged, old shared spends fail, and flags/old clients cannot route the admitted island through legacy reset.
- Deleting a visiting holder/starter/participant, including a 24-hour guest, preserves continuing-island copies, canonical closure and other Captains; missing-profile handling requires the exact deleted disposition.
- Explicitly confirmed owner-account deletion removes the owned island without a transfer/successor or starting grant, preserves other Captains and retains only approved settlement/history facts. Missing confirmation or canonical/copy disposition cannot reach destructive cascades. Retention handling is reflected in privacy/data inventory before admission.
- Disposable full-chain PostgreSQL tests exercise actual FK actions, privilege boundaries, apply/reapply and concurrent deletion/admission; Python/DTO tests verify strict decimal-string envelopes and immutable versus fresh projection separation.
- Independent human review approves the current diff before an authorized merge. No live migration, admission, deployment or route activation is inferred from local checks.

## Verification and remaining work

The feature additions are this spec, `island_lifecycle.py`, migration `20261118051600_island_economy_reset.sql` and focused Python/PostgreSQL tests. Initial local dependency integration used main `77a9e34d`, treasury `c12407e9`, personal Captain `ba351aa3`, wave accounting `8645ba18` and construction phase/guard `9a9ada32`. Shared prerequisite conflicts retain the newer treasury registry/fixture and personal-protocol corrections together with the wave contract; no existing route or application registration is changed by this feature.

The PostgreSQL tests use a synthetic owner-only transaction wrapper and a dummy asset row to prove atomic composition. This is deliberately not the missing production reset executor. They verify private treasury replacement, preservation of old obligations and personal tables, rollback and phase/idempotency/privilege boundaries, plus first/reapply/partial-barrier migration races on disposable databases. No complete asset reset, owner deletion, authenticated multiplayer, deployed schema, migration-tool invocation or live operation is claimed.

The outstanding-bet and owner-island policies are selected above. Next confirm MP-ECO-10/11 hooks and exact lock order, historical ownership detachment/de-identification and cleanup confirmation handling; use the reviewed treasury/registry dependency. Add only the bounded receipt/private-treasury foundation with meaningful failure/concurrency tests until those hooks exist. The final implementation must update INTERFACES, the Supabase policy matrix and affected deletion/privacy contracts together.

Verification on 18 Nov 2026, from `backend/` with a writable uv cache:

```sh
uv run pytest -q server/tests/test_island_lifecycle.py server/tests/test_island_treasury.py server/tests/test_island_treasury_store.py server/tests/test_economy_operations.py server/tests/test_wave_economy.py server/tests/test_personal_captain.py server/tests/test_captain_progression_routes.py server/tests/test_construction_store.py server/tests/test_construction_rules.py
# 192 passed in 4.95s, including 17 reset-receipt checks.
CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_island_reset_sql.py server/tests/island_sql/test_island_reset_migration_sql.py server/tests/island_sql/test_island_treasury_sql.py server/tests/island_sql/test_economy_operations_sql.py server/tests/island_sql/test_economy_operations_cutover_sql.py server/tests/island_sql/test_wave_treasury_settlement_sql.py server/tests/island_sql/test_shared_construction_sql.py server/tests/island_sql/test_personal_captain_sql.py server/tests/island_sql/test_personal_captain_operations_sql.py --tb=short
# 198 passed in 34.55s, including 28 reset/DDL cases; complete chain applied twice.
uv run ruff check .
# All checks passed.
```

The complete pglast check parsed all 74 migrations. Initial receipt tests failed on the absent module; the corrected SQL harness then failed on the absent helper before its implementation. No full-backend, browser, hosted backup, provider, deployment or live database test was run. Documentation link/content and whitespace checks complete this bounded increment; independent review and full lifecycle integration remain required.

### Large-value and migration-version follow-up

Independent review reproduced Python's ordinary decimal-to-integer digit ceiling in retirement conservation and fresh-grant comparison. Both paths now use the existing exact `treasury_models.decimal_integer` conversion; no process-wide digit setting or economic cap is changed. Four regressions at 4,301 and 5,001 digits first failed, then passed for retired cash/held principal and configured capital. Incorrect huge conservation and mismatched capital remain rejected.

After integrating main `64d59506` and treasury `feca459f`, the treasury schema filename is `20261118050050_island_treasury.sql`; its timestamp no longer collides with the existing `50000` migration. The same Python command above plus `server/tests/test_migration_versions.py` passed **197 tests in 4.12s**, including 21 reset-parser tests. The same combined PostgreSQL command passed **198 tests in 37.80s** on the updated complete chain. Full Ruff passed, and pglast parsed **78 migrations with 78 unique versions**. No live migration/tool invocation, route activation or additional publication is part of this follow-up.

Last updated: 2026-11-18.
