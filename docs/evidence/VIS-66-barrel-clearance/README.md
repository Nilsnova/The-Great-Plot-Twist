# VIS66: clear the western wall corridor

Bounded scenery layout follow-up for Johannes Franz Lang (`frcola`); used by the visual review coordinator and peer reviewer. Tracks [issue #448](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/448), [Draft #450](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/450).

## What changed

The decorative home-island barrel moves from `(-12, 7)` to `(-10.5, 8)`. Its matching placement-only wall reserve moves to the same coordinate in the frontend and backend data. Exactly three product rows change:

- [`layouts.js`](../../../frontend/src/world/places/layouts.js): the existing single barrel's scene foot.
- [`wall-obstacles.js`](../../../frontend/src/island/wall-obstacles.js): its client-side prospective wall reserve.
- [`island_layout.json`](../../../backend/content/island_layout.json): the matching authoritative reserve.

The unsaved barrel has no collider or interaction zone. The box remains `1.25 × 0.75` units. No other prop, tree, collider, KEEP_OUT entry, route, legacy settlement, asset, package, migration or paid wall coordinate changes.

Base: VIS61 `81404e2b27b0d643d5fff418b7cd363ed86c0c24`. The first product source is `2200bd44`; final isolated verification source is `591eab2c` after adding authoritative regression cases. [Exact byte-boundary proof](source-boundaries.json) confirms all other bytes in the three product files and all eleven listed unaffected path groups remain unchanged.

## Why this small move matters

The old barrel reserve blocked the narrow western two-unit wall corridor between the wreck and cabin. Two needed grid cells, `(-12.5, 6)` and `(-12.5, 8)`, were refused as too close to the barrel. Its new foot leaves these cells clear while preserving the barrel's full ground reserve. A wall centered on the relocated barrel is still refused.

This clears a real geometric obstruction rather than hiding it or weakening the validator. Root owns the new obstacle-aware ring fixture and actual desktop/phone captures. This task does not change historical ring fixtures or declare a complete ring journey passed.

## Tests-first evidence

The new independent frontend regression was run before the product change:

- [Red](red.log): **4 failed / 1 passed**, 995ms. The actual Three.js barrel foot and reserve were still old, and both required corridor cells were refused.
- [Green](green.log): **5 passed**, 685ms after the three-row change.

The test constructs the actual `createSettlement` scene using supplied materials. It inspects the single barrel mesh's ground foot, projected position and normal painter order `108`. It retains all nine exact tree colliders, registry interaction-zone identity, the bench/lantern coordinates and all other thirteen scenery reserves. Client and backend reserve data must match exactly. It also exercises both corridor cells and the new blocked barrel base through the production placement function.

Four added backend cases exercise the actual canonical `check_move` for those two cells, the new refused base, and the unchanged reserve dimensions/radius. Existing VIS62 tests are untouched. Its writer separately supplied dynamic scene-anchor tests in `918aaa5f` for coordinator composition; those later tests are not relabeled as executions on this branch.

An initial test command used an incorrect working-directory-relative path and found no test file; [its original output](setup-error.log) is retained separately. A first green-command redirection also failed before starting the runner. The red and green results above come from the subsequent correctly located commands; the setup failures are not counted as application regressions.

## Final isolated checks

[Machine-readable receipt](checks.json), source `591eab2c`:

| Check | Exact result | Original output |
|---|---|---|
| Frontend: barrel/scenery clearance, world anchors and places; one worker | **40 passed / 4 files**, 3.24s Vitest / 4.44s process | [Log](frontend-final.log) |
| Backend: barrel and scenery clearance | **23 passed in 2.16s** / 2.89s process | [Log](backend-final.log) |
| Whole backend Ruff | **All checks passed!**, 0.14s | [Log](ruff-final.log) |
| Build/spoiler guard | Exit 0; **built in 1.15s**, 2.45s process; **245 text files / 12 protected lines**, no suspect elimination data | [Log](build-final.log) |
| Title budget | Exit 0, 0.44s; **18,959 / 21,080 JS bytes**, **9,410 / 12,000 CSS bytes**, no title image | [Log](budget-final.log) |
| Text lint | Exit 0, 2.29s; **4,579 candidate strings / 536 source files**, **0 errors / 8 report-only findings** | [Log](text-lint-final.log) |

Backend commands use the already-installed Python environment with this branch's backend as the working directory. No package installation, database, network service or `.env` is needed. The earlier standalone four-case backend invocation is also retained in [its original log](backend.log).

## Important compatibility limit

This task does not sanitize every old paid save. Stored wall coordinates continue loading unchanged. [An in-memory old/new-rule comparison](legacy-limit.json) confirms that cells such as `(-12, 8.5)` and `(-12, 9)` were legal under the former barrel reserve and are now inside its new prospective reserve. A stored wall at either coordinate is still retained by `positions_of`.

Therefore a fresh correctly validated ring can be clear while an old saved arrangement may still need player movement or a separately reviewed compatibility plan before rollout. This task does not silently shift, refund or remove paid walls, or claim automatic layout repair.

## Not verified here / remaining

This writer launched no Chrome and ran no full frontend/backend, accessibility, demo or multiplayer suite. Root owns the actual `1280 × 720` and `375 × 812` intermediate/final screenshots and integrated ring journey. Pure Three.js geometry checks do not establish final pixels, sustained performance, Safari or physical-device behavior. No production save was inspected or modified.

Keep the PR Draft. Combined browser evidence, visual acceptance, Johannes's explain-back and a different human's current-revision review remain open. No PR/main merge, deployment or live SQL was performed.

## Explain-back

I moved one decorative barrel inward so the western wall line has enough ground space. The barrel has no saved state, collider or interaction, but new walls must still avoid its base. I therefore changed the visible foot and both client/server reserves together, leaving the box size and every other object alone. Tests inspect the real scene foot and the authoritative placement rules, rather than accepting a screenshot with hidden overlaps.

The limit is that old paid wall coordinates are preserved. This small scenery adjustment is not an automatic cleanup of old arrangements. Later work could add a separately reviewed compatibility treatment after checking actual saves, while keeping payment and position ownership intact.

Walkthrough questions:

1. Why must the barrel's scene coordinate and both placement reserves move together?
2. What proves its collider, interaction zones and neighboring trees did not move?
3. Why does a successful fresh ring not prove every historical saved layout is clear?

Branch: `fix/vis-66-barrel-clearance`; [Draft #450](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/450).
