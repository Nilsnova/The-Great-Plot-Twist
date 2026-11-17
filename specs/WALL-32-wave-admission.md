**Status:** Approved for draft implementation by Johannes Franz Lang (`frcola`), following the full-perimeter request. One writer owns this branch. No merge, live migration application or activation.

## Goal

Fence every new perimeter-wave start against the trusted owner policy while holding the same island lock as admission. A Python preflight alone can race owner admission; the database must refuse unsupported protocol/recovery/geometry and preserve immutable same-context retries.

## Scope and likely files

- New `supabase/migrations/20261117144000_perimeter_wave_start.sql`: service-only `perimeter_wave_start` wrapper with the existing sixteen recovery-start parameters plus bounded `p_wall_client_version` (default 0).
- `backend/server/island/waves.py`: route new public starts through the wrapper.
- Focused disposable-Postgres tests for owner locks, capability/rule/policy checks, immutable replay and legacy behavior; narrow route/fake adapter handoffs where needed.

Depends on WALL-25 trusted owner policy and [WALL-22 #263](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/263), [Draft #297](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/297). Existing recovery calculations, prices, max HP and history stay unchanged. No simulator edit or lifecycle-function text rewriting.

## Plan

1. Inspect the final recovery/legacy start lock order and existing UID behavior.
2. Add a bounded wrapper that locks the actual owner, validates current membership and reads the persisted policy.
3. Preserve same-context immutable replay and refuse UID reuse for another target context.
4. For a fresh perimeter wave require protocol 2, persisted V1 or actual V1 admission, and the exact trusted numeric policy/pathing/perimeter template.
5. Delegate the existing recovery lifecycle after those checks; leave ordinary legacy/Pirate Point behavior intact.
6. Wire the backend start adapter, run exact focused and coordinated scratch SQL checks, and document remaining rollout/human-review gates.

## Acceptance checks

- [ ] The wrapper uses the existing owner → recovery-state lock order; no owner-then-nested-wallet inversion.
- [ ] Policy admission racing a stale legacy/client request cannot create an unsupported wave.
- [ ] Protocol-1 perimeter starts and unavailable recovery fail before wave/participant creation.
- [ ] Policy metadata, frozen pathing and `perimeterWalls` must agree with actual owner policy; malformed or incomplete templates cannot grant geometry permission.
- [ ] Same owner/place/UID retries return the original frozen snapshot; later flags/templates do not rewrite history.
- [ ] Current membership is checked before private replay; cross-target UID reuse refuses safely.
- [ ] Legacy policy and Pirate Point retain supported behavior, rewards and health rules.
- [ ] Grants remain service-only, SQL applies twice in a disposable test database, and no live database is touched.

## Concrete cases

| Input | Action | Expected result |
|---|---|---|
| Python saw legacy policy, then owner admits perimeter mode | Start with the stale protocol-1 request | Database sees current policy under lock and refuses; no wave or participant |
| Perimeter owner with no persisted V1 and admission unavailable | Start protocol 2 | Clear refusal, no unsupported wave |
| Correct owner/policy with absent pathing, wrong capacity or malformed marker | Attempt fresh start | Refusal before creating a wave |
| A real accepted perimeter start and changed subsequent template | Retry same UID | Same original frozen wave/metadata, no new reservation |
| Former member or a known UID for another island | Replay | No private snapshot disclosure or cross-context start |
| Legacy island or Pirate Point | Start using supported existing inputs | Existing delegated behavior retained |

## Verification and explain-back

Run focused Python/Ruff and the coordinated full-migration disposable SQL tests; report actual source, commands and exact result lines. No passing SQL or production result is claimed by issue creation.

Johannes should explain: (1) why a Python check can race admission, (2) why permission and target context precede receipt replay, and (3) why the wrapper delegates the old lifecycle instead of copying it.

**Risks:** lock-order inversion, mutable retry snapshots, incomplete deployment leaving old public start paths, or treating a client capability field as placement authority. No merge or rollout until the full implementation and independent human review are complete.

## Implemented handoff

Tracks [WALL-32 #303](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/303), native child of wall epic #241. Draft [#304](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/304) is stacked on recovery/wire #297. The existing start functions were inspected: they lock the owner before recovery state and take no player-wallet lock. The wrapper retains that order, checks current membership before private UID replay, refuses target-context reuse and delegates the existing lifecycle rather than copying it.

A fresh admitted perimeter wave requires the exact current policy, protocol 2, a client advertising `wallClientVersion: 1`, actual V1 recovery support, and coherent numeric policy/geometry/pathing metadata. The capability is a software constant sent by the updated protocol-2 browser; it grants no placement or island permission. Missing capability refuses before creating a wave. Immutable same-context SQL retries can still return the original snapshot; public geometry version 2 independently fences older readers.

`start_protocol2` now calls the new wrapper. The test-only negotiated-start alias handoff from commit `2097fbdb` is included as `18ac1dd3`, preserving the other writer's authorship and existing legacy test helpers. The disposable-Postgres adapter allows the new RPC.

Executed from `backend/`, using the existing environment:

```sh
/workspace/The-Great-Plot-Twist/backend/.venv/bin/python -m pytest -q server/tests/test_perimeter_start_capability.py server/tests/test_perimeter_wave_state.py server/tests/test_wave_recovery_routes.py server/tests/test_wave_recovery_transport.py server/tests/test_wave_routes.py
```

Result: **138 passed in 18.63s**. From `frontend/`, `npm test -- --maxWorkers=1 tests/island/api.test.js tests/island/structure-recovery-api.test.js` passed **22 tests / 2 files in 1.59s**. Focused Ruff and `git diff --check` passed.

The new SQL tests cover fresh legacy/V1 admission, unavailable/old clients, malformed and NULL rule entries, immutable retry, current membership, cross-target UID reuse, service-only grants and a competing stale start that must wait on the actual owner-admission lock. SQL execution is handed to the coordinated disposable database lane; no pass is claimed before its real run. Full build/browser/production evidence and live application remain unverified; no merge or rollout.
