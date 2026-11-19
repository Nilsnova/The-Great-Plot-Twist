# Shared economy acceptance

> **What this is:** the MP-ECO-20 test matrix and evidence procedure for reviewers.
>
> **Who uses it:** teammates validating the shared economy before release.

**Status:** canonical backend source is integrated; coordinated client capabilities
and final authenticated acceptance are incomplete.
This inventory was reviewed at `5f1cfa7c34b7610234ffaef7b76ac66c143516e2`.
Published dependencies
provide the [contract #515](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/515),
[permission policy #516](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/516) and
[treasury/operation registry #517](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/517).
The production persistent authority provider, personal Captain/Engineer assignments,
native session/journal producer, closure worker and reset/deletion composition are
now present. Their presence is not a completed runtime scenario matrix.
The required scenario matrix remains incomplete. See [#505](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/505)
and the [bounded specification](../../specs/MP-ECO-20-integration-acceptance.md).

## Current integration and open gates

The [canonical session specification](../../specs/MP-ECO-11-canonical-wave-sessions.md),
[lifecycle composition](../../specs/MP-ECO-16-island-lifecycle.md)
and registered [application routes](../../backend/server/app.py) replace the earlier
missing-provider prerequisite. Domain-unit tests now verify the actual provider
and seed its underlying facts explicitly; they do not install a substitute. Native
SQL suites create controls, roster, assignments, journal state and holds through the
actual production hooks, with their template/report/clock boundaries labeled.

A fresh local stack installed all 106 migrations in canonical timestamp order from
`a6de304bbeb5f45983e18d043c848c71a4566609`. A limited probe used three real
registered Auth users in distinct Chromium processes, the production SDK/API and
private WebSockets, without network interception or authority fixtures. It observed
Captain adoption and fresh control, native bell/replay/input, outsider refusal,
current-topic isolation across admission/departure and terminal state after the last
withdrawal. Fresh-island service-only treasury admission was explicit installer
setup. This was an SDK/API primitive probe, not rendered gameplay or public
legacy-save conversion. Honest channels manually followed current metadata; automatic
product topic changes remain unverified. Application/migration bytes are unchanged
between that source and the inventory source; the intervening change is a test.

The [test map](../TEST-MAP.md#shared-economy-integration-checkpoint--19-november-2026)
records source-qualified checkpoints. In particular, the historical `799242b4`
broad run remains **15,185 passed, 28 failed, 5 skipped**, exit 1. The later **219**
passing affected cases include those 28 node IDs on their separately recorded
source. They do not establish a final full-backend pass.

| Pending acceptance gate | Required next observation |
|---|---|
| Final common source | Freeze the reviewed API/frontend/migrations together; rerun backend regressions with disposable SQL and matching frontend Node dependencies, affected client suites/build and migration checks. Retain exact failures/skips and source hashes. |
| Coordinated client capabilities | At the inventory source, `shared_snapshot.py` still declares session/arsenal/move/repair/reset/market/match unavailable. The real island client gates those controls on the snapshot. Complete the reviewed capability/client integration before treating direct SDK calls as reachable game actions. |
| Rendered two-player journey | Actual provider sessions use ordinary game UI, coherent shared quotes, session attachment, native journal/input/checkpoints and terminal handling. Capture visible scoped funds, accepted actions and committed database effects; no fake adapters or response replacement. |
| Product Realtime transitions | Honest rendered clients automatically follow new topic metadata across admission, membership leave, reset and deletion. Retained malicious sockets cannot receive new protected data or inject accepted gameplay. Manual SDK topic changes alone do not close this gate. |
| Session and participation | Actual duplicate tabs/cross-island assignment, countdown/spectator exclusion, reconnect before and after real grace, succession, frozen difficulty/loadouts, pause/auto-next and no-browser worker closure agree with persisted receipts. |
| Money and domain effects | The scenario matrix below passes across core spending, crew, arsenal, repairs, wagers and ship rewards, with concurrent funds, replay/conflict, old-epoch privacy, exact ledger reconciliation and unchanged personal recipients. |
| Combat repair and free revival | Rendered real simulation/journal produces damage, falls, poses and uninterrupted target-bound holds; quota/debit ordering, zero-coin revival, interruption/generation fencing and terminal healing match actual state. Synthetic accepted combat reports remain lower-layer evidence. |
| Personal progress and lifecycle | Actual participation/Engineer generation effects, owner-only idle reset with open old wagers, member/confirmed-owner deletion and Auth rejection preserve the documented assets, old origins and other players' personal progress. |
| Compatibility | Both supported wave protocols, capability/old-client refusals, failed prerequisite reads and legacy/class Harbor/Pirate Point/duel/excluded-product paths retain their declared accounting without a shared-to-personal fallback. |

Natural-feed/time observations, physical devices and legacy-save conversion/public
rollout must retain their own explicit status. Feed fixtures or accelerated clocks
do not become natural-provider evidence, viewport emulation is not a physical phone,
and service-only admission of a fresh test island does not prove conversion. None
of this authorizes hosted changes, rollout or activation.

## Earlier local database evidence

The [database follow-up](../../specs/MP-ECO-20-database-acceptance.md) verifies
guarded domain transactions against the published treasury and operation registry.
Checks on code snapshot `f3177b061903c7b868df6eecb08ecb1a7b042c60` completed with:

| Check | Actual result |
|---|---|
| Focused Python rules, adapters, permissions and affected legacy routes, 38 files | 1,043 passed in 51.88 seconds. |
| Mixed disposable PostgreSQL domain, treasury/registry and related legacy suites, 17 files | 387 passed in 125.43 seconds; no skipped cases. |
| Cross-domain cases, also included in the mixed SQL run | 8 passed in 6.46 seconds. |
| Full backend Ruff; complete production migration parser | Passed; 72 migration files parsed. |

The [cross-domain cases](../../backend/server/tests/island_sql/test_shared_domain_acceptance_sql.py)
invoke actual arsenal, wager, ship and repair RPCs. They inspect committed
roots/receipts/assets/ledger, compete for the last available funds, verify free
versus paid intent collisions, roll back an injected post-effect failure and
check historical receipt privacy. Run them from `backend/` with:

```bash
CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q --tb=short server/tests/island_sql/test_shared_domain_acceptance_sql.py
```

Reservation/leader/assignment authority and the repair wave's immutable economy
binding are explicitly injected test fixtures. Real membership, domain functions,
treasury, global operations, recovery rows and transaction locks execute in the
disposable database. These results establish those historical database boundaries, not the
then-missing production authority/producer, autonomous lifecycle workers, actual reset
or deletion, public route admission, authenticated clients or physical devices.
The complete matrix below remains a target rather than a completed runtime claim.

## Earlier 76-migration authentication and Realtime evidence

A separate disposable stack used official Auth, PostgreSQL, REST and Realtime
services with verified local TLS. Its source was baseline
`e3fc3a33acca9a4e9fcea9d7582f00775852f8ba` plus only
`20261118192119_shared_island_realtime_membership.sql`: 76 applied migrations,
not the complete later runtime migration set. No authority fixture was installed.

Actual registered-user sign-in and the unmodified API token verifier accepted
valid users and refused a forged JWT. Two distinct Chromium processes joined the
same game through the existing UI and exchanged private WebSocket Broadcasts.
Own-wallet visibility, cross-player isolation and direct browser money-write/RPC
refusals were checked separately. These establish legacy authentication and
transport boundaries, not completed shared gameplay.

With the membership migration applied unchanged, fresh shared owner/member
channels exchanged messages; outsiders and departed members were refused.
Paused shared islands stayed private, and existing legacy Harbor access remained
available. The private predicate schema was absent from REST exposure and browser
table grants were unchanged.

The cached-connection checks **failed**: a subscriber admitted while an island
was legacy could still send and receive after shared admission, and an already
connected member could still send and receive after leaving. Tightening the RLS
predicate alone cannot satisfy those lifecycle gates. Canonical revocation or
topic rotation and a new authenticated run on the complete source were required.
The newer limited probe above verifies current-topic isolation with manual SDK
selection; the rendered product transition gate remains open.

## Evidence layers

- **Unit/fixture:** pure rules, fake authentication/database, simulated clients and
  fake room browser checks. Useful regression evidence, separate from runtime acceptance.
- **SQL:** disposable real PostgreSQL, actual migrations/RPCs and concurrent
  transactions. Record commands, source, final rows and immutable receipts/ledger.
- **Authenticated browser:** distinct authorized users exercising the integrated
  frontend, API, persistent authority and transport against an approved test
  environment. Record authentication method and distinct pseudonymous client
  labels, requests/results, source versions and relevant database observations.
  Do not store tokens, real personal data or credentials in artifacts.
- **Physical device:** separate observations of actual devices and networks. A
  viewport or browser emulation does not establish this layer.

`npm run test:mp` currently opens `?islands=fake` and uses local fake players.
Neither it nor fake API credentials count as authenticated-browser evidence.
The existing SQL fixture is disposable and never reads a hosted database URL:
see [TEST-MAP section 2](../TEST-MAP.md#2-backend-sql-suites-opt-in).

## Required scenarios

Each row needs targeted SQL and authenticated-browser evidence on the same tested
source. A combined command/log may cover several rows if its assertions identify
each scenario. Prepare actual tests against integrated implementations; do not
invent passing output while prerequisites are missing.

| Scenario ID | Required observations |
|---|---|
| `treasury-concurrent-spending` | Two members compete for the last available coins across purchase, wager and repair. Only affordable operations commit; balance and commitment deltas reconcile after every transaction. Opening grants cannot multiply through concurrent creation/reset. |
| `settlement-source-account` | Reserve on island A, leave/change island/reset, then settle/refund. The original account/epoch receives the effect exactly once; new epoch and personal wallet do not. Old personal commitments retain personal recipients. |
| `wave-income-once` | Multiple finish acknowledgements and retries pay one canonical successful attempt once. House/boss bonuses do not multiply by participants. A later victory report cannot reverse loss/expiry/abandonment. |
| `personal-participation` | Membership, spectator and countdown-only sessions earn nothing. Confirmed combat participation remains eligible after disconnect; personal receipt claims survive departure/reset and do not duplicate milestones. |
| `engineer-generation` | Discount and next qualifying Engineer assignment are atomic. Multiple discounted purchases share one pending commitment. Delayed completion clears only its captured generation; legacy role/respec routes cannot evade it. |
| `arsenal-holder-lifecycle` | Island unlocks, total carried+stored capacity, grandfathered excess, exclusive take/swap/return and frozen loadouts hold. Exit revokes control; grace/pending return settles without a browser/read/new wave. Deletion/racing take cannot lose/duplicate copies. |
| `repairs-free-revival` | Three successful paid repairs are shared from accepted bell, including countdown. Stale/invalid/intact/repeated requests do not spend extra money/quota/heal. Later damage stays ordered. End/loss/expiry heals structures. Timed valid revival works at zero coins without a debit. |
| `unrestricted-bets` | One coin, all available funds, winnings reinvestment and separate same-event bets work. No extra daily/open-count/stake caps survive. Fees fit available funds; retries/changed replays and stale balances behave atomically. Unsupported legacy products cannot import/spend island funds. |
| `ship-reward-cap` | Ten members, repeated claims and parallel score improvements cannot multiply the agreed per-game/new-record cap. Old score/run evidence cannot reward a different island/epoch. |
| `member-owner-permissions` | Invited host/member/guest rights agree in API, SQL and UI; research changes/demolition/spending need no co-manager approval. Nonmembers and forged actor/account/epoch fail. Session succession grants no reset/delete ownership. |
| `reset-deletion` | Owner-only atomic reset advances epoch and preserves personal progress/receipts. Old operations cannot affect new run. Member deletion returns copies on continuing islands; owner deletion follows the explicit owned-island policy. |
| `legacy-class-contexts` | Legacy personal island behavior, class Harbor, Pirate Point, duels and excluded products keep their declared accounting. No personal-wallet fallback occurs on a shared island or when prerequisite reads fail. |
| `old-client-rejection` | Missing/unsupported `X-Island-Economy-Version` cannot read/mutate an admitted shared island. Authorized initial read may omit an unknown epoch; mutation requires it. Capability never grants membership or changes persisted mode. |
| `wave-protocol-1` | Exercise the supported legacy wave protocol and its admission/compatibility fence. If shared economy is unsupported, explicit refusal must prevent personal payout fallback. Capture bell/action races and canonical finish/expiry behavior. |
| `wave-protocol-2` | Exercise journal-backed wave snapshots, retained-slot reconnect versus spectator, duplicate tabs/cross-island assignments and immediate withdrawal. HP, fallen state, position, cooldowns, journal and difficulty persist; empty grace expiry abandons without loot. Break pause does not pause combat/bet clocks. |

Use the agreed 20-copy total capacity with grandfathered excess, 60-second reconnect
grace, longest-active-member succession with stable player-ID tie break, and ship
rewards paid only for positive cumulative score improvements. Their implementations
must preserve these values. Reset permits open wagers, whose settlement remains
confined to the old retired account. Owner deletion deletes that island while
preserving other players' personal Captain progress. Reset/deletion transactions
are now implemented; their complete authenticated scenarios remain open. Conversion
and rollout retain their separate status; this matrix authorizes no activation.

## Offline assertions

[economy_acceptance.py](../../backend/tools/economy_acceptance.py) can validate the
`treasury` object of the common wire contract and reconcile ordered `(cashDelta,
commitmentDelta)` decimal-string pairs exported from actual ledger observations.
It rejects noncanonical values, negative balances/commitments, spending held funds
and a final snapshot that does not reconcile. It has no legacy numeric stake cap.
It reuses `treasury_models.decimal_integer`, including 5,001-digit values without
changing Python's global conversion limit. It is an independent assertion tool,
not another treasury implementation.

## Evidence manifest

From `backend/`, generate a clearly not-run inventory outside Git:

```bash
uv run python -m tools.economy_acceptance --source FULL_TESTED_COMMIT_SHA --template > /tmp/economy-evidence.json
uv run python -m tools.economy_acceptance --source FULL_TESTED_COMMIT_SHA /tmp/economy-evidence.json
```

Replace `FULL_TESTED_COMMIT_SHA` with the full lowercase 40-character source commit.
The second command exits 1 while any row remains unverified. For a completed row,
keep its `scenario`, `layer` and `sourceCommit`, set `status` to `passed`, and add
the exact `command`, relative local `artifact` path and artifact `sha256` digest.
Artifact paths are relative to the manifest directory; symlinks outside it and
absolute paths are refused. Keep `failed` or `not_run` with a clear reason for
anything that has not passed. Recompute hashes after an intentional evidence change.

The checker requires all SQL and authenticated-browser rows, matching source
commits, nonempty commands and existing artifacts with matching hashes. Missing,
duplicate, fixture-substituted, failed and wrong-source declarations cannot pass.
Its own tests use synthetic files only. Even a complete manifest does not prove
authentication, correct assertions or truth of reported results: independently
review the artifacts and runtime observations. Physical-device evidence is
reported separately and is never inferred from manifest completeness.

Run the offline verifier's tests with
`cd backend && uv run pytest -q server/tests/test_economy_acceptance.py`.
Actual results belong in the review evidence; this document's matrix lists future
checks and does not present them as executed.
