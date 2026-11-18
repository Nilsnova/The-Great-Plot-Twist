# Guarded shared economy transactions

Service-only transaction contracts, HTTP adapters and verification boundaries,
used by backend integrators and reviewers. Browsers reach the guarded transactions
through authenticated domain routes, never by executing money RPCs directly.

## Dependencies and activation boundary

The [version-one contract](../../specs/MP-ECO-01-economy-contract.md), treasury
accounts and immutable operation registry define account identity, exact money,
receipts and lock ordering. New player mutations claim the common actor/action
root and derive financial children from that root. Product rows, ledger effects
and domain receipts commit together; a refused mutation rolls all of them back.

The production `island_economy_authority(actor, owner)` implementation is still
required. Its six-field result supplies current membership, accepted reservation,
session leader and global combat assignment; browser presence cannot replace it.
Missing or malformed authority refuses new actions. Database tests install an
explicit TEST-ONLY provider: membership is read from real rows, while reservation,
leader and assignment values are injected. Those tests verify transactions, not
authenticated runtime acceptance.

Authenticated domain adapters and browser controls now select explicit shared or
legacy accounting. Shared mutation requests advertise
`X-Island-Economy-Version: 1` and send the common mode/version/owner/epoch intent;
the server derives the actor and account. Missing or unknown client context cannot
choose a personal payment path. Existing-save admission is not automatic.
Canonical session/assignment storage, autonomous expiry/return execution,
reset/deletion disposition and the canonical island projection remain prerequisites
before shared admission.

## Implemented transaction families

| Domain | Migration and service-only entry points | Behavior |
| --- | --- | --- |
| Arsenal | `20261118050900_shared_arsenal.sql`; `island_shared_arsenal_mutate` | Buy/take/return use a bound account/epoch, common operation root and immutable receipt. Purchases check island unlocks and 20 total copies. Bound historical excess is retained; returns must also satisfy deferred constraints at commit. Private lock-preserving holder/loadout/closure helpers grant no service execution or canonical authority. |
| Combat repair | `20261118051200_shared_combat_repairs.sql`; `island_shared_structure_repair`, `island_shared_repair_replay` | One protocol-2 transaction commits treasury debit, full normalized HP, shared three-success quota, ordered event and receipt. Accepted countdown is reserved time. Economy run epoch and recovery epoch are distinct. Mutable wave/repair cursors are fresh-operation guards, not immutable paid intent. |
| Wagers | `20261118051400_shared_island_wagers.sql`; `island_wager_open`, `island_wager_replay`, `island_wager_settle` | Supported market calls and football use positive whole-coin stakes without legacy monetary/count caps. Opening stores product and reserve atomically. Verified terminal results consume the original source reserve once, including on a retired account or after departure. Unsupported exchange products remain outside this path. |
| Ship games | `20261118051500_shared_ship_rewards.sql`; `island_shared_boat_start`, `island_shared_boat_claim` | Server-created rounds bind game, actor, original account/epoch/record and formula. All members share a game/record reward bucket; only positive score improvements pay. A completed round and retried UID cannot pay twice. |

SQL comments and dedicated Python models/adapters are the exact signatures,
request validation and result sources. No client supplies an authoritative payer,
payout, repair HP, reward record or payment receipt. The service-only wager
verifier accepts trusted provider evidence, never a client-selected payout.

## Runtime adapters and browser controls

The production app registers these authenticated routes. Initial shared reads
negotiate capability without trusting a browser-selected account; mutations bind
the submitted run epoch and repeat the authority check inside the transaction.

| Domain | HTTP and browser integration | Additional migration |
| --- | --- | --- |
| Arsenal | Existing `/api/island/arsenal` read and `/buy`, `/take`, `/return` mutations branch on persisted accounting mode. Shared requests omit the legacy navigation code. The island controller consumes exact treasury funds and an independent arsenal revision for free asset changes. | `20261118180900_arsenal_runtime.sql` adds guarded reads, request wrappers, legacy conversion/mutation guards and RLS-protected `shared_arsenal_versions`. |
| Combat repair | Existing `/api/island/structures` and `/api/island/structures/repair` adapters select shared repair. Common receipts remain immutable; current HP and funds require a separately authorized fresh projection. The island never predicts shared healing from a replayed receipt. | `20261118181200_legacy_repair_mode_guard.sql` guards the legacy repair transaction. `20261118192007_legacy_revival_shared_mode_guard.sql` refuses personal paid revival for a persisted shared target before acquiring the wallet lock. |
| Wagers | `GET /api/island/wagers`, `POST /api/island/wagers/market` and `/football` use dedicated shared cards in the island Harbor. Activity is paginated without economic caps. A secret-protected `/api/internal/island-wagers/settle` worker consumes trusted server sources independently of browsers. | `20261118181400_shared_wager_jobs.sql` adds the durable RLS-protected queue; insertion and completion follow the wager transaction. The scheduled wake-up workflow is disabled until its repository gate is explicitly enabled. |
| Ship games | Existing boat status/start/claim routes return explicit island or player reward scope. The live island captures that verified scope before loading the scene and retains unknown claims with their original actor/account/epoch. | `20261118181500_shared_boat_runtime.sql` adds guarded status and legacy payout checks. |

Browser adapters receive the authenticated actor from the accepted private
profile and use the existing canonical island projection; there is no second
treasury store. Newer authorized domain envelopes request a guarded canonical
island reread. Historical receipts cannot overwrite personal coins or current
funds. Unknown outcomes, including an intervening authentication failure, retain
the original durable UID and body for the same actor and account/run.

The shared Realtime predicate in
`20261118192119_shared_island_realtime_membership.sql` tightens both existing
place Broadcast policies. Its internal, non-exposed schema grants authenticated
callers only schema usage and a fixed `auth.uid()` predicate. It adds no browser
table rights. Fresh joins reject outsiders and departed members, including for
paused shared accounts; cached subscribers still require canonical lifecycle
revocation or topic rotation.

The read-only `wave_session_adapter.py` composes the published context resolver,
authority decoder and permission matrix. It binds a specific frozen wave/account
to the current reservation/assignment and active controller generation. It writes
no session, assignment or participation receipt, and is not a mutation permit.

## Receipt and replay contract

Domain receipts use `receiptId`, `actionUid`, `action`, `actorId`,
`origin: {mode, version, islandOwner, accountId, runEpoch}` and domain facts in
`result`. Financial receipts retain their own immutable ledger identity within
the domain result. Money and treasury revisions use canonical decimal strings;
Python adapters reuse the foundation conversion helpers, including values beyond
Python's ordinary decimal-string conversion threshold.

A matching authorized historical request returns its original effect before
checking mutable price, membership, phase or HP. It never repeats money, quota,
healing or events. Changed immutable intent conflicts. Historical receipt access
does not grant a fresh island snapshot: `currentEconomy` is null or omitted when
fresh state is unauthorized. A receipt balance is never today's available funds.

## Remaining canonical integrations

Shared repair requires an immutable trusted `initial_snapshot.economy` identity
matching its account and run. This is a gated consumer precondition; no published
producer currently supplies it. Existing recovery snapshots without it refuse.
Free timed revival remains unavailable until canonical target-bound hold/fall and
controlling-session provenance can authorize its unique ordered event.

The existing `/api/waves/recover` path settles saved legacy personal obligations.
Shared wave producers and admission guards must preserve each attempt's original
accounting mode so that this path cannot pay a shared attempt into a personal
wallet. The existing paid-revival journal proves its durable paid event; it does
not supply the uninterrupted hold authority required for new shared free revival.

Arsenal member deletion still needs a coordinated transaction replacing the
destructive holder cascade on continuing islands. Private holder helpers do not
schedule work, revoke combat input or prove a canonical wave closure by themselves.

The selected reset policy settles outstanding bets only on their old retired
account; it cannot fund the new run. Actual reset/deletion RPC integration is
separate. Tests that directly retire accounts or change epoch pointers establish
that boundary only and are not reset acceptance. Owner deletion/archive handling
must reconcile immutable account references before an owned island is deleted.

## Verification

The [acceptance matrix](ACCEPTANCE.md) separates pure, disposable database,
authenticated browser and physical-device evidence. Database checks use local
Unix-socket PostgreSQL, apply the migration chain twice and exercise persisted
rows, grants, exact money, committed races and injected failures. They do not
read configured database credentials or apply migrations to a live project.

From `backend/`, the domain SQL command is:

```bash
CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q \
  server/tests/island_sql/test_shared_arsenal_sql.py \
  server/tests/island_sql/test_shared_combat_repairs_sql.py \
  server/tests/shared_wagers_sql/test_shared_wager_transactions_sql.py \
  server/tests/island_sql/test_shared_ship_rewards_sql.py \
  server/tests/island_sql/test_shared_domain_acceptance_sql.py
```

Run focused Python tests, full backend Ruff and the documented migration parser
as well. Domain tests with injected authority do not prove authenticated shared
gameplay, both wave protocols or physical-device acceptance. These remain separate
release gates. No live migration application, activation or deployment is implied.
