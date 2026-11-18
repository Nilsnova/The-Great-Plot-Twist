# MP-ECO-17 Existing save conversion design

> **What this is:** a preview and admission design for moving an existing island to the shared economy without copying personal money, losing assets or paying old operations twice.
>
> **Who uses it:** the MP-ECO economy, progression, inventory and release contributors and the teammate reviewing a conversion report.

- **Status:** draft design; executable conversion waits for MP-ECO-01–16 and MP-ECO-22 integration. No production snapshot, migration, conversion or admission is performed here.
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`).
- **Branch:** `docs/mp-eco-17-conversion`.
- **Issue:** [MP-ECO-17 #497](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/497), under [epic #492](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/492).
- **Source baseline:** repository revision `a0edb550`. Schema/source findings below describe this checkout, not an inspected live database.

## Why

Legacy coins belong to players, while buildings, research and arsenal copies can already belong to a different island. One player may contribute to several islands, hold a communal weapon and have an unsettled private bet. Their wallet balance cannot establish how much money any island owns. Conversion needs an explicit opening-funds policy and identity-preserving mappings rather than a sum of member balances or a replay of historical income.

The safe initial strategy is to preserve existing personal wallets and obligations, preserve island assets and acquired Captain entitlements, and create a separate treasury only under a reviewed admission manifest. Recommend a configured, once-only admission grant independent of member wealth, with no private-wallet debit; the grant amount and adoption of that policy remain product decisions. An absent policy is a blocking finding, never an implicit zero or inferred grant.

## Scope and dependencies

This package delivers the source inventory, proposed mapping, report contract, conservation checks, blocked cases and rehearsal plan. It changes only this spec. It adds no API, migration, runtime writer, new wallet reason or database access tool. Future executable work must use the integrated MP-ECO-01/02 account and transaction primitives rather than creating a second treasury implementation.

MP-ECO-01 defines semantic versions and action origins; 02 owns treasury/admission primitives; 03 preserves wave and personal-claim receipts; 04/05 own shared purchases and refunds; 07 owns Captain entitlements and Engineer commitments; 09/10 own copies and holder deletion; 11 owns admission/active-wave boundaries; 13 owns retired effects; 14/15 own bets and ship rewards; 16 owns reset/owner deletion; 22 supplies the selected owner-reset recovery behavior. MP-ECO-20/21 own authenticated acceptance, release ordering and any separately approved live operation.

The agreed shared response envelope is supplied by MP-ECO-01, not redefined here: `economy` identifies mode `island_shared`, version `1`, `islandOwner`, UUID `accountId`, UUID `runEpoch`, decimal-string `revision`, and `treasury` decimal strings `balanceCoins`, `committedCoins`, `availableCoins`. Balance includes held principal; `availableCoins = balanceCoins - committedCoins`. An account/epoch is fixed for one run. Reset creates new identities; pausing admission/offers does not restore legacy accounting. Missing-table/read failures never mean legacy mode.

## Source inventory and disposition

Use the latest definition in the complete migration chain, not only the first schema comment. The following are the source families a snapshot/report must cover; unknown money-bearing or asset-bearing origins block the affected conversion.

| Source | Current origin and identity | Proposed disposition |
|---|---|---|
| [Personal wallets and ledger](../backend/server/wallet.py), `wallets`, `wallet_transactions`, `wallet_reasons` | Player-owned balance and unique `(player, reason, ref)` transactions. Starting, kit, loot, market, sports, duel, build and reset money share one wallet. | Preserve balances, ledger and existing uniqueness. Do not move, pool, subtract, regrant or relabel personal cash at admission. Keep legacy money routes explicitly scoped. |
| [`islands`](../supabase/migrations/20261111030000_tower_defense.sql), `island_members` | `player_id` is both island owner and location of Captain fields; membership is separate from online presence. `wave_best`/`next_wave`/flags and hired counts describe the island. | Preserve island identity, membership and island progress. Split Captain facts by stable player identity under 07; admission into two islands must not duplicate a Captain or personal entitlement. |
| [`islets`, `islet_buildings`](../supabase/migrations/20261106070000_home_islet.sql), [`island_layout`](../supabase/migrations/20261114110000_island_layout.sql) | Legacy timber is player-owned; buildings use owner, plot and purchase `ref`, plus current level/spec/trees and later instance identity. Layout stores island positions. A cabin is protected. | Preserve each live structure, purchase/instance identity, kind, level, equipped choices and effective position. Do not introduce material consumption or import personal timber without a separately agreed materials policy. Legacy non-island plots remain explicitly outside this conversion. |
| [`building_payments`, `building_demolitions`](../supabase/migrations/20261112080000_demolish.sql) | Per-building/level actual paid contributions and `refunded_by`; legacy demolition can pay several personal wallets. Null payer and missing payment are different cases. | Preserve provenance and already-refunded facts. Map each eligible live-asset refund right once to the shared path under 04. No admission refund; no simultaneous old private and new island refund. Unknown actual cost needs an approved mapping, not today's catalogue price. |
| [`island_research`, wreck funding](../supabase/migrations/20261112060000_tech_hub.sql), tower skills/trees | Research belongs to the island, records actual total contributions, and has later tier choices. `wreck_paid` and structure specialization/tree columns are acquired island progress. | Preserve achieved progress and actual payments. No refund, compensation or new research purchase is implied by conversion. Resolve retired-only effects through 13 before offering replacements. |
| [`arsenal_copies`, `arsenal_moves`](../supabase/migrations/20261114120000_arsenal.sql) | Identifiable island copies, copy number, source, buyer and holder; stored-copy limit currently excludes held copies. Old `weapons_owned` may still have unconverted entries. | Preserve every copy ID and provenance; reconcile the old weapon-conversion state before mapping residual entries. Never rerun conversion by weapon type alone. Grandfather stock above the new total cap; permit returns and block new buys as agreed. |
| [Captain progress reads](../backend/server/island/store.py), `captain_skill_learns` | Level/skills/role and `won_wave_best` are on the player's `islands` row. Purchase unlocks take `max(wave_best, won_wave_best)`, but skill points use only personal `won_wave_best`. | Preserve acquired level/skills and genuine earned/unspent points. Keep purchase-unlock history distinct from point entitlement and retained participation evidence. Never invent personal wins or extra points from an owned island record. Future awards use durable personal receipts. |
| [`wave_runs`, `wave_participants`, wave rules](../supabase/migrations/20261117025000_legacy_wave_locks.sql) | Island outcome and participant claims are distinct. Closed waves may still have unpaid personal participant claims. | No active/unsealed reservation at admission. Pin all old wave accounting to personal legacy version 0; old late payments remain personal and never also generate a shared reward. Preserve outcome and claim identities even when the initiating visitor disappears. |
| [`recovery_wave_*`, structure health and repair receipts](../supabase/migrations/20261117020000_structure_recovery.sql), [latest settlement](../supabase/migrations/20261118040000_playtest.sql) | Recovery has independent wave snapshots, participant tokens, events/checkpoints, health/instance identity, epochs and paid receipts. Latest normal wave settlement restores full structure health. | Audit both protocols and outstanding journals, not only `wave_runs`. Preserve receipts and identity; do not reuse a recovery epoch as an economy run epoch merely because both are named epoch. An unsealed canonical recovery settlement blocks admission; a closed wave's unpaid personal claim stays pinned to legacy accounting. |
| [`market_calls`](../supabase/migrations/20261111010000_market_calls.sql), [Exchange positions/events](../supabase/migrations/20261106090000_exchange_leverage.sql) | Calls, principal, fees, refunds, close/liquidation and payout origins are private player accounts. Some positions remain open long after the player changes islands. | Keep original private recipient/mode, including settlement after admission. Do not seed a treasury with held principal or mark-to-market position value. New shared bets use 14's origin account/epoch and unrestricted available-funds rule. |
| [`sports_stakes`, fixtures](../supabase/migrations/20261106180000_sports_desk.sql), [prediction stakes](../supabase/migrations/20261106100000_prediction_desk.sql), [duels](../supabase/migrations/20261106110000_lantern_duels.sql) | Private stake/participant origins; some old products are inactive but still have retained rows or future refunds. | Preserve each existing obligation and its settlement/void identity in its original context. Do not treat an inactive feature as proof of no obligations. Do not transfer other participants' principal in a shared pool. |
| [Ship reward refs](../backend/server/island/boat.py), reset and transaction receipts | Ship refs are currently per player/island/best-wave/game. Existing reset can delete island history and personal Captain fields. | Preserve previously claimed reward identities and agreed cap transition; do not reopen paid ship rewards at admission. Do not call the old `island_fresh_start()` to convert an island. New resets preserve personal progress and Engineer generations. |
| [Account deletion](../backend/server/account/deletion.py), [guest cleanup](../backend/server/demo/guests.py) | Account deletion reaches SQL `delete_player`; cleanup uses the same path. Current cascades can erase a visitor-held communal copy and a continuing island's wave started by that visitor. | Both explicit deletion and cleanup must have 10/16's continuing-island safety before admission. See deletion gates below. |
| Saves, settings, appearance, class Harbor, Pirate Point and legacy story records | Distinct personal or shared-place origins, not all encoded in an island's ledger. | Leave untouched except for an explicitly mapped personal entitlement reference. Do not clear cloud saves, import unrelated balances or copy shared-place assets into an island. |

All current wallet reasons are classified below. A future reason not in the reviewed snapshot schema is an unmapped-origin blocker. The reason name alone cannot decide which island owned an old purchase: resolve its source operation, location and identity.

| Legacy reason family | Admission treatment |
|---|---|
| `kit_grant`, `clue_reward`, `mystery_reward`, `event_reward`, `cargo_sale`, `clue_purchase`, `admin_adjust` | Personal/legacy history stays unchanged; no replay, refund or treasury seed. |
| `starting_coins`, `fresh_start` | Preserve actual historical grant/adjustment; do not rerun island-open or reset logic to infer a new grant. |
| `building_purchase`, `building_refund` | Disambiguate home, visited island, Pirate Point and repair origins. Preserve completed payments/refunds and map only eligible live-instance future entitlements. |
| `market_buy`, `market_sell`, `market_fee`, `market_stake`, `market_payout` | Preserve historical/private Exchange positions, events and all fees/close/liquidation/refund terms, including inactive reason names. |
| `market_call_stake`, `market_call_payout` | Original private call and recipient remain private. |
| `prediction_stake`, `prediction_payout` | Resolve sports versus old prediction-pool operation IDs; do not retarget either to the current island. |
| `arena_stake`, `arena_payout` | Preserve each duel participant's original private principal and payout/void claim. |
| `pirate_loot` | Existing personal receipts remain personal; do not turn historical per-player payouts into a new shared wave grant. |
| `crew_hire`, `captain_upgrade`, `captain_respec`, `captain_revive` | Preserve consumed private payments and their acquired/consumed benefit; future free progression/revival does not reimburse old spending. |
| `weapon_purchase` | Resolve old personal-weapon versus arsenal-copy source identities; preserve acquired stock without a repeat purchase/conversion. |
| `tech_research`, `wreck_repair`, `tower_skill`, `tower_tree` | Preserve acquired island progress and actual payment provenance; no new refund eligibility is invented. |
| `boat_game` | Preserve per-player paid claim refs; explicitly map the new cap's claimed state without refreshing old reward opportunities by accident. |

### Actual cost and refund lineage

Use `(island owner, building purchase/instance identity, level)` and the original operation identity, never the current plot alone. A replacement building on the same plot is a new object. An Engineer's discounted actual payment is the upper cost basis; an undiscounted catalogue amount cannot be substituted. Coins spent on research/skills/trees are refundable only if 04/05's contract expressly makes them eligible.

`building_payments.refunded_by` and the completed demolition/ledger receipt jointly establish already paid refunds. A row whose payer became null retains its cost and refund state but does not mean the host paid. A historically missing payment row currently falls back to host/catalogue cost in `island_refund_split`; that fallback is not proof of actual spend. Report it as `missing_actual_cost` and block automatic entitlement mapping until an explicit historical-cost policy is approved. Do not guess from today's price, wallet balance or an approximate payment timestamp.

For a reviewed mapping, retain original contribution rows as historical provenance and attach one new-mode entitlement disposition to the live building identity. The disposition names its target account and eligible actual amounts; it creates no cash. Converted entities must be refused by old private-refund mutators, including old tabs and queued UIDs. A completed old demolition is a completed old operation, not a live shared refund entitlement.

### Captain entitlements and retired skills

The report records each affected player's acquired level, role, exact known skill IDs, old catalogue version/costs, earned/spent/unspent points, personal `won_wave_best` and available participation receipts. [Current `skills_of()`](../backend/server/island/service.py) passes only `won_wave_best` to [the point calculation](../backend/server/island/rules.py): earned points are `won_wave_best // wavesPerPoint`, spent points are known skill costs, and visible unspent points are `max(0, earned - spent)`. An island's `wave_best` affects legacy purchase unlocks, not this point calculation.

Preserve these genuine legacy earned and unspent points as a marked migration baseline, then award only later personal milestones not covered by it. The stored personal aggregate may outlive detailed wave history; retain its provenance without fabricating individual win receipts. Keep owned-island best as a separate audit field. Preserve an already acquired Captain level even if its historical purchase unlock used the island record; do not convert that purchase reachability into extra points or unbought levels. Unknown skill costs, negative point reconciliation or conflicting source facts block automatic mapping rather than silently erasing skills or minting points.

D059 selects preservation of retired IDs/history and normal point accounting, without active repair effects, automatic replacement, refunds, respec tokens or a compensation subsystem. Ordinary free respec follows the actual saved allocation and personal assignment/Engineer guards. Preserve `earnedBefore = earnedAfter` and `earnedAfter = spentAfter + unspentAfter` under the approved entitlement baseline; no cost is counted twice and no extra earned points are minted. Existing retired choices alone cannot block ordinary mutations or wave admission. Island-owned repair research/crew retains its acquired tier/count/history separately from personal skills.

Preserve any existing Engineer commitment ID/generation and its qualifying wave snapshot/receipt. If a generation does not exist before the rule is enabled, do not retroactively bind historical discounted buyers. Admission/reset cannot clear an already valid new-mode commitment; a late W1 receipt may satisfy C1, never a later C2 obligation. Multi-island admission references the same personal record once.

## Product decisions and mechanical requirements

| Policy or mapping before affected admission | Selected rule or remaining proposal | What is already mechanical |
|---|---|---|
| Treasury opening policy and exact grant | Retain private money; a once-only configured admission grant unrelated to member wealth. Amount and policy approval are pending, not inferred from `startingCoins`. | Fixed origin key and receipt per island/account/epoch/manifest; an identical retry cannot mint again. |
| Legacy contribution/missing-cost disposition | Transfer only approved live-asset refund eligibility to the island path, with real cost evidence; unresolved historical amounts block the affected mapping. | Preserve old rows, source refs, null-payer distinction and already-refunded flags; never pay two recipients. |
| Retired-skill and catalogue mapping | Preserve genuine earned/unspent points, retired IDs/history and normal spent accounting under D059; no automatic replacement or compensation. Only explicit ordinary respec releases the actual allocation. Source anomalies need explicit resolution, not an island-best points grant. | Earned baseline derives from personal `won_wave_best`, with stable player identity, covered milestones and repeat-safe accounting. |
| Residual personal weapon ownership and new total capacity | Reconcile existing converted copies first; preserve every acquired copy and grandfather overflow. The selected total is 20 special copies; unresolved residual mapping follows 09/10's reviewed policy. | IDs/source refs, one holder/location, no type-based deduplication or drop; returns do not fail due to grandfathered overflow. |
| Old-run shared obligations at reset | Reset is allowed with open island bets. Retire the old run from new spending; old cash, holds and all later payouts remain solely there, as explained in confirmation. | A new run uses new account/epoch; no payout retargets the current island. Existing private bets stay private. |
| Owner account deletion and guest cleanup | Confirmed owner-account deletion also deletes its owned island, with no successor/transfer. Preserve other Captains and continuing-island assets; implement permitted historical-origin detachment without indefinite private-profile retention. | Safe continuing-island copy/history handling, deletion/admission serialization and privacy-preserving actor references. |

Unrestricted shared wagering, equal invited-member spending/research reversal/demolition, owner-only reset/deletion and owner-reset recovery are settled rules. This package must not introduce a percentage budget, extra approval, private-money bailout or easy recovery wave to make conversion balances look safer.

## Offline input and report contract

The future auditor accepts a supplied, consistent snapshot plus a reviewed policy manifest. It has no database credentials, network client, mutation RPC or automatic admission switch. A collector for a later authorized rehearsal is a separate reviewed operation. Never use `island_open`, `arsenal_state` or another mutating-on-read service to collect the snapshot.

All coin/count quantities that can exceed JavaScript's exact range are canonical base-10 integer strings. Reject floats, booleans, signed zero, truncation, duplicate identities, unknown schema variants and missing required source families. Distinguish an expected absent legacy row from a failed read. Use keyed, sorted source rows and a canonical digest; record source schema/catalogue/code versions so re-running the same input produces the same decisions and proposed changes.

### Input fields

| Field | Required contents |
|---|---|
| `snapshotVersion`, `snapshotId`, `sourceRevision`, `schemaVersion`, `catalogueDigests`, `capturedAt` | Versioned snapshot identity, actual source provenance and timestamp; no claim that a repository schema hash proves a live schema. |
| `island` | Stable owner/island identity, code kept private, current mode/account pointer if any, island fields/memberships and source row fingerprints. A missing known-island proof is invalid input. |
| `privateAccounts` | Relevant player wallet/ledger balances, observed held principal by unique obligation ID, private settlement/refund refs and fingerprints. Include every referenced contributor/holder/participant needed for provenance, not all unrelated player data. |
| `islandAssets` | Identity-keyed buildings/levels/layout/health, payment/refund rows, research, wreck/crew and all arsenal copies/moves/residual personal weapon facts. Unknown or unsupported families are findings. |
| `personalProgress` | Stable player keys, acquired fields, earned/spent/unspent points derived from personal `won_wave_best`, separate island purchase-unlock history/retained participation evidence, retired-skill inputs and any Engineer commitment/receipt generation. |
| `operations` | Legacy/recovery waves and claim states, every unresolved stake/position/refund/ship claim, original account/mode/version and operation fingerprint. An old context without an account row is explicitly `personal_legacy`, never backfilled from current membership. |
| `deletionAudit` | Relevant owner/member cleanup candidacy and chosen deletion disposition, actor-reference hazards, required retention/redaction policy and whether 10/16's protections are present. No tokens, credentials, email addresses or auth provider payloads. |
| `policyManifest` | Manifest ID/version/digest, selected decision references and exact opening amount/mappings. Unresolved items are explicit `null` with stable blocker codes, never permissive defaults. |

### Output fields

| Field | Exact meaning |
|---|---|
| `reportVersion: 1`, `snapshotDigest`, `policyDigest`, `sourceRevision` | Deterministic binding to the audited input and proposed policy. A report alone is not approval or an executable command. |
| `eligibility` | `blocked` or `rehearsal_ready`; never `live_approved`. Ready requires no unresolved blocking finding and does not bypass later review. |
| `sourceEconomy`, `proposedEconomy` | Current explicit origin and proposed shared envelope. Proposed account/epoch are planned UUID identities only; unresolved grant/mapping leaves `proposedEconomy` null. A preview creates no account. |
| `findings[]` | Stable code, blocking/nonblocking severity, source identity, invariant/decision and required resolution. No inferred compensation amount. |
| `money[]` | Per original account: before, conversion delta, projected after, original obligations/committed principal and source. A proposed grant is labeled new authorized issuance, never “transferred player money”. |
| `assets[]`, `progress[]`, `operations[]` | Before/proposed-after identity and provenance; a disposition reason and policy ref for every changed field. Explicit `unchanged` is valid and auditable. |
| `invariants[]` | Named equality/set check with `pass`, `fail` or `blocked`, observed/expected values and related identities. No pass if required inputs are missing. |
| `totals` | Separate personal cash, personal held principal, shared balance/committed/available and per-family asset counts; do not sum a marked-to-market position value as new cash or double-count pooled principal. |
| `writeSetDigest`, `readPreconditions[]`, `receiptIdentity` | Exact proposed mutation/entitlement mapping and source guards for a later reviewed implementation. An altered policy/snapshot cannot reuse an old approval/receipt. |

Use an internal operator report with necessary source keys for reconciliation and a separately redacted shareable summary. Do not publish real snapshots, island codes, private ledger histories or stable personal IDs in issues, screenshots, fixture files or this spec. Hashing IDs alone is not proof that a report is anonymous. Define deletion/retention and access before collecting real inputs; keep only synthetic fixtures in the repository.

### Synthetic blocked example

The following is an illustrative report fragment, not a live account or a chosen opening grant. The complete auditor input/output includes the required families above.

```json
{
  "reportVersion": 1,
  "eligibility": "blocked",
  "sourceEconomy": {"mode": "personal_legacy", "version": 0},
  "proposedEconomy": null,
  "money": [
    {"accountKey": "synthetic-player-A", "beforeCoins": "1000", "conversionDeltaCoins": "0", "projectedAfterCoins": "1000"},
    {"accountKey": "synthetic-player-B", "beforeCoins": "300", "conversionDeltaCoins": "0", "projectedAfterCoins": "300"}
  ],
  "totals": {"personalCashCoins": "1300", "personalHeldPrincipalCoins": "50", "proposedSharedGrantCoins": null},
  "findings": [
    {"code": "opening_policy_required", "severity": "blocking"},
    {"code": "missing_actual_cost", "severity": "blocking", "sourceKey": "synthetic-building-7-level-1"}
  ],
  "invariants": [
    {"name": "private_cash_unchanged", "status": "pass", "before": "1300", "after": "1300"},
    {"name": "opening_issuance_authorized", "status": "blocked"}
  ]
}
```

The private held principal remains its existing private obligation; it is neither deducted again from those cash balances nor added to the proposed island treasury. A missing actual cost does not delete the building or fabricate a refund.

## Conservation and idempotence invariants

1. **Cash origins:** conversion alone has `delta(private wallet) = 0` for every player. Under the recommended approved grant `G`, the new shared account has `balance = G`, `committed = 0`, `available = G`. Total new cash issuance equals exactly the recorded grant, not a sum of personal balances, historical income or held principal. An alternative policy needs its own explicit balanced entries and approval.
2. **Obligations:** each existing operation ID keeps its original recipient, mode and economic terms. Private principal/fees/payout claims are unchanged by conversion. A late legacy payout may change a private wallet through its own transaction; it is not a conversion delta or a source for the new treasury. Deduplicate pooled obligations before calculating principal totals.
3. **Assets:** compare identity-preserving sets, not only counts. Each old live building/copy has exactly one mapped live identity with the same acquired attributes, except explicitly approved transformations. Completed demolitions remain completed. Residual weapon claims cannot create a copy if that exact source was already converted.
4. **Refunds:** each eligible live-asset payment has one approved future refund path, with actual paid cost and already-refunded state preserved. Admission generates no demolition income. Old and new mutators cannot both consume the same entitlement.
5. **Personal progress:** acquired entitlement is not reduced or multiplied by island membership. Imported baselines are marked and covered milestones cannot pay twice. Retired IDs/history and normal spent-point accounting remain under D059; only an explicit ordinary respec releases the actual allocation once. Each Engineer generation is preserved or satisfied only by its recorded qualifying wave.
6. **Run and receipt identity:** one successful manifest/admission receipt creates one account/epoch and at most one opening grant. Same receipt plus identical fingerprint returns its original result; changed payload or stale source fails before mutation. A different manifest ID, operation UID or proposed account/epoch cannot admit an already shared island again. Reset is a new authorized run through the reset path, not another admission retry.
7. **Scope:** unrelated islands, personal saves/settings and shared-place assets are unchanged. Current island membership cannot replace a financial operation's originating account.
8. **Privacy and deletion:** preserving continuing-island accounting/copies must not silently retain a deleted person's private wallet, credentials or personal profile. Source-key redaction and permissible shared-history retention are explicit requirements of the deletion policy.

## Admission and recovery sequence for later implementation

1. **Audit offline.** Produce a blocked or rehearsal-ready report from a consistent supplied snapshot. Resolve required policies in the manifest and repeat the audit. No database row changes, grants or collector side effects occur.
2. **Prove readiness.** Integrated 01–16/22 contracts, all converted mutation guards, known source schema, approved point/refund/weapon maps and explicit deletion/cleanup handling must be present. Reject unknown operation origins. An island with an active or unsealed wave/recovery journal cannot be admitted.
3. **Revalidate at one boundary.** Use 02's agreed lock order and island/deletion/mutation boundaries. Match the protected source fingerprints, policy/write-set digest and source mode. Include asset, refund, personal-entitlement and original-obligation guards. A concurrent deletion, bell, contribution, refund, personal mapping change or unmapped obligation invalidates the preview. Ordinary private settlements remain private and are reconciled as independent operations; never convert their proceeds implicitly.
4. **Commit atomically.** Create planned account/epoch with its fixed grant origin, install all approved mappings/origin pins and the durable admission receipt, then publish the shared-mode pointer in the same transaction. Before commit, errors roll back every change. No user may see a shared pointer while part of the money/asset paths still use legacy funding. Original private bets and closed-but-payable legacy waves stay legacy.
5. **Verify and pause safely.** Reconcile exact sets, balances, obligations and personal entitlement against the report/receipt. Any failure pauses new actions/admission through the persisted shared state. Server settlement of a valid original obligation follows its recorded account, even after its initiating actor leaves; it does not require renewed membership.
6. **Recover without replay.** A failure before atomic commit leaves the original state. After commit, do not remove the shared pointer, delete ledger history, rerun a fresh start or restore a stale asset snapshot over later actions. Pause and use a reviewed corrective/compensating plan referencing the committed receipt. Retired run accounts reject new spending but honor only the selected old-obligation policy; turning a feature flag off never re-enables personal payouts for an admitted island.

Closed legacy waves with later personal claims require a durable version-0 origin/outcome pin before admission. The current schema's absence of an explicit economic version is not permission to reinterpret them as new shared waves. A paid old participant claim can be replayed idempotently in its old context but must never create island loot. Do not archive only `finished_at is null` records and assume all other financial work is finished.

## Deletion and guest cleanup gates

The latest [legacy `delete_player()`](../supabase/migrations/20261106140000_followups.sql) transfers ownership of old mystery crews and then deletes `auth.users`; it does not implement island transfer. Owner deletion currently cascades the island. Additionally, `arsenal_copies.holder` cascades with a visiting profile, and `wave_runs.started_by` cascades even when another player owns the continuing island. Existing recovery participant/receipt links and building demolition audit rows have further actor cascades; `building_payments.payer` instead becomes null. These are distinct cases, not interchangeable missing rows.

[Automatic guest cleanup](../backend/server/demo/guests.py) uses the same deletion path for eligible anonymous accounts older than 24 hours from account creation, not 24 hours of inactivity. Current membership, playing now or having an open obligation does not by itself protect a guest. Manual deletion and cleanup must participate in the same 10/16 deletion/admission policy and serialization; checking only the interactive delete endpoint is insufficient.

Block admission if the implementation cannot preserve continuing-island weapons/outcomes/operation proofs while applying the agreed deletion policy. Owner-account deletion deletes its owned island after explicit confirmation, with no successor or transfer; implement this selected rule and the approved shared-history retention/de-identification contract. Do not copy old crew-handover behavior, silently skip cleanup forever or keep private identity data merely for convenient reconciliation. Real snapshot collection and release must honor [the privacy notice](../docs/PRIVACY.md).

## Counterexamples and future rehearsal cases

| Supplied scenario | Required report or later behavior |
|---|---|
| A player with 1,000 coins belongs to three islands | Report the same unchanged personal account; no island receives that 1,000 or a proportional guess. Only independently approved admission issuance can fund each treasury. |
| A 50-coin private bet settles after admission on another island | Its principal was already committed in the old context. Payout/refund still reaches the original private wallet; shared balance and opening grant are unchanged. |
| A visiting starter/holder is a guest eligible for cleanup | Flag both wave-history and weapon cascades; admission remains blocked until deletion protections exist. A stale pre-cleanup audit cannot be applied. |
| Two live rifles plus a residual `weapons_owned` rifle entry | Reconcile exact source receipts before adding a residual copy. Neither deduplicate legitimate same-type copies nor grant a third copy merely because the type is present. |
| Existing stored plus held copies exceed the new total capacity | Preserve every copy and valid holder/return mapping; new purchases remain blocked under the agreed cap. Do not delete overflow or fail a return. |
| A building has discounted payments, a null payer, a refunded level or no historical cost row | Preserve all four facts distinctly. No catalogue inflation, second refund or invented host contribution; unresolved entitlement mapping blocks conversion. |
| A plot was demolished and rebuilt using the same plot name | Old completed refund cannot attach to the replacement instance; map purchase/instance identities, not positions. |
| Host island best is 80 and personal `won_wave_best` is 4 | Preserve acquired level/skills and calculate legacy points from 4, never 80. Report retained receipt evidence separately; do not fabricate wins 5–80, grant unbought levels or infer extra points from purchase unlocks. Future offline team wins cannot advance the personal record. |
| A repair-only skill is retired after its point cost was spent | Preserve IDs/history and ordinary spent/earned accounting under D059; free respec uses the actual allocation without extra compensation or clearing an Engineer commitment. |
| Late W1 receipt and a newly created Engineer obligation C2 | A receipt may only satisfy its pinned C1 generation. Admission/reset cannot clear C2 or bind historical buyers retroactively. |
| A legacy wave is closed but one participant has not claimed | Keep version-0 personal claim and outcome; no new shared reward. Actor departure does not erase an otherwise valid new receipt, subject to deletion/retention policy. |
| A private bet settles while a report is waiting for review | Reconcile the independent old-origin transaction; do not use the new balance as an admission seed or silently retarget the bet. Protected mapping changes still require a new report. |
| Same manifest applied twice, altered payload reused, or failure between account creation and pointer publication | Identical retry returns one original receipt/grant. Altered/stale input is rejected. Any precommit failure leaves no partial account/asset/mode change. |
| Owner resets after admission, or a flag is disabled later | New reset account/epoch receives only its authorized starting grant. Old operations retain their origins; no legacy payout fallback, replayed admission grant or resurrected asset snapshot. |
| Members demolish defenses and lose every available coin | Apply the chosen owner-reset recovery rule. Valid pending payouts/available ship rewards and ordinary free attempts remain usable; no migration bailout or private funds import is created. |

## Done when

For this design contribution:

- [x] Source links and the source-family inventory match `a0edb550`; all 24 local link targets exist, all 33 current wallet reasons are inventoried, the illustrative JSON parses and preserves private cash, and the staged diff passes `git diff --cached --check`.
- [ ] Integrated MP-ECO-01/02 dependency commits match the account/epoch, held-principal, grant and origin contracts before executable rehearsal; open policies are explicitly identified rather than guessed.
- [ ] A different human teammate reviews the current change.

For executable conversion in a later implementation contribution:

- [ ] A pure offline auditor validates the exact input/report contract and produces deterministic reports from synthetic fixtures; invalid/missing/unknown inputs fail closed.
- [ ] Rehearsal tests cover every counterexample above, source/manifest mismatch, SQL failure rollback, concurrent deletion/admission/refund, late old claims and repeat conversion.
- [ ] Approved opening, personal-point/retirement, refund, inventory and deletion maps are bound to the report/receipt. Identity sets and cash/obligation/entitlement invariants pass before and after rehearsal.
- [ ] Reconciliation and pause/recovery evidence is reviewed under MP-ECO-20/21. Exact future test commands are recorded with that implementation; no tests or live checks are claimed merely because they are planned here.

## Contracts and verification status

This design adds no current public or database contract. It consumes the MP-ECO-01 economy envelope and proposes only an internal offline snapshot/report and admission-manifest contract for later review. Future implementation updates its route/migration comments, INTERFACES and database policy matrix in the task that owns those changes. `island_economy_state`, account identities, treasury mutation functions and shared code remain owned by 01/02 and are not edited here.

**Verified:** source inventory at `a0edb550`, all 24 local link targets, all 33 wallet reasons, the illustrative JSON/private-cash equality and staged diff whitespace. **Not verified:** integrated foundation commits, live data, applied schema, live cleanup behavior, actual conversion, authenticated clients, balance or rollout; no app tests are needed for this documentation-only contribution. **Remaining:** product mappings, integrated prerequisites, executable audit/rehearsal and independent human review. **Reviewer:** a different human teammate, not assigned by this draft. **Last updated:** 2026-11-18.
