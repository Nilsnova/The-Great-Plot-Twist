**Status:** Approved for draft implementation by Johannes Franz Lang (`frcola`), following the full-perimeter request. One writer owns this branch. No merge, live migration application or activation.

## Goal

Fence every new perimeter-wave start against the trusted owner policy while holding the same island lock as admission. A Python preflight alone can race owner admission; the database must refuse unsupported protocol/recovery/geometry and preserve immutable same-context retries.

## Scope and likely files

- New `supabase/migrations/20261117144000_perimeter_wave_start.sql`: service-only `perimeter_wave_start` wrapper with the same parameters as `recovery_wave_start`.
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
