# Shared economy acceptance

> **What this is:** the MP-ECO-20 test matrix and evidence procedure for reviewers.
>
> **Who uses it:** teammates validating the shared economy before release.

**Status:** database integration preparation. Published draft dependencies now
provide the [contract #515](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/515),
[permission policy #516](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/516) and
[treasury/operation registry #517](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/517).
The permission RPC reader still lacks its production persistent authority provider;
personal Captain/Engineer/assignment and lifecycle integration remain prerequisites.
No row below is a reported authenticated runtime pass. See [#505](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/505)
and the [bounded specification](../../specs/MP-ECO-20-integration-acceptance.md).

## Local database evidence

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
disposable database. These results establish those database boundaries, not the
missing production authority/producer, autonomous lifecycle workers, actual reset
or deletion, public route admission, authenticated clients or physical devices.
The complete matrix below remains a target rather than a completed runtime claim.

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
preserving other players' personal Captain progress. Conversion and the actual
reset/deletion transactions remain prerequisites; this matrix authorizes no activation.

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
