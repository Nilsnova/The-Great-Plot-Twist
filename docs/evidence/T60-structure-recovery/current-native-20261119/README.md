# Current native repair and journal evidence

This is T60/#126 verification for Ianno Hollensteiner. Application source is
`3bdd8eda16470795fdedd68c42fffab54e5f2ced`; this contribution changes tests,
offline tooling and evidence, not production gameplay or migrations. Historical
gradual-recovery and fake-room results in the parent directory remain historical.

## Verified locally

- **Four new native/HTTP cases passed in 18.05 seconds**, one each for canonical
  won/lost/expired/abandoned closure. The actual producer accepts the bell and
  freezes two real fixture controllers. During its real three-second countdown,
  an intact repair refuses without effects. After actual elapsed countdown,
  accepted damage, stale-price refusal, three actor-shared repairs, the refused
  fourth action, same-UID replay after later damage, disconnect/reattach and
  immutable original receipt are verified. Both HTTP actors read the same funds,
  quota and HP. Closure gives full current HP while preserving damaged closed HP.
  Authentication and accepted damage reports are explicitly synthetic, and each
  terminal outcome is a trusted test parameter to the actual private canonical
  close hook. This proves closure effects, rather than natural expiry/outcome
  selection by a public handler or worker. There is no substitute persisted
  authority or overwritten canonical state.
- **Thirteen budget/HTTP cases passed in 8.37 seconds**: the new native journal
  diagnostic, ten planner cases and two existing real shared-repair HTTP cases.
  The full 107-migration chain is applied twice to disposable PostgreSQL. This is
  local domain/API evidence, not provider-issued sign-in or a hosted migration.
- **Twelve frontend tests in three files passed in 1.54 seconds**. The new
  [egress observation](paid-restore-egress.json) uses two independent production
  replay consumers, one reconstructed from the original prefix. A living boarder
  starts inside the ruin; at tick 393, five ticks after paid restoration, both
  observe that boarder outside the footprint while the tower still has 80 HP.
  Both towers fire and both simulations agree. Disappearance or destruction
  cannot satisfy the assertion. The sealed paid event is a synthetic fixture;
  this closes the specific deterministic egress assertion, not authenticated
  payment/realtime acceptance.
- Scoped Ruff and whitespace checks passed. The actual-provider scenario module
  passes `node --check`; its provider/rendered execution has not yet been run.

Exact commands, from `backend/` unless stated otherwise:

```sh
CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast \
  python -m pytest -q server/tests/island_sql/test_t60_shared_repair_acceptance_sql.py
CASE_PG_SCRATCH=1 WRITE_T60_NATIVE_DIAGNOSTIC=1 uv run --with pgserver \
  --with 'psycopg[binary]' --with pglast python -m pytest -q \
  server/tests/island_sql/test_t60_native_journal_budget_sql.py \
  server/tests/island_sql/test_shared_repair_http_pg.py \
  server/tests/test_recovery_journal_budget.py
# frontend/
WRITE_T60_EGRESS_DIAGNOSTIC=1 npm test -- --maxWorkers=1 \
  tests/pirates/paid-restore-egress.test.js \
  tests/pirates/recovery-tower-replay.test.js tests/pirates/pathing-wiring.test.js
node --check scripts/authenticated-economy/paid-repair.mjs
```

Runs used the existing locked environment with `--no-sync` and writable
`UV_CACHE_DIR=/workspace/.cache/uv`. No dependency or lockfile was changed.

Initial new-test failures exposed fixture assumptions: login tokens still need
three parts; a second session cannot take over retained control; already-full
HP uses zero compatibility wait, while the old rate field remains metadata.
The corrected test uses genuine same-session disconnect/reattach and verifies
full current HP plus immutable closed damage, without changing production code.
The initial planner collection failed on its absent module before implementation;
all ten planner checks now pass. These diagnostics are not reported as passes.

## Measured capacity and safe retention

[The native sample](journal-budget.json) contains 2,000 actual accepted movement
inputs from two controllers in 32-item batches. Its fixed head drains in eight
pages. Measured scratch table-plus-index allocation is 1,318,912 bytes; maximum
encoded page is 95,384 bytes. Mean batch SQL time is 24.314 ms and maximum page
SQL time is 5.609 ms. All 2,000 journal rows and the canonical closure remain
after terminal handling. The report pins its measurement-file SHA-256.

These are local sample measurements. Other commands, skill payloads, concurrent
workers, network latency and production storage can differ. Do not call sample
throughput a capacity guarantee or a durable request cap.

The new read-only planner requires explicit source, total retained-wave/event
demand, storage/event budgets and a positive safety multiplier. Both example
plans retain **all** history; 50/100 waves are illustrative total workloads, not
TTL values or cleanup thresholds. The illustrative 1 GiB budget is not a selected
hosting limit. At twofold sample allocation, 50 × 14,400 events reserves
950,400,000 bytes ([example](capacity-example.json)); 100 waves requires
1,900,800,000 bytes and correctly exits 2
([refusal](capacity-refusal.json)). Source mismatch or either exceeded budget
also refuses. Exact integer arithmetic and upward rounding preserve large counts.

```sh
uv run python -m tools.recovery_journal_budget \
  ../docs/evidence/T60-structure-recovery/current-native-20261119/journal-budget.json \
  --source-commit 3bdd8eda16470795fdedd68c42fffab54e5f2ced \
  --retained-waves 100 --events-per-wave 14400 \
  --storage-budget-bytes 1073741824 --event-budget 2000000 --safety-factor 2
# Expected exit 2: storage_budget_exceeded. No database is contacted or changed.
```

There is no automatic deletion, new retention period or live setting. The planner
has no database client and cannot remove journals, snapshots, accounting,
receipts, obligations or completion history. A refused plan means capacity and
new-wave admission must be reviewed before rollout; deleting history is not a
remedy. HTTP token buckets remain process-local and do not bound aggregate
multi-worker storage. Real operating budgets must be selected for the deployment
and measured against the complete retained inventory. Broader gameplay balance
remains tracked by #512; release approval remains #513.

## Actual-provider acceptance

`frontend/scripts/authenticated-economy/paid-repair.mjs` exports an isolated
scenario for two actual rendered clients on the same admitted island. It uses
natural simulation damage, actual repair-card clicks, an ordinary reconnect,
original-request retry, shared quota and canonical terminal handling. Its direct
retry/fourth-request probes are explicitly transport checks. It records failure
before throwing and never replaces responses, HP or journal data.

At this checkpoint that scenario is **not run**. Provider infrastructure,
temporary test-owned accounts and complete rendered acceptance are reported
separately. The local lower-layer successes above do not manufacture an
authenticated two-client pass. No hosted data, migration, deployment or activation
was used.
