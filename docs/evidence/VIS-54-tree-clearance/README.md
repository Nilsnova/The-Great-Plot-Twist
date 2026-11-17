# VIS54: Smaller home-island foliage

Issue [#422](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/422),
Draft [#427](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/427).
Responsible teammate: Johannes Franz Lang (`frcola`).

## Changed

Implementation commit `9d05a2811f0c8ca23a5f0ad2f70abe55a9c1b352` adds one
runtime statement: home-island tree meshes start at a uniform visual scale of
0.70. Their existing zero/one/two-house growth becomes 0.70/0.77/0.84, retaining
the original 1.0/1.1/1.2 multipliers. Other places remain at their original scale.
Tree feet, radius-0.48 colliders, rendering order, materials, wind, player fading,
wall selection, paid placement and every gameplay rule stay unchanged.

The [specification](../../../specs/VIS-54-tree-clearance.md) explains the choice,
scope and explain-back. The implementation is stacked on VIS57 base `6c87b8dc`;
its claim/specification was pushed before runtime edits as `72d2e760`.

## Verified

Commands below run from `frontend/`.

```text
npm test -- --maxWorkers=1 tests/place-lifetime.test.js
Tests  2 failed | 7 passed (9)
Duration  2.37s
```

This is the expected red run against unchanged runtime at `72d2e760`, with the
new regression tests present in the working tree. Both failures identify the old
home-tree baseline of 1 instead of 0.70. [Original yielded output](red-base.log).

```text
npm test -- --maxWorkers=1 tests/place-lifetime.test.js tests/island/decorations.test.js tests/island/progress-art-lifecycle.test.js tests/island/placement.test.js tests/island/spots.test.js tests/island/wall-connections.test.js tests/island/wall-selection.test.js tests/pirates/wall-connections.test.js
Test Files  8 passed (8)
Tests  67 passed (67)
Duration  6.45s
```

The green run uses the code/tests committed as `9d05a281`.
[Original yielded output](green-focused.log). Real Three.js place construction
checks all five settlement destinations, exact tree foot transforms and blocker
lists, painter order, wind state and player fading. The real progress decorator
checks house addition/removal, geometry/material identity and restoration; tree
materials are released exactly once during place disposal. Existing wall,
placement and selection assertions remain intact.

At committed source `9d05a281`:

- `npm run build`: exit 0; Vite transformed 552 modules and reported
  `built in 2.73s`. Spoiler guard: 244 text files, 12 protected lines,
  no suspect elimination data.
- `node scripts/report-budget.js --check`: exit 0. Initial JavaScript
  18,932 bytes of 21,080; CSS 9,410 of 12,000; no title image. This checks the
  title budget, not the separate unmet 8MiB world-art effort target.
- `git diff --check`: exit 0 on the runtime/test change.
- Independent read-only code review found no regression. The reviewer did not
  rerun tests or perform a native visual check; human approval is still required.

## Not verified and remaining

This agent ran no Chrome, full frontend suite, accessibility, demo, multiplayer,
backend, live account, Safari or physical-device checks. The coordinator owns
fresh composed-build/native verification and actual 1280x720 and 375x812
before/after screenshots, including zero/one/two-house foliage states. Those
captures remain required to accept the canopy size; these unit results do not
prove full mockup parity or remove every possible canopy overlap.

Existing report-input timing and multiplayer pose failures remain open. Further
scenery refinement, land growth, balance, the world-art transfer target and live
rollout are outside this bounded change. Keep Draft for Johannes's explain-back
and a different human's review. No PR/main merge, deployment, live migration,
production flag, package or service change was performed.

## Branch / PR

`fix/vis-54-tree-clearance` → `chore/vis-57-playtest-base`, Draft #427.
