# MP-ECO-16: island reset and account deletion

> **What this is:** the lifecycle contract for replacing a shared island run without erasing personal progress or redirecting old obligations.
>
> **Who uses it:** reset, account-deletion, canonical-wave, arsenal and financial-settlement implementations and reviewers.

- **Status:** technical preparation; runtime implementation and admission remain gated below.
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

A successful reset creates a new server-generated account UUID and a new economy run epoch, retires the old account from new player spending and points the persistent shared-mode state to the new account. The economy version stays one. The new account receives the configured run-start capital once; neither balance nor reserved principal is transferred from the old account. There is no private-wallet import or bailout grant.

Reset clears the run's buildings/upgrades, research, tower specialization/trees, crew, arsenal, layout, wreck/ship progress and island wave progress using their accepted initial-state rules. It preserves the island identity/code and membership. It does not clear arbitrary player cloud saves or account settings. It must retire active asset state without removing immutable construction/payment/refund, financial, wave, participation, personal-completion or ship-reward identities. A new building/copy uses a new instance identity; an old demolition/refund cannot act on its replacement.

Every player's personal Captain state survives equally, including the owner's acquired level, personal best, points, skills, role, personal snapshots/consumed completion effects and Engineer generation. Existing legacy mirror fields must not be reset in a way that can re-import or erase personal entitlement later. Reset cannot satisfy or clear an Engineer commitment. A reset on one island cannot release an assignment on another island.

An accepted countdown or active/unsealed reservation blocks reset. Wall-clock expiry alone does not permit clearing the reservation: canonical expiry/HP/session/inventory settlement must commit first. Closed personal receipts remain readable/claimable without current membership or current epoch; reading one cannot pay a second island reward. Reset must preserve the `wave_runs` data still required by existing canonical helpers, rather than relying only on the absence of a cascading foreign key from newer receipt tables.

## Proposed transaction seam

This section reserves behavior, not an activated RPC or final route signature. Existing legacy routes remain unchanged until integration supplies the complete transaction and compatibility guards.

1. Authenticate the owner and validate the shared mutation envelope, expected old epoch, confirmation code and client root `actionUid`. The client never supplies new account/epoch IDs or the starting grant amount.
2. Acquire the island scope guard, then existing account rows in deterministic UUID order. Claim the global player intent against the **old** account/epoch with domain action `lifecycle:reset`, before personal or domain row locks. Its fingerprint represents normalized request intent, including original scope and confirmation, not today's mutable prices or balances.
3. On an exact registry replay, load the original immutable reset result before checking today's phase, catalogue or current epoch. Do not apply the reset again. A different request/domain/account/epoch using the same actor/UID conflicts. The initial actor authentication and access boundary still apply.
4. For a new claim, recheck owner, current shared pointer/epoch, admission state, phase, reset prerequisites and the selected obligation policy under locks. Acquire any required personal anchors/state before all affected physical island/domain rows; discover all touched scopes/rows before later locks. The public profile anchor uses `FOR NO KEY UPDATE`; dedicated personal rows use `FOR UPDATE`. No root claim or earlier scope/account lock may be introduced late.
5. Create the new empty account under the existing scope guard, retire the old account and apply all approved asset/recovery/session/inventory reset hooks in this same transaction. Recovery's reset epoch is a separate identity, not a substitute for the economy epoch. No network sequence may separately debit/grant and reset assets.
6. Credit the configured new-run capital with a server financial identity derived from the new epoch: `island_economy_system_uid(new_epoch, 'run_start')`, reason `starting_coins`, a run-specific reference and server-pinned grant configuration. An `fx_` child of the old-account reset operation cannot credit the new account: child proof deliberately requires identical root account/epoch. Zero configured capital, if authorized, still has one durable grant identity.
7. Store the immutable reset result and publish the new shared pointer atomically. A downstream refusal or failed hook rolls back root claim, both account changes, grant, pointer, asset changes and reset receipt. An injected failure after the grant must leave the old run fully intact.

The proposed additive receipt is `island_economy_reset_receipts`, keyed by the global operation UUID, with immutable actor/island identity, old account/epoch, new account/epoch, original request fingerprint, reset/grant policy version, grant receipt UUID, canonical reset time and original effect/counts. Unique old-account and new-account identities prevent multiple replacements of the same run or duplicate publication of a replacement. It has restrictive account/ledger references and no cascading personal-profile foreign key. RLS denies browser access; direct writes and private helpers follow the treasury's restricted privilege model.

Its result separates the immutable effect (`oldAccountId`, `oldRunEpoch`, `newAccountId`, `newRunEpoch`, receipt IDs and original counts) from any authorized fresh `currentEconomy` projection. A delayed retry after several more resets must not promote its historical new account back to current or roll back the UI's current scope. An old reset UID cannot reset the later run.

The exact account-creation helper, reset-policy schema/version, route DTO and migration timestamp are finalized with the complete dependencies. Safe additive work can first supply receipt/schema validation, immutable result parsing and isolated transactional tests without exposing a reset route or admitting shared islands. It must not introduce a generic unchecked account-switch/grant RPC.

## Outstanding obligations: decision required

Two policies are allowed by the agreed rules. Neither is selected here:

| Policy | Reset behavior | Settlement behavior |
|---|---|---|
| Refuse while obligations remain | Reject reset until all relevant open shared bets/positions and other unsettled run obligations are resolved. | Each settlement retains its saved source; after all blockers close, reset can proceed. |
| Retire with obligations | Permit reset only when every supported obligation has a durable saved-origin disposition and settlement implementation. | Complete/refund solely against the retired original account; no payout becomes available in the new run. |

Positive committed principal is a necessary blocker/detector, not a complete product inventory. Fees, liquidations, unsettled zero-principal products, ship sessions and pending canonical recovery journals also need explicit handling. The ledger cannot infer an arbitrary product's lifecycle from a balance. Unsupported or unclassified obligations fail closed. Old personal bets and valid late legacy personal claims remain personal; their existence must not redirect funds into either shared account.

Server completion/refund is authorized by the stored original operation, not renewed membership, presence or the current selected island. A player leaving or deleting their account does not cancel the island's valid source obligation. Replay of an already settled old bet returns its original effect. New player spending on any retired account is refused, including when the old owner/member remains authenticated.

Ship reward eligibility and score improvements follow MP-ECO-15's exact policy. Reset itself cannot claim/replay an old reward into the new run, and no migration reconstructs eligibility from today's lower `wave_best`. A genuinely new played attempt and its reward, if eligible under that policy, need new server-owned origin evidence.

## Account deletion and guest cleanup

Account deletion is distinct from resetting a run. It may delete the requesting player's private wallet/profile/Captain data according to the approved deletion policy; it must preserve other players' Captain progress and a continuing island's communal assets and valid settlement authority.

Before profile cascades, the encompassing transaction must revoke the deleted player's controlling sessions/assignments using MP-ECO-11, and use MP-ECO-10's reserved-copy disposition. Outside a reservation, the continuing island's copy returns immediately. During a reservation, removal revokes control and records a pending return until canonical closure/expiry; it cannot make the same copy available to a second fighter. Browser reads or future reconnects are not the cleanup mechanism.

Missing personal state remains an error for canonical completion. MP-ECO-03 may omit the deleted player's personal hook only when an explicit, durable account-deleted disposition was established before deletion and is bound to the relevant player/attempt. Ordinary leave, disconnect, an unknown player UUID or a missing profile is not such proof. Other participants' existing receipts/progression and the island's one canonical payout must still complete atomically. The exact disposition helper and permissible retained identity are prerequisites, not invented APIs in this package.

The owner-island policy is unresolved: deliberate owned-island deletion versus an explicitly authorized transfer, together with retained shared-account/actor identity. The current owner UUID is both a live `islands` key and part of immutable financial scope. Replacing that UUID or dropping restrictive foreign keys would alter historical origin; it is not a safe implicit transfer. A stable historical island identity or an approved detachment/redaction mapping requires a separate explicit schema decision. No automatic successor is chosen from members or session leaders.

Apply the same approved policy to interactive deletion and automatic/manual guest cleanup. Both must serialize against admission, bell, purchases and settlements. Discover affected continuing-island scopes/accounts before taking personal deletion locks; revalidate discovery before applying deletion so a concurrent join/admission cannot escape the inventory. A stale preflight alone is insufficient. The legacy mystery-crew/auth lock sequence cannot simply be prepended to a new economy transaction without concurrency proof.

The existing deletion response promises account data was removed. Do not answer success while merely pausing an island, retain a private profile indefinitely as an accounting workaround, silently skip protected guests forever or expose raw foreign-key errors as the product policy. Until a complete policy and privacy/data-inventory update are approved and tested, shared admission and destructive new-mode deletion remain gated. This preparation does not change production deletion behavior.

## Required checks before implementation is complete

- Owner succeeds; members/session leaders cannot reset/delete; confirmation and expected epoch are checked atomically.
- Exact reset retry, altered retry, cross-domain UID reuse and retry after later resets cause at most one replacement/grant and preserve current scope.
- Failure after root claim, old retirement, asset mutation, new grant and pointer publication rolls the complete transaction back; corrected retry remains possible.
- Races with purchase/demolition/refund, accepted bell, canonical close, ship claim, wager placement/settlement and another reset never duplicate money or resurrect old assets.
- Countdown, expired-but-unsealed and rescue-pending attempts block reset until canonical closure. Old unclaimed completion evidence and every personal Engineer generation survive.
- Selected obligation policy is tested against every supported product, including fees, source reservation closure, departed/deleted initiators and a replacement account receiving no old payout.
- Legacy wallets/claims remain unchanged, old shared spends fail, and flags/old clients cannot route the admitted island through legacy reset.
- Deleting a visiting holder/starter/participant, including a 24-hour guest, preserves continuing-island copies, canonical closure and other Captains; missing-profile handling requires the exact deleted disposition.
- Owner deletion/transfer, retained financial history and private-data erasure match the explicitly approved policy. Retention exceptions are reflected in privacy/data inventory before admission.
- Disposable full-chain PostgreSQL tests exercise actual FK actions, privilege boundaries, apply/reapply and concurrent deletion/admission; Python/DTO tests verify strict decimal-string envelopes and immutable versus fresh projection separation.
- Independent human review approves the current diff before an authorized merge. No live migration, admission, deployment or route activation is inferred from local checks.

## Verification and remaining work

This change is a specification only. Source inspection covered the current main deletion/reset/arsenal/recovery relationships and the local treasury/operation, wave-receipt, personal-Captain and conversion contracts. Runtime schemas/helpers, dependency integration, database tests and authenticated multiplayer behavior are not implemented or verified here.

Before runtime work, select the pending-obligation and owner-deletion/retention policies; confirm MP-ECO-10/11 hooks and exact lock order; settle the treasury registry migration's independent cutover review. Then add the bounded receipt/transaction foundation and meaningful failure/concurrency tests. The final implementation must update INTERFACES, the Supabase policy matrix and affected deletion/privacy contracts together.

Documentation link/content and whitespace checks are recorded after review. No application tests are required for this specification-only increment. Last updated: 2026-11-18.
