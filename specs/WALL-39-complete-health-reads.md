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
