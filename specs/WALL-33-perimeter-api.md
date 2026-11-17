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

Enable/quote implemented in Draft [#302](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/302). `perimeter_walls` is registered off by default. Owner-only admission materializes all 26 effective old positions; repeated admission is safe after offers pause. Quote uses the owner cohort, actual payer role, canonical connected cells and the trusted reset epoch. Paid build/receipt reconciliation is the dependent second API slice; the full task remains open.

Focused command from backend: `uv run --frozen --no-env-file pytest -q server/tests/test_wall_offer_routes.py server/tests/test_wall_layout_snapshot.py server/tests/test_owner_wall_policy_routes.py server/tests/test_wall_chain.py` -> **71 passed in 4.23s**. Backend Ruff check passed; ten changed/dependency Python files passed format check. No live migration application, activation, deployment or merge.

Explain-back: opening perimeter construction is an explicit owner action. The server chooses the available pieces and prices from current island progress and the person paying. A quote includes the reset epoch so it cannot authorize a purchase in a later reset.

Questions: Why is admission owner-only? Why does a quoted price not authorize payment? Why must the epoch come from the same trusted snapshot as coordinates?

## Trusted reset scope prerequisite

The atomic layout read now carries `islandEpoch` from the same database snapshot. The adapter requires a canonical UUID for admitted rule 1 (legacy rule 0 may have no epoch yet). Quotes/build intents retain that scope so a quote cannot silently purchase on a reset island whose layout/role/wave happen to match. Original committed receipt lookup still precedes fresh epoch eligibility.

Prerequisite focused check: `uv run --frozen --no-env-file pytest -q server/tests/test_wall_layout_snapshot.py server/tests/test_owner_wall_policy_routes.py server/tests/test_island_move_routes.py` -> **56 passed in 2.93s**; Ruff passed on the three changed files. This is transport evidence; real reset fencing remains separately verified in SQL.
