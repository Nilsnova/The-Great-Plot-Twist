# MP-ECO-01: shared island economy implementation contract

> **What this is:** the account, authorization, receipt and transaction contract for implementing the approved multiplayer economy without mixing it with existing personal wallets.
>
> **Who uses it:** implementers, reviewers, migration authors and clients of the shared economy API.

- **Status:** implementation contract draft; no runtime activation or release.
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`).
- **Branch:** `docs/mp-eco-01-contract`; updated against `origin/main` at `f0c64442`.
- **Issue:** [MP-ECO-01 #493](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/493), under [epic #492](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/492).
- **Rule source:** the 18 Nov shared-economy target in [planning PR #491](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/491), plus the explicit Engineer and owner-reset recovery choices recorded in the task. This spec selects implementation mechanics, not new balance values or Carpenter effects.

**Dependencies:** MP-ECO-02 consumes the context/account contract; 08 consumes authority/phase; 18 consumes the DTO; 17 consumes conversion boundaries. Their implementation and integration remain separate from this documentation change.

## 1. Scope and existing contracts

This contract changes no runtime behavior. Implementation puts API contracts in route comments/models, database contracts in additive migration comments and the Supabase policy matrix, and the overview in [INTERFACES](../docs/INTERFACES.md). Those integration updates remain necessary; the listed fields and RPCs are not yet live.

Existing [wallet.py](../backend/server/wallet.py) and `apply_wallet_transaction` remain the personal-wallet implementation. Their old maximum transaction size, ledger identity and player ownership must not silently become shared-mode rules. The shared account uses one new atomic treasury primitive, selected by the resolver below; individual routes never directly update account balances. This is the explicit shared-account extension of the single-money-writer rule in [ENGINEERING](../docs/ENGINEERING.md#42-add-a-database-table), not a second way to change a personal wallet.

The first implementation increment may provide primitives, adapters, fixtures and tests. It must not wire incomplete shared flows into ordinary players' islands. Admission and each converted mutation path remain disabled until their prerequisites pass. Unconverted old endpoints refuse shared accounts rather than charging a personal wallet. Existing legacy contexts retain their existing contracts.

Resolve mode before invoking mutating legacy helpers such as `island_open` or arsenal sweep-on-read. An old request must not grant a private starting balance or mutate another save before eventually refusing the shared target. New shared island creation and its run grant are one explicit path, not legacy creation followed by a second grant.

## 2. Persisted mode, identity and integer representation

| Name | Exact meaning |
|---|---|
| `personal_legacy`, version `0` | Existing personal accounting. Its wire answers remain unchanged. |
| `island_shared`, version `1` | The shared accounting semantics in this contract. A feature flag never changes this persisted identity. |
| `island_owner` / `islandOwner` | The existing stable owner-key identifying the island in `islands.player_id`; an island code is a lookup alias, never an account key. |
| `account_id` / `accountId` | Server-created UUID for one island run's treasury. Immutable; a reset creates a different account. |
| `run_epoch` / `runEpoch` | Server-created UUID for that run. It fences stale requests, assets, attempts and commitments. A reset creates a different epoch. |
| `revision` | Nonnegative monotonically increasing integer for the account's balance/reservation snapshot. It is not a building, Captain or journal revision. |

Reserve these database names for MP-ECO-02:

- `island_economy_state`: persistent admission pointer, keyed by `island_owner`; `mode`, `economy_version`, `current_account_id`, `run_epoch`, `admission_state` (`active` or `paused`). Pointer/account/owner/epoch/version must agree. Pause allows origin settlements and receipt retrieval, but no newly initiated shared mutations.
- `island_economy_accounts`: `account_id` primary key; `island_owner`, `run_epoch`, `economy_version`, `state` (`active` or `retired`), `balance_coins`, `committed_coins`, `revision`; unique `(island_owner, run_epoch)`. No cascade from a departing buyer may delete this account.
- `island_treasury_transactions`: immutable UUID receipt rows with account/epoch, operation identity, actor when applicable, reason/reference, validated request fingerprint, both monetary deltas, resulting balances/revision and timestamp. Reserve rows can themselves be the immutable commitment source; a separate mutable escrow table is not required.

These are logical required columns, not permission to replace the existing tables in place. Personal progression/session modules provide Engineer/assignment state and durable wave/participation receipts. Their immutable keys below must be preserved even if physical storage is reused.

Coins are integral PostgreSQL `numeric` without a fixed precision, constrained to finite whole values; Python uses `int`. Money and revisions cross the shared HTTP boundary as canonical decimal strings, never floating point, exponent notation or JavaScript `Number`. Nonnegative values use `0` or a digit string without leading zeroes; signed ledger deltas may have one leading minus. UUIDs are canonical UUID strings. An input boolean is not an integer. Database JSON must return strings for these fields rather than letting a JSON decoder round a numeric value first.

No `MAX_DELTA`, bigint conversion, UI slider, arbitrary minimum above one coin or fixed numeric precision may become a covert shared-mode stake ceiling. Prices and grants still come from the server catalogue. Ordinary technical payload/transport protections do not grant authority to impose an economic stake/count cap.

An absent admission row means legacy only after a successful database read and proof that the island exists. Missing table/RPC, malformed state, unknown version, broken account linkage or database timeout fails closed. It never selects a personal wallet. Owner transfer, deletion and automatic guest cleanup must not reinterpret the owner-key; shared admission/deletion remains gated until the explicit continuing-island policy is implemented.

## 3. Common DTO and module seams

Every successful shared read/mutation carrying an account snapshot adds this exact envelope; route-specific domain data stays beside it:

```json
{
  "economy": {
    "mode": "island_shared",
    "version": 1,
    "islandOwner": "11111111-1111-4111-8111-111111111111",
    "accountId": "22222222-2222-4222-8222-222222222222",
    "runEpoch": "33333333-3333-4333-8333-333333333333",
    "revision": "0",
    "treasury": {"balanceCoins": "0", "committedCoins": "0", "availableCoins": "0"}
  }
}
```

The example's zeroes demonstrate types, not starting-capital policy. New shared mutation intents carry `actionUid` and `economy: {mode, version, islandOwner, runEpoch}`. Requests never supply actor, payer, account ID, grant, refund amount or authoritative price. A route's existing `code` must resolve to the same owner as the envelope or return a context conflict; neither target silently wins. Existing resource IDs also have to belong to that owner/epoch.

The read resolver may locate an island from its code before constructing a checked owner-key context. New shared mutation handlers require the explicit envelope. A shared island reached by an old payload receives `409 economy_context_required`; it cannot be retried against an implicit personal payer. Legacy payloads and answers stay unchanged on explicitly legacy islands.

Before returning a shared-island snapshot, an authenticated read also requires the capability header `X-Island-Economy-Version: 1`. This includes initial own/visit reads and related shared account/card reads. A missing capability returns `409 economy_context_required`; an unsupported declared version returns `409 economy_version_mismatch`, without returning the shared snapshot. The first authorized read may still omit the run epoch. Legacy reads retain their existing payload/response behavior whether the header is present or absent. The header declares client compatibility only: it selects no account, admits no island, and substitutes for neither authentication nor membership. Transport forwarding and any supported cross-origin header allowlist must be in place before activation. This prevents an old client from reading a shared island and then presenting an ambiguous personal crew/purchase action.

The treasury API in `backend/server/island/treasury.py` and `treasury_store.py` provides this plain immutable context as part of MP-ECO-02:

```python
@dataclass(frozen=True)
class EconomyContext:
    mode: Literal["personal_legacy", "island_shared"]
    version: int
    actor_id: str
    island_owner: str
    account_id: str | None
    run_epoch: str | None
    revision: int | None

async def resolve_economy_context(
    admin, actor_id: str, island_owner: str, *, expected_epoch: str | None = None
) -> EconomyContext: ...
```

The resolver proves persisted mode and account linkage, not permission. In legacy context `account_id`, `run_epoch` and shared `revision` are `None`; the existing personal resolver remains responsible for a personal wallet. An expected epoch on a legacy island conflicts rather than being ignored. Reserve the server-only read RPC `island_economy_context(p_island_owner)` for the context/account read. It performs no creation, grant or fallback. New accounts require the separate, explicitly authorized admission operation.

The permission API in `economy_permissions.py` provides the pure `Authority`/`Decision` matrix in MP-ECO-08. Its async entry point is:

```python
async def require_economy_action(
    admin, actor_id: str, island_owner: str, action: str, *,
    expected_epoch: str | None = None
) -> EconomyPermit: ...
```

`EconomyPermit` fields are `context: EconomyContext`, `action`, `role` (`host` or `member`), `funding` (`island_treasury` or `none`), `required_phase` (`any`, `between_reservations` or `reserved_wave`), and `is_session_leader: bool`. It is a preflight result, never a bearer token or sufficient authorization for a later write.

Only read-only `island_visit` may omit `expected_epoch` for initial authorized context discovery. It still checks current membership before exposing a snapshot. Every mutation requires an epoch and rejects omission with `economy_context_required`; every provided epoch must match.

Reserve `island_economy_authority(p_actor_id, p_island_owner)` as a service-role-only read. Its raw object has no `status` wrapper and returns verified `actor_id`, `island_owner`, `is_member`, `reservation_id`, `session_leader_id`, and `actor_assignment_wave_id`; nullable IDs are explicit `null`. Membership excludes departed rows; owner is derived from island ownership. Reservation means the accepted canonical bell reservation, including countdown. Leadership and cross-island assignment come from persisted server state, not browser presence. Missing/malformed authority or a provider not yet implemented fails closed with `economy_path_unavailable`. The adapter may be tested with an injected provider before its SQL implementation exists. Separate context/authority reads are advisory; the mutation RPC rechecks both atomically.

Use existing [error JSON](../backend/server/errors.py), `{"error":{"code":"...","message":"..."}}`, with private/no-store caching. Do not add raw database details or a second error envelope.

| Status | Stable code | Meaning |
|---|---|---|
| 403 | `not_member`, `not_owner`, `not_session_leader` | Missing current authority for a new action. |
| 409 | `economy_context_required` | Shared mutation lacks its required context. |
| 409 | `economy_mode_mismatch`, `economy_version_mismatch`, `economy_epoch_mismatch` | Target, protocol or run differs; refresh context, do not retarget an old UID. |
| 409 | `economy_path_unavailable` | Persisted shared mode, but this route/phase of rollout is unavailable. |
| 409 | `idempotency_conflict` | A known operation identity was reused with different validated intent. |
| 409 | `insufficient_funds`, `wave_running`, `engineer_bound`, `captain_assigned` | Checked gameplay refusal; no partial mutation. |
| 422 | `invalid_transaction` / existing `validation_error` | Malformed amount or intent. |
| 502/503 | existing database errors | Outcome may be unknown; keep the UID and inspect/retry its receipt. |

No globally strict expected treasury revision is required for an ordinary spend: an unrelated other member's purchase must not invalidate an otherwise affordable action. Recheck actual free funds and domain quote fields under locks. Choice reversals, demolition and repair use expected choice/build-instance/repair/phase versions so an obsolete click cannot buy a different effect.

UI scope is the tuple `(islandOwner, accountId, runEpoch)`. Apply treasury revisions monotonically only inside that scope. A higher old-account revision cannot overwrite a new run. Domain state and personal progress need their own revisions; equal treasury revisions do not order two zero-cost state changes. Broadcasts are scoped refresh notifications, not money authority.

### Global personal Captain protocol

The personal progression protocol is independent of island accounting. Once a player's personal profile is initialized at `captain.progressionVersion = 1`, that profile is authoritative on every island, including one using `personal_legacy` money. UI profile selection uses this personal version rather than inferring it from the treasury envelope. Legacy/private funds do not restore a paid Captain-level or respec action. Island account/epoch and personal profile/revision are separate contexts; neither is substituted for the other.

Every old RPC that changes migrated Captain level, role, skills or respec state must atomically check the global personal profile before changing legacy fields or charging money. A managed version-one profile is refused on an unsupported legacy path, including on a legacy-money island. Old session/loadout adapters also cannot clear an Engineer generation or apply a stale profile over the managed one. A preflight-only guard is insufficient. Uninitialized/unadopted personal profiles retain their existing legacy behavior until explicit initialization/conversion; an ordinary read does not initialize them.

Reserve these authenticated personal endpoints for integration:

| Endpoint | Request | Result and authority |
|---|---|---|
| `GET /api/captain` | No player/island selector or mutation body. | Read only the authenticated actor's existing personal profile. Return `captain` and `skills`; no wallet or treasury read/creation is required. Missing initialization returns `409 captain_not_initialized`, never an import or automatic grant. |
| `POST /api/captain/role` | `progressionVersion: 1`, `expectedRevision` as a canonical decimal string, `actionUid`, `role`. | Change the authenticated actor's personal role, subject to personal assignment, role eligibility and Engineer binding. |
| `POST /api/captain/skill` | The same three context/identity fields plus `skill`. | Learn the server-priced point skill for that personal profile. No coin debit. |
| `POST /api/captain/respec` | Only `progressionVersion: 1`, `expectedRevision`, `actionUid`. | Free point reassignment; preserve Engineer role while bound. No coin debit. |

Bodies are strict: reject extra actor/payer/account/island fields, unsupported progression versions, noncanonical revisions and malformed action IDs. There is no new Captain-level purchase endpoint. Initializing a profile remains a separate explicitly authorized conversion/initialization operation. The personal routes authenticate Captain ownership directly and do not require membership of the currently viewed island or a shared treasury context.

Each personal mutation locks the profile, checks its immutable `(player_id, actionUid)` receipt/fingerprint first, then checks expected revision and current assignment/binding before a new change. A matching retry returns the old effect with fresh authorized personal state even though that effect advanced the revision; a changed replay conflicts. A stale new intent fails without mutation and requires a fresh profile/decision, not an automatic rewritten retry. Revision advances for actual personal state transitions, including Engineer commitment changes; frozen wave profiles remain immutable. Public mutation refusals retain `captain_assigned`, `engineer_bound` and the existing strict validation/error envelope. Expected-revision conflict uses `409 captain_revision_mismatch`; changed replay uses `409 idempotency_conflict`.

## 4. Funds, commitments and exactly-once receipts

The selected shared accounting model retains wager principal in the account balance and marks it committed. Do not both debit that principal and subtract it again as a hold.

```text
balance >= committed >= 0
available = balance - committed
balance = sum(ledger.delta_coins)
committed = sum(ledger.delta_committed_coins)
```

| Operation | Cash delta | Committed delta | Additional condition |
|---|---:|---:|---|
| Run opening grant / wave income / eligible refund | `+amount` | `0` | Unique trusted origin, server-derived amount. |
| Purchase / paid repair | `-price` | `0` | `available >= price`; asset/event mutation in same transaction. |
| Wager opens: principal `s`, opening fee `f` | `-f` | `+s` | `s >= 1`, `f >= 0`, `available >= s + f`. |
| Wager settles with net returned payout `p` | `p - s` | `-s` | Derive `s` from original reserve receipt; `p >= 0` from authoritative product result. |
| Cancellation returns principal | `0` | `-s` | Original source may resolve once; refund any fee only if the original product contract allows it. |

Payout `p` already excludes any permitted closing fee. A loss is `p=0`; a principal-only refund is `p=s`. Reserve/settle rows with zero cash change are valid because their commitment delta changes availability. Cancellation/settlement is one terminal resolution of the original source UUID, enforced uniquely across both operation kinds. A client cannot choose another account or invent a reserve source. Completed source receipts are retained; no mutable product row may re-open them.

The treasury adapter names this amount `returned_payout`, and the SQL parameter is `p_returned_payout`. It includes any returned principal, after a product's closing fee has been deducted once; it is neither pre-fee value nor net profit alone. The product adapter verifies that amount before settlement. This avoids an ambiguous `gross_payout` argument at the financial boundary.

All newly initiated member spending, including wagers and combat repair, shares this free-funds calculation. On a fee-free product, all in means all available coins. With fees, choose the largest positive integral stake whose whole opening debit fits. Winnings become ordinary free treasury money and are fully reusable. Remove legacy fixed ceilings/minimums above one, daily limits, open-count limits, per-event uniqueness quotas and the old personal transaction ceiling from the admitted shared path. Event closing time, fresh opening price, authentic result and valid product remain necessary.

Separate user action identity from trusted origin identity:

- Browser intents generate an `actionUid` once, using the existing 8–64-character alphanumeric/underscore/hyphen grammar, excluding reserved `fx_` and `sys_` prefixes. Preserve it across timeout, reload and retry. The operation also stores validated action kind, actor and a fingerprint of owner/epoch/resource/quote/amount. Changed intent is a conflict, not a successful replay.
- Monetary ledger rows use a unique immutable UUID `receipt_id`/wire `receiptId`; account-scoped `action_uid` and `(reason, reference)` uniqueness are both required. `reason` and `reference` are chosen by the server, never a generic browser credit call.
- Domain wrappers bind `(actor_id, actionUid)` in immutable `island_economy_operations` before personal/domain locks. Free, personal and paid actions share this root identity; personal scope has null account/epoch. Moving to a new run does not transform an old pending action into a fresh purchase. Financial children use `fx_<operation UUID hex>_<effect key>` and must match the root's actor/account/epoch; canonical server effects use the disjoint `sys_<origin UUID hex>_<effect key>` namespace. Raw historical financial IDs remain opaque tombstones. A downstream refusal rolls back the enclosing transaction, including any new root claim; no incomplete claim may remain committed.
- Server-origin income uses a natural unique source, such as `(account_id, 'wave', wave_id)` or `(account_id, 'run_start', run_epoch)`, independent of which participant reported it. Admission and reset do not accept a caller-selected grant amount.
- A mutation commits its state changes, receipt, ledger and event/outbox record together. Never call a debit RPC over HTTP and then a separate asset-write RPC. Standalone MP-ECO-02 treasury RPCs are server test/foundation primitives; domain integration calls their SQL helper inside one domain transaction.

A replay returns the original immutable effect receipt and `repeat: true`. Where currently authorized, return a fresh snapshot separately; do not overwrite the immutable effect with today's values. The common receipt is `receiptId`, `actionUid` (nullable for server-origin effects), `action`, `actorId` (nullable for system effects), `origin: {mode, version, islandOwner, accountId, runEpoch}`, and route-specific `result`. A departed actor may retrieve their own operation receipt without regaining access to the current island treasury. Original ownership is sufficient for that receipt read, not for a new action. A reply never substitutes another island or reset account as its current state.

## 5. Atomic lock order and preflight races

All new shared mutations, including membership/session transitions, use one order. A discovery read may collect identities without locking; it grants no authority. Revalidate discovery under locks; if it changed and requires another earlier-class lock, roll back/retry the whole transaction. Never discover another player's earlier lock halfway through a write.

1. Acquire the shared admission/create guard, including when no account exists yet. The exact key is `hashtextextended('island-economy:' || island_owner::text, 0)` and the lock is `pg_advisory_xact_lock(key)`. Multi-island callers discover all distinct signed 64-bit keys first and acquire them in ascending numeric order. The service-role-only helper is `island_treasury_lock_scope(uuid)`. Every shared write, original-account settlement, admission, repeated admission and reset uses the same guard. Hash collisions only serialize unrelated islands; no nonexistent account row is assumed to provide a lock.
2. Lock all involved shared treasury account rows by UUID. Original settlement account wins over current selection. Conversion-only personal wallets, if any, are locked next by player UUID; no ordinary shared transaction spends one.
3. Claim a new player root after scope/account locks and before personal/domain locks; a standalone personal action claims its null-scope root first. Then lock all involved dedicated personal Captain/Engineer/controlling-session/assignment state by player UUID. This includes discounted buyers, roster candidates, and recipients whose commitment may be satisfied. Use `FOR NO KEY UPDATE` on the existing public profile creation anchor so legacy ledger foreign-key `KEY SHARE` does not invert island locks; dedicated personal state uses its required update lock. Absence is not an unlocked authorization. Legacy `islands` rows are not personal-class substitutes.
4. Lock all involved `islands` rows together by UUID, including actor-owned rows still supplying legacy profile fields and every target/roster island row, then their admission/recovery/session state in fixed owner order. Do not lock an actor's `islands` row as class three and its target as class four: reciprocal visitors would acquire opposite row orders. Recheck mode, current epoch, membership, leader, active reservation and personal assignment under these locks.
5. Lock wave/participation rows by wave UUID and player UUID, then structures/health by spot/instance, research by branch, arsenal by copy UUID, and product/commitment rows by immutable ID. Skip unused classes; never take them in reverse.
6. Check/insert immutable operation/ledger/participation receipts and journal/outbox entries. One transaction timestamp captured after authority locks determines phase and deadlines. Commit together.

Membership writers, respec, discounted purchase and accepted bell must participate in this ordering. Current legacy functions are not assumed to satisfy it. Their converted wrappers/guards must refuse shared islands, including when a legacy preflight raced admission. A legacy or shared operation that has already acquired an island lock must never call a helper that newly acquires an earlier account/personal lock. Existing recovery settle helpers remain lock-preserving helpers, not a new source of account locks.

Most new operations touch one island and actor. A bell discovers roster candidates, then locks all their personal state in the same sorted order before freezing it. A canonical finish can discover its immutable roster before locks. An island switch that closes one assignment and opens another discovers both contexts and locks both scopes in the same order. No new assignment may be created until the old one is withdrawn; the old wave's history/difficulty remain unchanged.

## 6. Authority, phase and ownership matrix

Use existing action names where they already exist. New action names are reserved for API integration, not new public endpoints. `host` and `member` are game roles; anonymous/registered is not a permission distinction.

| Action / existing route family | Who starts it | Phase | Payer / result owner |
|---|---|---|---|
| `island_visit`, treasury/read cards | Host and current members | Any | Free, scoped read. |
| `island_build`, `island_upgrade`, `island_demolish`, `island_move` | Host and members | Between reservations | Treasury pays/refunds; island owns structure. Eligible actual-cost records determine refund. |
| `island_research`, `island_research_change`, `island_tower_skill`, `island_tower_tree`, `island_wreck`, `island_hire` | Host and members | Between reservations | Treasury; island unlocks/crew/choices. No co-manager, vote or per-purchase approval. |
| `arsenal_buy`, `arsenal_withdraw`, `arsenal_return`, weapon selection | Host and members | Between reservations | Treasury buys; island owns copy; personal holder is exclusive. System pending returns are lifecycle exceptions. |
| `wave_start`, `wave_pause` | Current persisted session leader who is a member | Between reservations | Free; server freezes shared attempt or holds a construction break. Leadership never grants reset authority. |
| `wave_auto_next` | Current persisted session leader who is a member | Any | Free; setting affects the next reservation only, not the running wave or real event clocks. |
| `wave_ready` / `wave_join` | Host and members | Before bell only for a new slot | Free. After bell only retained-slot reconnect may control; new arrivals spectate. |
| `captain_respec`, `captain_role`, `captain_skill` | Authenticated owner of the Captain | Any island phase; no personal reserved/live assignment anywhere | Free; Engineer commitment still restricts role. No treasury or personal coin debit. |
| `combat_input` | Server-authorized controlling participant | Reserved wave | Free; assignment and controlling-session generation must match. |
| `structure_repair` | Host and members | Reserved wave | Treasury; existing shared three-success quota and ordered event receipt. Intact target fails without charge. |
| `wave_revive` | Eligible controlling participant | Reserved wave, after combat eligibility | Time/checked combat action; no coin debit; works with zero free funds. |
| `island_bet` / supported market and football actions | Host and members | Any, subject to real event opening | Whole free treasury, no extra economic caps; settlement to original account/epoch. |
| `island_boat` reward claim | Host and members | Existing playable ship phase rules | Island reward, capped per agreed game/new-record contract; repeat play remains possible. |
| `island_reset`, `island_delete` | Host only | No reserved wave; selected obligations policy applies | New run/account for reset; all Captains and Engineer commitments stay personal. |
| Finish, expiry, settlement/refund, pending-copy return | Trusted server completion of an authorized origin | Its origin lifecycle | No current-member/online requirement; never a client generic credit privilege. |

Reset/delete permits use `funding='none'`: their checked domain transaction owns retirement/new-run grant rather than a generic preflight debit. Demolition's `island_treasury` funding identifies the refund recipient, not a charge.

A spectator without a personal assignment can configure their future Captain profile even while the viewed island has a reservation. The player's own assignment on any island still blocks reassignment, and a pending Engineer commitment still blocks a non-Engineer role. Island-scoped mutation envelopes retain their required epoch. Future standalone personal profile endpoints authenticate Captain ownership independently and must document their explicit interface rather than invent an island-membership requirement.

Additional controlling tabs cannot create a second Captain or participation receipt. Reservation authority is server-owned; a UI `isBetweenWaves` flag does not authorize a mutation. All valid bills are rechecked under locks. Moving money to a private wallet, importing legacy winnings, buying personal Captain upgrades, and unsupported legacy products are unavailable on the shared account.

## 7. Engineer commitment is personal and generation-specific

Keep the existing catalogue's 10% Engineer reduction only on eligible construction/building-level upgrades, using the current integer rounding in [rules.py](../backend/server/island/rules.py). Actual paid cost is what the building payment record stores for any future demolition refund. It never applies to bets, research, arsenal or fixed-price repair.

A successful discounted mutation acquires the buyer's personal state lock before island/domain locks and atomically performs all three effects: treasury debit, structure mutation/payment record, and pending Engineer commitment. The buyer must currently be Engineer and have no personal reserved/live assignment. Existing commitment means reuse that generation; several purchases do not stack required waves. First discounted purchase creates a new server UUID `engineer_commitment_id` with `state='pending'`. Failed transactions and exact retries create/extend nothing.

The commitment survives reload, island switch, departure and island reset. While pending or attached, role selection cannot choose another role; ordinary free skill reassignment otherwise follows phase rules. An accepted personal bell assignment must freeze Engineer and the matching commitment UUID. A normal canonical `won` or `lost` finish after that player's confirmed combat participation satisfies it. Countdown-only, explicit abort, expiry or abandonment does not. Falling or later disconnect does not remove already confirmed participation; online presence at finish is unnecessary.

Commitment history/claim uses `(player_id, engineer_commitment_id, wave_id)` identity. A close receipt may satisfy only its matching generation; clear pending state conditionally on that UUID, never just `role='engineer'`, current epoch or `player_id`. Completion effect is recorded with the canonical close, not deferred solely to a browser acknowledgment. A delayed response/read of C1 cannot satisfy a subsequently created C2. Late personal level/skill receipts also cannot rewrite the already frozen wave stats.

The personal commitment is not limited to shared-account islands. Any compatible destination session must freeze it and enforce the same controlling assignment. An unsupported legacy session/respec path cannot clear or bypass it; adapt that path before admitting a bound Captain to it, or refuse that path explicitly. Previously frozen legacy waves without a matching commitment generation cannot satisfy a newer obligation.

## 8. Wave attempt income and personal receipts

At accepted bell, freeze `wave_id`, played wave number/seed, account ID, accounting mode/version, epoch, roster, difficulty, defenses, island crew, personal loadouts/stats/Engineer generation, and server-derived reward basis. New shared attempts on either supported wave protocol obey this contract. Old already-frozen legacy attempts keep their original protocol/accounting; no personal-to-shared reward conversion halfway through an attempt.

New arrival after bell is a spectator until the next reservation. Retained-slot reconnect uses the same participant/session generation, current HP, fallen state, position, cooldown and journal state. The Captain stays stationary/targetable during the selected 60-second grace; no heal or revive is caused by reconnect. After the leader's grace expires, succession chooses the eligible continuously connected player with the longest active connection; a stable player ID breaks ties. Reconnection does not create a new fighter or reset the grace clock through an extra tab.

Participation becomes eligible only after a server-acknowledged active controlling session after combat begins. No kill/damage quota is imposed on an automatic tower-defense game. Mere membership, spectating and countdown-only presence do not qualify. One account has at most one live combat assignment globally. Explicit exit revokes input authority immediately and withdraws that assignment without reducing difficulty. If nobody eligible remains after grace, server abandonment is terminal and earns no loot.

Canonical terminal outcome is immutable for all participants. Loss/expiry/abandonment cannot later become a win. Before a terminal outcome is stored, any existing rescue mechanic must finish its own outcome; do not store a reversible defeat as canonical loss. Canonical success atomically credits one attempt-source treasury receipt and creates durable individual win receipts for eligible participants. Normal defeat can satisfy an eligible matching Engineer commitment but grants no win milestone/loot. Participant finish/acknowledgment reads/claims these records; it never decides another treasury payout.

Personal win receipt identity is `(player_id, wave_id)` and records confirmed participation and canonical outcome independently of the current island epoch. It remains readable/claimable after departure/reset. Applying personal milestones is idempotent and based solely on these receipts, never `max(owned_island.wave_best, personal_best)`. Repeating an already earned personal milestone grants no further points. Existing acquired progress is preserved by conversion; the exact milestone and retired-skill mapping is a review gate, not a new XP design in this task.

Source precision matters: legacy Captain-level purchase unlocks use that maximum, but legacy skill points already use only `won_wave_best // wavesPerPoint` minus known skill costs, as called by `service.skills_of`. Preserve genuinely available unspent points from that personal source; do not invent an offline-host skill-point entitlement from the owned island's record.

Separately played ordinary repeat attempts may earn treasury loot again, but only from the actually played low wave and frozen reward basis. They do not refresh ship record rewards or personal milestones. There is no new easy-wave selector or bailout: owner reset is the only added recovery help if ordinary existing attempts, legitimate pending payouts and available ship rewards cannot fund rebuilding.

## 9. Bets, inventory and financial origins

Each accepted wager saves immutable mode/version, originating account/epoch, actor, reserve receipt UUID, event/product identity, opening terms/price/fees and authoritative closing eligibility. Store that proof before a provider callback can settle it. Provider results settle by commitment identity, not by actor's current island. A cancelled event and a losing event have distinct authoritative outcomes; neither is a reason to run a second settlement.

Reserve/settle mechanics in section 4 apply to every supported new-mode product. Market calls and football paths remove fixed maxima, extra minima, daily/open-count limits and one-per-event restrictions. Separate valid actions may bet on the same event, including opposite choices. A replay of the same action is the same commitment. Supported exchange positions also map opening/closing fees, liquidation and refund to the same accounts; unsupported products remain outside this mode with an explicit refusal, not a private-wallet bypass. Existing personal wagers always keep personal recipients and their original product rules.

Arsenal copies remain island-owned; carried and stored copies both count toward the selected total capacity of 20 special weapons. A departing/withdrawn holder during a reservation loses input authority immediately, while the copy becomes pending return until canonical end/expiry. It is never reassigned to another fighter in that same wave. Outside a reservation, explicit departure returns immediately and disconnect returns after grace. No browser, later read or next wave is required for a system return. Preserve old excess stock and reject additional buys while at or above capacity.

## 10. Reset, admission and conversion boundaries

A reset is one host-authorized transaction with no live reservation. Retire the original account/run, preserve immutable receipts/history and personal Engineer/progress state, clear island assets/progress, create a new account and epoch, and book its configured run-start grant once. No original balance or old money receipt funds the new account. Retry returns the original reset receipt; it cannot reset the new run again or create another grant. Pending legitimate personal claims remain valid because they are personal, not new-run money.

The reset-with-open-wagers policy is not yet selected. Foundations can implement origin-aware holds and receipts without enabling reset. Before MP-ECO-16 admission choose and test exactly one policy:

| Option | Exact required behavior |
|---|---|
| Refuse while original island bets remain unresolved | `409` names outstanding commitments; funds remain protected and original settlements complete normally. Original legacy personal bets do not become island commitments or block an unrelated run. |
| Retire to new actions; settle old obligations on old account | Preserve original account and hold/source rows. Permit only authenticated original settlements/refunds there. Old balance/payout remains retired and cannot be transferred into the new run; explain this consequence in reset confirmation. |

Neither policy is a wager amount/count limit. Do not accidentally keep the old account writable for new bets or redirect an old callback to the new account pointer.

Admission uses a separately reviewed manifest and a durable unique conversion/admission identity. Dry run inventories original personal wallets, acquired level/skills, genuinely available unused personal points, actual paid buildings/refunds, excess copies, original waves and open financial commitments. Do not pool members' wallets, use the host wallet as a treasury, copy one balance into several islands or silently erase personal funds. No migration grant/carry amount is invented here. If incomplete old history requires a preserved entitlement baseline, label it as conversion entitlement with covered milestones; do not fabricate participation or award points from the owned island record. The exact retired-skill and baseline mapping remains reviewed MP-ECO-17 work.

Admission is an owner-island creation path or a separately authorized manifest conversion, not a normal invited-member spending command. Its service-role RPC does not constitute a public admission or arbitrary-grant endpoint.

Admission cannot reinterpret an unsealed active wave. Finish or explicitly terminate it first under its original mode. Already closed but still individually claimable old waves remain old-mode receipts; they must not additionally pay the new account. Any legacy money/guest cleanup/delete endpoint that can mutate an admitted island needs an atomic persisted-mode guard before that island is admitted. A stale legacy preflight cannot pass through after conversion.

Conversion failure rolls back the whole affected account/asset ownership change; repeat runs return the conversion receipt. Reconcile current asset identities and historical source receipts before and after. Preserve or explicitly convert retired skills' earned entitlement; do not invent replacement Carpenter effects or erase valid unrelated skills. Owner deletion/guest cleanup must apply the reviewed island disposition before cascades. Member deletion returns only that member's copies on continuing islands; other players' personal progress survives.

Disabling new admission/offers is the safe pause action. It never changes a shared island back to personal mode or replays legacy rewards. Origin settlements, receipt reads and required lifecycle closure keep working. Destructive down-migration or copying account balances back to private wallets is not a rollback plan. Actual rollout needs backup, dry run, compatible clients, independent review and separately authorized application/activation.

## 11. Foundation prerequisites and admission gates

The MP-ECO-02 treasury foundation supplies exact integer arithmetic, account/ledger constraints, repeat-safe start/spend/reserve/settle primitives and test adapters. The MP-ECO-08 permission API supplies the pure authority matrix and fail-closed provider interface. The MP-ECO-18 client projection consumes scoped DTO fixtures without enabling routes. These prerequisites do not require invented gameplay numbers.

The selected session grace is 60 seconds with deterministic succession as above. Retain the current numeric arsenal capacity of 20, counting both stored and carried special copies under the agreed total-copy rule; grandfather existing excess. Ship rewards pay only positive score improvements, once per island/game/new island record, capped by the existing formula. These selections do not supply runtime integration evidence.

Release/admission gates still include: all reachable coin paths converted or explicitly refused; personal milestone/veteran mapping; background expiry/return execution; total-copy capacity implementation; original financial obligations/reset policy; owner deletion and guest cleanup; existing-save opening balance manifest; normal retained-point accounting and D059 repair-option retirement; ship score-improvement/cap implementation; measured catalogue balance; both wave protocols and authenticated multi-client tests. These block their affected routes/admission, not unrelated foundation tests.

No money/bailout path is added for the zero-funds case. MP-ECO-22 tests that ordinary permitted free attempts, legitimate original bet payouts and still-eligible ship rewards remain usable; if none enables recovery, members wait for owner reset. It must not add a stake restriction, demolition restriction, easy recovery wave or private transfer to conceal that intentional outcome.

## 12. Acceptance, verification and integration requirements

Documentation acceptance follows [ENGINEERING section 3](../docs/ENGINEERING.md#3-commands): read the changed page as a newcomer and verify every changed link/content. `git diff --check` must be clean. There are no runtime changes in MP-ECO-01, so app/backend tests are not evidence that this contract is implemented. Runtime implementation requires meaningful first tests for these contracts:

| Implementation task | Required first checks |
|---|---|
| 02/04/14 | Exact amounts beyond the old personal ceiling and JS-safe integer range; money/holds reconcile; parallel last-coin spend/reserve; source resolve once across settle/cancel; altered UID payload conflicts; no debit without asset. |
| 04/07/11 | Purchase/respec/bell race has one serial result; several discounts share one generation; failed/repeated buy does not bind; C1 delayed receipt cannot clear C2; Engineer survives island reset/switch. |
| 03/07 | Simultaneous finish pays once; loss then delayed win never pays; offline host gains no personal progress; valid fallen/disconnected participant retains receipt after reset; repeated milestone gains no points. |
| 08/10/11 | Equal member research/tear-down rights; owner-only reset; no client presence authority; one assignment/tab; accepted-bell freeze; offline pending-copy release without a browser. |
| 14/16/17 | Departed actor's original settlement succeeds; personal bet stays personal; reset old wager cannot fund new run; repeat/reset/admit grant once; legacy preflight races conversion; paused flag cannot restore private payouts. |
| 18/20/22 | Late old-account reply cannot overwrite new run; all-in accounts for held funds/fees; no hidden cap; correct pending Engineer UI; selected zero-money behavior; real authenticated clients distinguished from fixtures. |

Later code PRs run the relevant actual commands from ENGINEERING: backend pytest/Ruff, additive SQL parse/migration checks, frontend tests/build and multiplayer/browser evidence where changed. Schema grants/RLS, immutable history, deadlock/race cases and unknown-result retry need database integration evidence, not just pure mocks. No check here implies live deployment or proof of all combat hits.

Required integration updates:

- `docs/INTERFACES.md`: link the shared mode/envelope, errors, account resolver and authority/receipt contracts when route integration lands; preserve explicit legacy descriptions.
- `docs/DECISIONS.md`: cross-link the implementation account/epoch/reservation model, Engineer generation mechanics and eventual approved reset/conversion choices.
- Route comments/models and `supabase/README.md`: record exact RPC/table grants and product mapping as implemented; neither authenticated nor anonymous clients get balance/ledger write access, and immutable ledger never grants update/delete.
- `docs/TEST-MAP.md` / `WALKTHROUGH.md`: record actual implementation evidence, limitations and rollout status.

### Verification status

- **Changed:** this implementation contract only; no runtime or schema change.
- **Verified:** `git diff --check` is clean; a local documentation check resolves all six relative links and anchors and checks table/code-fence structure. The complete contract was read against the rule source, existing money/permission/progression code, and the dependent context/authority/UI seams. The three GitHub links are supplied task references, not independently fetched remote verification.
- **Not verified:** runtime modules, SQL execution/deadlocks, authenticated clients, migration application and live behavior; this task changes none of them.
- **Remaining:** independent human review; implementation and canonical interface updates; explicit gated decisions above.
