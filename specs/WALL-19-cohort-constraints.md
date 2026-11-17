# WALL-19: bounded perimeter-wall database admission

For Johannes Franz Lang (`frcola`), implementing issue [#260](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/260) on `feat/wall-19-cohort-constraints`. No live migration application or merge.

## Scope and plan

1. Admit canonical `wall_1` through `wall_128` in building, layout and structure-health constraints, preserving every existing non-wall pair.
2. Refuse insertion of added wall IDs unless the persisted island policy admits the cohort and the positioned-build transaction names that island, payer and piece.
3. Require the coordinate to exist in the same transaction; keep old single-build calls from creating unpositioned new walls.
4. Delete added inventory-wall layout rows when their building is deleted, while preserving legacy reserved positions.
5. Verify exact ID boundaries, table privileges, transactional refusal/rollback and old/new deletion semantics in disposable PostgreSQL.

Root owns the preceding `20261117140000_wall_policy.sql` migration and positioned transaction API. This child owns only `20261117141000_wall_cohort.sql` and its focused tests. Payment, recovery and refund business rules remain in their existing functions; later guards are separate tasks. The authority marker is service-transaction context, not a client-selectable version or permission.

## Evidence and risks

The new constraints do not by themselves complete read/vector capacity, recovery, refunds, pathing, placement or the wall builder. Those remain required dependencies of the full-perimeter release. A missing authority marker must roll back the whole old build transaction, including any wallet debit. Migration order must preserve all D060 and home-building pairs. The migration is applied twice by the scratch harness to check rerun safety; no production database is involved.

Implementation and exact executed results will be recorded here before handover. The draft stays open for Johannes's explain-back and a different human's review.
