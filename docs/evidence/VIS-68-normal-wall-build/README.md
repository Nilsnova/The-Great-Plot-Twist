# VIS68: fresh ordinary wall purchases honor scenery clearance

Responsible human: **Johannes Franz Lang (`frcola`)**.
Issue: [#454](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/454).
Branch: `fix/vis-68-wall-build-guard`.
Actual fork base: `7e60fe1addafaa5f62ad81f53db6d01fda78f0c5`, which retains the
requested `c4ea1b63` base and the coordinator's subsequent water refinement.

## Scope claimed before implementation

Close the fresh normal-purchase path for original `wall_1` through `wall_12` on
own and shared islands under both supported wall policies. Already-built walls,
old-save reads, prices, upgrade rules and original action receipt replay remain
unchanged. A preflight check alone is insufficient: the paid transaction must
fence the exact layout/policy that was validated, or validate under the same lock.

Frontend fake parity will be delivered first so the coordinator can freeze the
visual candidate. Any required SQL is an additive migration for disposable local
verification and later owner review only; no live application is authorized.

## Implemented behavior

[Draft #455](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/455) closes the
ordinary purchase route for original walls. This is separate from the positioned
wall-run API, which already validated and fenced its quoted coordinates.

The frontend fake's wall check now runs inside `buildOn`, after the original UID,
kind, standing-building and unlock checks and before debit. It applies under both
policies. The existing policy-1 preflight for non-wall buildings stays intact.
Replaying a historical UID, including after demolition, neither revalidates nor
rebuilds its old purchase.

The trusted server derives a fresh original wall's **displayed effective cell**
from one atomic layout/policy snapshot. This matters under policy 0: D056 may
display an off-lane raw coordinate at a different lane cell. The validator must
check the same cell the player sees, not just its raw saved row.

The existing own `islet_build` and shared `island_build` names have new mandatory
guard-argument overloads. The server adds exactly `p_x_half`, `p_z_half`, `p_seen`,
`p_expected_rule_version`, `p_expected_capacity` for original-wall purchases.
The public HTTP request shape and all non-wall RPC calls stay unchanged.

[`wall_purchase.py`](../../../backend/server/island/wall_purchase.py) prepares
those fields. [`service.py`](../../../backend/server/island/service.py) still
checks normal rules/prices first, while old paid refs reconcile before new
obstruction validation. Own-island ledger reconciliation also covers a historical
purchase whose building has since been removed.

## Atomic boundary and required migration

The additive, **unapplied** candidate is
[`20261118060000_wall_single_build_clearance.sql`](../../../supabase/migrations/20261118060000_wall_single_build_clearance.sql).
There are 72 unique migration versions in this source. The fixture executes the
whole chain twice on disposable PostgreSQL; that does not apply it to Supabase.

The service-only transaction wrapper:

1. Locks the payer wallet, then the owner island, matching existing paid paths.
2. Rechecks membership. Original UID replay and already-standing refusals precede
   today's obstruction checks and layout comparison.
3. Compares the complete raw layout rows and policy/capacity against the exact
   snapshot Python checked. A change returns `busy`, without purchase.
4. Checks the same fourteen static ground reserves again in SQL. A real Node
   import and the Python catalogue are compared with the SQL values in a
   disposable test; their contents must agree.
5. In one bounded subtransaction, creates transaction-local proof and invokes the
   original paid function. A checked cell is materialized **only if it differs**
   from the saved cell or absent-row canonical default. A matching saved row keeps
   its exact `moved_by` and `moved_at`; an absent default stays absent, preserving
   the layout version. A refusal rolls any necessary cell change back too.
6. Restores the previous proof after success. Error/refusal rolls the proof back
   with the subtransaction. No proof remains accidentally usable by a later call.

The fresh-original-wall INSERT trigger requires exact bounded proof: owner,
payer, plot, ref and checked half-grid coordinates matching the actual row or its
canonical default when absent. That fallback is read after the owner lock and
full snapshot comparison. The
existing positioned-chain context is also accepted for its matching original
pieces; its owner, payer, UID, bounded plot list, ref suffix and saved policy must
fit. Both paths retain the static clearance check. The trigger takes no late
owner lock: the authorized transactions already hold wallet then owner locks.

**Fresh original-wall calls through old service-only signatures intentionally fail
closed without that proof.** Old UID replay, already-standing refusal, upgrades
and reads insert nothing and retain their existing behavior. This restriction
closes an independently reproduced gap: raw `wall_1=(-3.5,4)` is scenery-clear,
but D056 displays it at `(-3,3)`, crossing the record board. Checking only the raw
row would allow an older purchase path to bypass the effective-cell rule.

The owner must apply the reviewed migration and verify the new RPC overloads
before deploying this backend. An old or stale API schema rejects the mandatory
extra parameters; the service does **not** fall back to an unchecked signature.
That failure is currently reported through the existing database-error path.
No live schema/cache or production deployment was verified by this writer.

The limit is deliberate: this fixes fresh purchases, not preexisting overlapping
walls. A player may move an old wall out, but opening the save never relocates it.
Future prop relocation must update the client and Python data together with a
new additive SQL migration; the three-way parity check should catch drift.

## Existing verification fixtures

SQL fixtures now create fresh original walls through the actual geometry validator
and guarded overloads, with payer-wallet then owner locks. Existing arbitrary
bounded own refs are preserved exactly. No trigger is disabled, no GUC is forged
to make a normal fixture pass, and no old test assertion is deleted or relaxed.

Targeted setup changes keep the intended scenarios real:

- A shared-island visitor joins through the existing game API before buying.
- Workshop movement supplies the actual complete snapshot rather than assuming
  an empty layout after a fresh wall has materialized its checked coordinate.
- Fresh-start setup retains its original INSERT: a normal default purchase must
  not create a gratuitous layout row. Eight new regressions also check absent
  defaults and unchanged saved movement metadata across both policies/payers.
- The demolition contention case rebuilds through a real paid purchase by the
  other member. Its wallet is locked before the owner row, avoiding an artificial
  reversed-lock setup while retaining all original busy/refund assertions.
- The legacy level-three refund case first obtains a valid site, then declares
  its historical level without modern contribution rows.

## Exact executed results

The initial implementation and strict follow-up have distinct evidence. Logs are
retained with their actual failures; earlier passes do not stand for the final
stricter contract.

| Run | Result |
|---|---|
| Corrected-fixture frontend baseline | `7 failed / 7 passed (14)`, 745ms. The first exploratory run also retains two setup errors, then their corrected baseline. |
| Final frontend slice | `90 passed (90)`, five files, 2.41s. No frontend source change after `0d745a26`. |
| Tests-first backend HTTP | `16 failed / 3 passed`, 2.73s. |
| Guarded backend HTTP | `19 passed in 3.31s`. |
| Initial SQL baseline | `19 failed in 6.21s`, on the old 71-migration schema. |
| First atomic SQL source | `19 passed in 6.44s`; then strengthened SQL/HTTP selection `41 passed in 8.66s`. This source still had the subsequently found old-signature raw/effective gap. |
| Broader initial backend | `182 passed in 15.45s`, eight selected files. This is historical pre-context evidence. |
| Concrete raw/effective gap before strict proof | `2 failed / 22 deselected`, 4.98s: both old signatures wrongly inserted a displayed overlap. |
| First strict fixture run | `54 passed / 2 failed`, 6.87s: old fresh-start setup inserted an already materialized row. |
| Broader strict fixture run | `139 passed / 2 failed`, 17.09s: missing visitor membership and an obsolete empty-CAS setup. |
| Strict affected PostgreSQL before broad compatibility feedback | `141 passed in 15.31s`, eight files, zero skips. This still wrote gratuitous default/matching layout rows. |
| Coordinator wider run on the preceding source | `1,758 passed / 5 failed / 21 setup errors`, 141.77s. Repeated setup errors and one admission failure exposed the gratuitous row write; three old fresh-construction profiles crossed a tree, and one positive kind-pair fixture lacked the newly required proof. The original failed log is retained. |
| Current compatible affected PostgreSQL | **`292 passed in 9.72s`**, seven files, zero skips, covering every failed file above. Includes eight new no-write regressions, true off-lane materialization, the raw/effective bypass, actual two-connection lock contention, policy/layout CAS, proof lifetime and malformed/wrong-owner/plot/ref/coordinate cases. All 72 migrations execute twice. |
| Whole backend Ruff after the compatibility fix | **`All checks passed!`** Earlier unrelated and new formatting diagnostics are retained separately. |

Frontend command from `frontend/`:

```bash
npm test -- --maxWorkers=1 tests/island/normal-wall-scenery.test.js tests/island/scenery-clearance.test.js tests/island/move-mode.test.js tests/island/wall-policy-preview.test.js tests/island/wall-runs-fake.test.js
```

PostgreSQL command from `backend/` (existing dependencies plus ephemeral test-only
packages; no environment file and only the fixture's private Unix socket):

```bash
CASE_PG_SCRATCH=1 UV_CACHE_DIR=/workspace/.cache/uv UV_PROJECT_ENVIRONMENT=/workspace/The-Great-Plot-Twist/backend/.venv uv run --frozen --no-env-file --no-sync --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_normal_wall_build_clearance_sql.py server/tests/island_sql/test_islands_and_waves_sql.py server/tests/island_sql/test_island_fresh_start_sql.py server/tests/island_sql/test_wall_policy_sql.py server/tests/island_sql/test_wall_cohort_sql.py server/tests/island_sql/test_perimeter_v1_lifecycle_sql.py server/tests/island_sql/test_structure_recovery_mutations_sql.py
```

## Evidence and remaining work

[Source and invariant receipt](source.json), [original logs](raw/) and their
[hash manifest](manifest.json) distinguish final source from earlier attempts.
The final frontend runtime tree is identical to the frozen `0d745a26` tree.
Documentation commits and build stamps are separate from that source identity.

The final fresh 11-piece lifecycle setup uses a slice of the separately measured
scenery-clear profile; its original paid wall, immutable wave template, IDs,
contributions, amounts and all assertions remain unchanged. The cohort's positive
original-wall kind pairs now use a real guarded purchase and assert success;
negative raw-insertion tests still exercise the constraint directly.

The coordinator owns the repeated wider selection and combined regression/build/budget/text/accessibility/demo
checks and actual desktop/phone captures. No Chrome, new app dependency, full
backend suite, live SQL, deployment, production persistence or physical-device
check was performed by this writer. This component does not claim complete-suite
green, human acceptance or permission to apply the migration.

## Explain-back

I closed the normal Build button's path as well as the separate wall-run path.
Python checks the wall's displayed position, then SQL locks the wallet and island
and checks that the same layout is still current. SQL briefly grants proof only
for that exact fresh wall and coordinate. A refusal rolls the position and money
back together; an old payment retry returns before the new check. Existing saved
walls do not move when the island is read.

1. Why can a raw old coordinate differ from its displayed legacy lane cell?
2. Why is Python validation insufficient without the locked snapshot comparison?
3. Why must the proof disappear after success and roll back on failure?

Keep Draft. Explain-back, current responsible-human review and approval by a
different human remain required. No PR merge or readiness is claimed.
