# WALL-33 — authenticated perimeter APIs

Responsible human: Johannes Franz Lang (`frcola`), [issue #301](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/301). This first bounded draft adds owner-only enable and authoritative quote APIs; paid build/receipt reconciliation is a separate dependent draft under the same task.

## Plan and ownership

1. Register off-by-default perimeter_walls and authenticated strict routes with existing budgets/no-store policy.
2. Gate new offers on perimeter_walls, placement and configured/persisted V1 capability; owner-only admission materializes effective old geometry through SQL policy/row CAS.
3. Quote bounded connected cells from actual owner/payer state using the reviewed canonical helper.
4. Add direct HTTP evidence for permissions, feature/capability gates, coordinate preservation, malformed input and price/remaining authority.
5. Keep existing receipt reconciliation available when offers pause in the dependent paid-build slice.
6. Report focused results and hand off to actual SQL/browser lifecycle acceptance.

Owned: new wall_build.py/routes/island_walls.py, narrow router/flag hooks and shared fake/tests. SQL migration/atomic transactions remain separately owned. Missing new RPC never means success or a legacy downgrade. No new package, live migration apply, activation, deployment or merge.

## Status

Claimed; implementation/checks pending. Source/test change stays bounded; the full task remains open until both API slices and their integration evidence are complete.
