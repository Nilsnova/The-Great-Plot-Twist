# Shared economy acceptance

> **What this is:** the MP-ECO-20 test matrix and evidence procedure for reviewers.
>
> **Who uses it:** teammates validating the shared economy before release.

**Status:** canonical backend and coordinated client source are integrated. The
documented backend regression, full frontend suite and standard build passed at
their recorded sources. Authenticated scenario acceptance remains separate.
The application and test source inventory is `9f107a6cbb57e0a9f01b1f4b8fb60da5d19dacad`.
Merged dependencies
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

The current source contains 107 migrations, including the private
[accepted-prefix freshness boundary](../../supabase/migrations/20261119014418_shared_revival_checkpoint_freshness.sql).
The client includes the [native clock and incomplete-hold correction](../../specs/MP-ECO-11-canonical-client.md#native-clock-correction-and-incomplete-holds),
[bounded idle polling](../../specs/MP-ECO-native-idle-wave-polling.md),
[session reacquisition after an accepted epoch change](../../specs/MP-ECO-11-session-epoch-reconciliation.md)
and [coherent quotes after unchanged arsenal reads](../../specs/MP-ECO-10-arsenal-read-projection.md).
These are implementation facts; each runtime observation retains its own source.

A fresh local stack installed all 106 migrations in canonical timestamp order from
`a6de304bbeb5f45983e18d043c848c71a4566609`. A limited probe used three real
registered Auth users in distinct Chromium processes, the production SDK/API and
private WebSockets, without network interception or authority fixtures. It observed
Captain adoption and fresh control, native bell/replay/input, outsider refusal,
current-topic isolation across admission/departure and terminal state after the last
withdrawal. Fresh-island service-only treasury admission was explicit installer
setup. This was an SDK/API primitive probe, not rendered gameplay or public
legacy-save conversion. Honest channels manually followed current metadata; that
limited probe did not verify automatic product topic changes. Application/migration bytes were unchanged
between that source and the original `5f1cfa7c34b7610234ffaef7b76ac66c143516e2`
inventory; the intervening change was a test. That equivalence does not apply to
the current 107-migration source inventory.

The [test map](../TEST-MAP.md#shared-economy-integration-checkpoint--19-november-2026)
records source-qualified checkpoints. In particular, the historical `799242b4`
broad run remains **15,185 passed, 28 failed, 5 skipped**, exit 1. The later **219**
passing affected cases include those 28 node IDs on their separately recorded
source. They do not establish a final full-backend pass.

The documented backend regression completed on
`37570bf9e5e3c67ebd2eb1a735c9df3c709f3b80`: **15,284 passed in 958.28s**, exit 0,
with no failures, errors or skips. Disposable PostgreSQL was enabled. The sole
exclusion was the unchanged exhaustive
`server/tests/correctness/test_settings_contract.py` matrix. Matching frontend
dependencies were available: all five registry cases and both calm/storm native
SQL → Python → production Node decoder cases executed and passed. Full backend
Ruff and parsing/unique-version checks for all **107 migrations** also passed;
source and migration hashes were unchanged before and after the run. These are
backend/static results, not authenticated rendered-game acceptance.

Candidate `b239bdf094d132fc57969fb31f652f106db8abc5` has the same complete backend
tree, all **825 backend file blobs/modes**, **107 migration hashes**, **13 files in
the native decoder import closure**, and both dependency locks. The entire
repository diff from that tested source is one tutorial-text change in
`frontend/src/campaign/tutorials.json`. Backend results retain their original
`37570bf9` source; no new backend run is claimed for `b239bdf0`.

The unfiltered one-worker frontend suite completed at
`9f107a6cbb57e0a9f01b1f4b8fb60da5d19dacad`: **5,465 passed across 507 test files
in 1229.67s**, exit 0, with no failures, errors or skips. The subsequent standard
production build passed, exit 0. Both stages preserved a clean source, all
migration hashes and both dependency locks. Matching Node v24.22.1 and the locked
frontend installation were verified.

That frontend/build source matches the tested backend tree, all 825 backend
blobs/modes, 107 migration hashes, 13 decoder-closure hashes and both locks exactly.
All **1,484 non-test frontend blobs/modes** also match rendered application source
`b239bdf0`. Its only frontend change is the [explicit full-game Nearby test
budget](../../specs/MP-ECO-20-nearby-input-browser-budget.md); assertions, fixtures
and production code are unchanged. The earlier full `b239bdf0` run remains failed:
**5,464 passed, one failed, no skips**, exit 1. Its same-20-second diagnostic and
the later two-case focused pass remain separate records. This is a test-budget
correction, not a production fix or a relabeled historical result.

Later authenticated observations used the same local provider with one strictly
later additive migration, bringing the installed chain to 107. The original
106-migration installation and the additive installation retain separate source
and content records. Two rendered clients at `a8fa5de1` produced genuine accepted
WON receipts and personal completions for one wave. Independent committed-state
inspection found one 35-coin original-account credit, treasury 100 → 135,
confirmed participation, released assignments/reservation and unchanged personal
wallets. This establishes that observed wave-income case, not free revival or
automatic pacing.

A real idle owner reset at `5a111e05` changed the account/epoch and the owner's
accepted private topic, but the member did not automatically acquire its new
session/topic. That run remains failed; the later session-reconciliation change
was subsequently verified at `b239bdf0`: both honest product clients automatically
acquired the new scoped session and private topic after an actual idle Settings
reset. Cached old SDK sockets were established before reset. Post-reset
new-topic/fresh-revoked-old diagnostic joins ran only after both replacement
product joins had correlated accepted WebSocket replies. Cached old sockets could not exchange new
protected data; stale proof was refused, the original reset UID replayed without a
second effect, and personal Captain data and wallets were preserved. The earlier
failed run remains unchanged. Account deletion was disabled in this reset case.

In a separate free-revival attempt at `b239bdf0`, both rendered clients
completed ordinary tutorial dismissal and pre-bell movement. After an enemy-caused
fall, the helper's ordered hold-start input POST received HTTP 200, but the helper
also fell before a complete two-second hold was observed. Both native loss
receipts settled. This remains a failed free-revival scenario, not a zero-cost
accounting pass.

A subsequent actual two-player case at the same `b239bdf0` application source
completed free teammate revival through the ordinary ordered hold and journal.
Both clients observed the same enemy-caused fall at simulation time 23.45 and
the same revival at 37.7 with 50 HP. Four captured revival requests retained
one original body/UID, target fall, hold and control proof; one immutable receipt
and journal operation supplied the restoration. Before either terminal started,
an independent committed-state observer verified treasury 200 unchanged, both
personal wallets and ledgers unchanged, paid repair quota unchanged and no
financial child or direct-UID debit/reserve/settlement. The later natural loss
settled both own native receipts and is separate from the successful free-help
assertions. This does not establish automatic pacing or the complete matrix.

A separate defended case at `b239bdf0` bought three cannons through ordinary
current UI quotes (200 → 170 → 140 → 110), then received two distinct own native
WON receipts for one canonical wave. The owner paused the break, enabled Auto
next, waited nine real seconds with the normal worker running and resumed through
the UI. The worker created one non-player `wave_auto_start` operation after the
resumed deadline; both clients automatically rendered that same next wave. The
complete browser trace contains exactly one initial start POST/UID and no
additional browser start. This trace proof comes from the rendered harness; the
worker observer alone does not assert it. The automatic start occurred with an
eligible connected leader, not without connected players.

After the browsers closed, the regular production due worker was invoked after
both real `last_seen + 60 seconds` deadlines had elapsed. It closed the new attempt
as abandoned with zero loot, withdrew both slots, released controls and cleared
both personal assignments. A second quiescent read matched. This is a separate
no-browser closure observation, not another victory or an accelerated clock.

A final separate local test-owned Account UI case verified explicit owner deletion.
The initial confirmation returned 409 and required the additional owned-island
confirmation; that ordinary second action returned 200. The peer automatically
cleared the island room and retained personal Captain data, progress and wallet.
The deleted owner's cached token received API 404 `player_not_set_up` and
independent Auth 403. This proves the observed refusal, not immediate token-cache
eviction or universal 401 responses. The case performed no reset, Auto next toggle
or new grant, and does not claim malicious cached-socket revocation on deletion.

| Pending acceptance gate | Required next observation |
|---|---|
| Final common source | Preserve the completed backend/frontend/build results and exact source comparisons above. Retain subsequent source differences explicitly and finish rendered acceptance. Retain exact failures/skips and source hashes. |
| Coordinated client behavior | The integrated snapshot advertises arsenal/session/repair/reset/market/match; move remains unavailable. Verify their reachable controls and current source/authority fences through the rendered game. An available capability does not grant membership, ownership or action permission, and direct SDK success alone does not establish product behavior. |
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
selection. The later 107-migration rendered reset case verifies the bounded
automatic transition described above; other admission, departure and deletion
transitions retain their own scenario requirements.

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
