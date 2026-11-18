# Reconcile historical paid revivals

> **What this is:** A conservative administrator tool for historical revival payments whose
> battle effect was never durably recorded.
>
> **Who uses it:** The responsible teammate, database operator and reviewers.

- **Status:** implemented; human review pending. No live audit or refund was performed.
- **Responsible teammate:** Ianno
- **Publication branch:** `fix/historical-revive-reconciliation-review`, stacked on reward draft [#486](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/486); main base `db573347`.
- **Development branch:** `fix/historical-revive-reconciliation`
- **Issue:** [#484 — Audit and reconcile confirmed historical missing revival payments](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/484), published after Ianno's explicit approval.
- **Reviewer:** a different human teammate, to be assigned before merge.

## Goal and scope

Return the original paid coins once when the retained database evidence proves that a closed
protocol-2 wave never recorded a potentially matching revival. Preserve every ambiguous case.
The earlier atomic revival fix handles new payments; this tool addresses retained older records.

The service-only `recovery_revive_reconcile(payment_id, apply=false)` function classifies one
original debit. Default calls read only. Explicit apply locks the payer wallet, sorted islands,
recovery state and wave, then rechecks the same evidence. Confirmed refunds use existing
`admin_adjust`, ref `revive_refund:<original debit id>`, and exactly the original paid amount.
Original receipts, events and closed state stay unchanged. There is no public HTTP route, new
table, wallet reason, client feature or automatic schedule.

## Evidence and limits

Required evidence is a matching receipt/debit, saved protocol 2/version 1, retained wave and
target identity, consistent closed state, and a complete readable contiguous journal from 1
through its head. Malformed input commands leave the record unresolved.
Any possibly matching same-target revival blocks automatic refund, including another payer's
old `captain_input` without a payment reference or fall tick. UUID comparison ignores case.
Each call inspects at most 50,001 journal rows; larger histories remain unresolved.

Legacy room delivery has no durable record. Reset may delete receipts while retaining debits;
old commands omit the paid fall identity. Current simulator code is not historical proof because
snapshots do not pin its revision. These cases remain explicitly ambiguous. Open waves remain
pending. A verified original request may retry the existing atomic revival RPC with its original
UID and valid captured position; this tool never invents coordinates or appends a guessed effect.

## Deliverables

- Migration `20261118070000_revive_reconciliation.sql`: read-only classification and atomic,
  repeat-safe confirmed-only refund under server-only grants.
- Bounded operator SQL in `docs/handoff/`: dry-run default, explicit candidate list and apply switch.
- Disposable PostgreSQL tests; database/operator documentation in `supabase/README.md`.
- The shared interface overview is updated by the integration writer.

## Tests written before implementation

- Confirmed missing closed revival: dry run changes nothing; apply returns the exact paid amount
  once, including repeat after receipt deletion and two concurrent applies.
- Successful atomic event, unlinked old event, other helper's event and legacy receipt: no refund.
- Open wave, incomplete/gapped/oversized history, missing receipt or target identity, and
  debit/receipt mismatch: no refund.
- Conflicting refund ref and forced ledger insert failure: no duplicate or partial balance change.
- Browser roles cannot execute the function; full migration chain can be applied twice.

## Verification and remaining work

Run the focused opt-in PostgreSQL tests with `CASE_PG_SCRATCH=1 uv run --with pgserver --with
'psycopg[binary]' pytest -q server/tests/island_sql/test_revive_reconciliation_sql.py`, Ruff,
format and diff checks. The integration writer runs broader final checks. Production inspection,
candidate approval, migration application and actual refunds are separate operator work; none
are performed by these tests. Last updated: 2026-11-18.

Final focused results: 22 historical and 41 surrounding PostgreSQL tests passed; full migration
chain applied twice. Exact combined checks, evidence limits and operator steps are in the
[integration handover](../docs/handoff/return-recovery-2026-11-18.md).

## Publication verification

The final review stack is based on main `db573347` with core #485 and reward #486 retained.
The historical SQL, operator runner and 22 regression cases match the previously reviewed
source. Agent review found no concrete blocker. Publication-head combined results, browser
screenshots, exact commands and the unchanged-main Group3 test limitation are recorded in
[the final handover](../docs/handoff/return-recovery-2026-11-18.md#publication-verification-on-current-main).
Different human approval and any authorized live operation remain outstanding. No production
records were inspected, migrations applied live or compensation issued.

Draft review: [#490](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/490), stacked on #486 and #485. Different human approval remains pending.
