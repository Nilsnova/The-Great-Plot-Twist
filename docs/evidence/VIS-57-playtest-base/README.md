# VIS57: preserve playtest behavior in the visual review base

Used by Johannes Franz Lang (`frcola`) and the next visual component reviewers. [Issue #425](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/425), [Draft #426](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/426), [scope](../../../specs/VIS-57-playtest-base.md).

## Result and source boundaries

The review branch starts from current main `66d29ea9eeb6ac39523c6605c8379004277326fe`. Its local merge retains the existing preview `e636ae7578813d1aa45f05092fdacc8cfadcbfe5` and both authored histories. Integration code checkpoint: `6c87b8dcd2d7a1bb5376c3b64bbede27a144479e`. The later test-only checkpoint `392e65b7bb6e5ac1398c66f792f790c107efc365` has exactly the same four application trees. The documentation snapshot `c52b9dc7` adds the migration-order note in `supabase/README.md`, changing the top-level Supabase tree only through that document. Its migration subtree and the frontend/public/backend trees remain exact to the code checkpoint; [code identity](code-identity.json) records each full hash and the one documentation-only path.

This is an assembled **Draft review base**, not a request to merge all visual/perimeter branches wholesale. No GitHub PR merge to main, force push, deployment, live database migration or production flag change was performed. The original checkout and previous preview remain untouched. The next foliage and wall changes belong to separate focused branches.

## Merge and path audit

The common base is `ee5677ff4986b671c271c85a35abcee70aa8fe59`. Incoming main changes **46 paths**, including **19 overlaps** with the preview. All **27 nonoverlapping paths** match current main byte for byte at the integration checkpoint. [The complete path audit](path-audit.json) lists each of the 46 paths and its main, preview and resulting Git blob identity. The table below records how each overlapping path preserves both sides.

| Overlapping path | Retained behavior or contract |
|---|---|
| `backend/server/island/catalogue.py` | Keep main loot configuration and preview bounded wall capacity. |
| `backend/server/island/wall_repair.py` | Keep main recovery policy and preview complete wall reads/legacy admission guard. |
| `backend/server/island/wave_recovery.py` | Keep main carried weapon, seen tick and tree/research snapshot values with preview perimeter validation. |
| `backend/server/island/waves.py` | Keep main loot arguments and preview capability-aware perimeter lifecycle. |
| `backend/server/routes/waves.py` | Keep main finish handling and preview policy/admission fences. |
| `backend/server/tests/structure_recovery_pg.py` | Keep main named-argument overload selection and preview perimeter RPC allowlist. |
| `docs/DECISIONS.md` | Keep main D059 amendment and all existing visual decisions. |
| `docs/GAME-V3.md` | Keep current-main recovery wording and preview visual controls. |
| `docs/INTERFACES.md` | Keep main playtest transport change and preview perimeter contract. |
| `docs/STATUS.md` | Preserve both histories; this receipt identifies the new checkpoint separately. |
| `frontend/src/island/index.js` | Keep main paid repair event/end repair notice and preview village/core integration. |
| `frontend/src/pirates/controller.js` | Keep main shot prediction, per-wave loot, repair presentation, seen ticks and post-wave flights; retain preview perimeter and first-wave handling. |
| `frontend/src/pirates/fake-api.js` | Keep main boss/late-wave loot and preview atomic perimeter construction/replay. |
| `frontend/src/pirates/game-wiring.js` | Keep main paid repair event and preview guarded core publication/perimeter context. |
| `frontend/src/pirates/hud.js` | Keep main round-specific loot wording and preview accessible compact HUD. |
| `frontend/src/pirates/render.js` | Resolve only textual conflict: smooth ships/boarders, then use shared projected coordinates and full ship metadata signature. |
| `frontend/src/pirates/sim.js` | Keep main bounded seen-tick rewind and preview optional perimeter landing guards. |
| `frontend/tests/pirates/td-flow.test.js` | Keep main per-wave loot expectations and preview complete wall fixtures. |
| `supabase/README.md` | Preserve main playtest order/semantics and document unique guard version. |

There was exactly one textual conflict, in the renderer's ship/boarder loop. Main's smoother supplies logical `{x,z}`; the renderer projects that position once. `shipMeta` also receives both smoothed coordinates, preserving its projected facing calculation. Simulation rows are not modified. Other paths merged textually; their relevant behavior is checked by the focused suites below rather than inferred from textual success.

## Migration collision and exact SQL identity

Main reserves `20261118040000_playtest.sql`; the unmerged VIS50 guard had independently used the same version. Both must survive with unique migration identities. Only the unmerged guard is renamed to [`20261118050000_recovery_finish_checkpoint_guard.sql`](../../../supabase/migrations/20261118050000_recovery_finish_checkpoint_guard.sql). Its **complete bytes** match the preview's old guard; main's playtest migration also remains byte-identical. [The identity receipt](migration-identity.json) records both SHA-256 hashes and all **71 unique versions**, with no duplicates.

The playtest migration replaces the input overloads and settlement helper; the guard replaces the finish function. Their bodies therefore coexist. Main's rule repairs structure health rows fully when a wave closes, while preserving the historical closed HP vector. The guard still requires a valid accepted checkpoint before a first finish may close/pay. No recovery policy is redesigned here. Historical VIS50 evidence retains its original source identities and filename; it is not relabeled as a new run.

## Exact checks

| Source | Command scope | Result |
|---|---|---|
| `6c87b8dc` | `npm test -- --maxWorkers=1 --reporter=verbose` with the 19 files in [initial command receipt](frontend-initial.json) | **234 passed / 1 failed**, 18 passed files / 1 failed, **17.25 s** Vitest (**18.16 s** process). [Raw log](frontend-initial.log). |
| `392e65b7` | The identical 19-file command, including the strengthened projection test | **236 passed (236)**, **19 passed files (19)**, **27.09 s** Vitest (**27.99 s** process). [Command/source receipt](frontend-final.json), [raw log](frontend-final.log). |
| `6c87b8dc` | `CASE_PG_SCRATCH=1 uv run --frozen --no-env-file --with pgserver --with 'psycopg[binary]' python -m pytest -q -rs` with **15 route/unit files + 21 SQL files** in [command receipt](backend.json) | **725 passed in 66.95s**, **zero skips**. [Raw log](backend-targeted.log). |
| `6c87b8dc` | `uv run --frozen --no-env-file ruff check .` | **All checks passed!** [Raw log](ruff.log). |

The initial failure expected a boarder to teleport after two updates with zero elapsed drawing time. That fixture contradicted the newly inherited main smoother. The test now checks the previous foot at **0 ms**, the interpolated foot at **30 ms**, and the original endpoint/facing at **60 ms**. It additionally checks smoothed ship feet, a shear-dependent ship facing that requires the logical z coordinate, unchanged simulation inputs, pruning after an entity disappears, reused entity IDs and cleanup. No old endpoint, facing, ownership, damage or timing assertion was deleted or weakened; the frame progression now models the preserved smoother explicitly.

The selected frontend checks cover main's playtest regressions, renderer/projection, recovery controller/end/transport/snapshots, core context, ship fire, perimeter admission/landing, wave flow and the changed card wording. Backend selection includes new boss loot and arsenal weapon checks plus real recovery finish, admission, paid construction, concurrency, lifecycle, schema, settlement and HTTP-to-SQL tests. These are **targeted checks**, not fresh complete frontend/backend passes.

Setup notes: initial npm/uv invocations omitted the workspace cache settings and failed before verification because the default `/home/agent` cache paths could not be written. The corrected existing-lock setup used `npm_config_cache=/workspace/.cache/npm npm ci --include=dev --no-audit --no-fund` (**46 packages installed**) and `UV_CACHE_DIR=/workspace/.cache/uv uv sync --frozen` (**26 locked packages installed**). No manifest/lockfile or package version changed.

Static evidence checks: all 14 local targets in this receipt/spec resolve, and the manifest records each original byte count/SHA-256. The two raw Vitest logs retain their emitted trailing blank line; Git whitespace checking reports those two log endings. Edited code and documentation pass the whitespace check with only raw `.log` output excluded.

## Independent read-only review

A separate AI reviewer checked the composed patch and reported [no integration findings](independent-review.md): 45 of 46 incoming-main paths preserve their exact patch content, with the renderer loop the sole intended signature adaptation. This assists review; it is not human approval and does not add test evidence.

## Not verified and next step

This task ran no Chrome, full-game journey, accessibility/demo audit, fresh full suite, Safari, physical-device, balance or live-deployment check. The coordinator will verify the composed visual candidate and provide actual desktop/phone screenshots after the focused visual leaves are applied. Historical native input timing and multiplayer pose failures remain open; the targeted pass does not close those issues. Human visual acceptance, explain-back and different-human approval remain pending. No production acceptance or commercial-game quality claim is made.

## Explain-back

“I preserved the working teammate fixes before changing more artwork. The smoother changes only where ships and boarders are drawn; both coordinates still use our shared projection. I gave our unmerged SQL guard a free migration number so the teammate's migration keeps its identity. The initial drawing test used no elapsed time, so I made it check the full 0/30/60 ms transition and the original endpoint. The passing focused checks cover these boundaries, while full-game and human acceptance remain separate.”

Before readiness: why does projected facing need z; why is a duplicated migration version unsafe; why can a malformed first health report never pay loot?
