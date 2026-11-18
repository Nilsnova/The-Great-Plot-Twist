**Status:** Authorized for a focused implementation by Johannes Franz Lang (`frcola`). No merge, live migration application or activation.

## Goal

Read every wall of an admitted 128-piece island without silently truncating the legacy wall-health response. An island can own the new cohort before its first V1 wave; those built walls still need truthful full/default legacy health in the read path.

## Scope and likely files

- `backend/server/island/wall_repair.py`: bounded complete wall reads, exact identities/duplicates/state validation and a clear unsupported legacy-restore guard for new cohort IDs.
- Focused Python tests for all 128 rows, overflow, malformed/duplicate identities, default health and preservation of legacy prices/guards.

The current `MAX_WALL_ROWS = 50` query can silently drop paid rows, especially under lexical ID ordering. This task does not change recovery rates, report authority, repair prices or the requirement that perimeter combat uses V1.

## Plan

1. Inspect current health reads and legacy restore permission/order behavior.
2. Query at most 129 rows: the complete 128-piece bound plus one overflow sentinel.
3. Reject overflow, duplicate/noncanonical IDs and malformed health/level state rather than silently omit or overwrite a wall.
4. Preserve default full health and existing timer/price behavior for all valid rows.
5. After current target permission checks, refuse legacy paid restore for new admitted cohort IDs with `client_update_required`; leave the supported old-wall path intact.
6. Run focused regression checks and hand over source, exact results and remaining integration evidence.

## Acceptance checks

- [ ] All exact IDs wall_1 through wall_128 can be read once, including the last ID.
- [ ] A 129th row is detected even when the database honors the requested limit.
- [ ] Duplicate, leading-zero, unknown, wrong-type and out-of-range state fail closed without fabricating full health.
- [ ] Fresh added walls remain visible as full health before V1 admission; existing damaged walls retain their real timer and price.
- [ ] A new-ID legacy repair cannot debit money or invoke an unsupported old RPC; current actor access is checked first.
- [ ] Ordinary original-wall repairs, upgrade/report guards and unknown-ID behavior remain supported.
- [ ] Focused tests and Ruff pass; no live changes or merge.

## Concrete cases

| Input | Action | Expected |
|---|---|---|
| 128 canonical built walls with default full health | Read through an adapter honoring the query limit | All 128 returned, no wall disappears |
| 129 rows or duplicate wall_128 | Read | Clear failure instead of truncation or overwrite |
| wall_013, wall_129, malformed health or level | Read | Unreadable state fails closed |
| Admitted V0 owner with a built new wall | Read, then request legacy restore | Truthful health read; update refusal before the old paid RPC |
| Original damaged wall or a nonmember caller | Use existing repair path | Existing price/health/permission behavior preserved |

## Verification and explain-back

Run meaningful focused Python tests and Ruff; report exact outcomes and distinguish them from full application or production evidence. Johannes should explain why the query reads one extra row, why duplicate IDs cannot be overwritten, and why new pieces do not use the old repair RPC.

## Implemented handoff

Draft [#318](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/318), tracking [#317](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/317), starts from aggregate `dc6f80efb6f2811b0fee1b8cd1b475b8ae5e0dba`. The response shape is unchanged. `read_walls` reads 128 plus an overflow sentinel and rejects duplicate/noncanonical IDs and invalid level/health ranges. It does not invent missing full health or silently overwrite a paid wall. Old timers, prices and report capping remain unchanged.

After resolving current actor access, legacy restore for a canonical added ID reads the trusted owner policy. An admitted new piece receives `409 client_update_required` before the unsupported paid RPC; an unadmitted added identity remains `404 no_such_spot`. Original-wall restores keep their existing behavior.

Executed from `backend/`, using the existing installed environment:

```sh
/workspace/The-Great-Plot-Twist/backend/.venv/bin/python -m pytest -q server/tests/test_perimeter_wall_health_reads.py server/tests/test_wall_recovery.py server/tests/test_wave_recovery_routes.py
/workspace/The-Great-Plot-Twist/backend/.venv/bin/ruff check server/island/wall_repair.py server/tests/test_perimeter_wall_health_reads.py
```

Results: **65 passed in 5.02s**; Ruff **All checks passed!**; `git diff --check` passed. The focused API fixture verifies all 128 fresh/full walls while recovery policy is still V0, explicit first/last added-ID restore refusal, and access-before-policy order. A query-honoring fake proves the old truncation regression rather than returning more rows than requested.

Full application/client decoder/SQL/browser/perimeter journey evidence is separate; this backend read slice does not claim those checks, activation, production or a merge. WALL-40 owns the corresponding client response bounds.
