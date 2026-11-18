# VIS56: existing level and state review fixtures

Used by Johannes Franz Lang (`frcola`) and the visual-review coordinator for [issue #424](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/424), [Draft #430](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/430).

## What this checks

The helper paints the actual compiled PNG frames selected by the game's world/combat functions. It covers all **100 defense poses**: cannon, mortar, harpoon, culverin and swivel, five levels each, intact/firing/damaged/broken. It also shows the existing house levels 1–3 and roles, watchtower level aliases, core health states and single service buildings. A level-1 role row deliberately remains a plain house: roles do not exist at that level.

The separate wall sheets use the actual Three.js wall renderer and atlas, with 13 declared wall cells forming an outer enclosure and inner divider. Each existing tier has intact, damaged, broken, selected-straight and mixed-tier cases. The normal fixture has 15 links; breaking the selected middle cell removes its two links, leaving 13. No saved wall is bought or modified by these fixtures.

Source: [`visual-matrix-cases.js`](../../../frontend/scripts/visual-matrix-cases.js), [`visual-matrix-fixture.js`](../../../frontend/scripts/visual-matrix-fixture.js), [`capture-visual-matrix.mjs`](../../../frontend/scripts/capture-visual-matrix.mjs), [focused guards](../../../frontend/tests/art/village-level-matrix.test.js).

## Exact pure verification

The helper working tree committed unchanged as `6b2bb458` passed:

```text
Test Files  10 passed (10)
     Tests  163 passed (163)
  Duration  3.32s (import 52%, transform 25%, tests 21%, worker 2%)
```

Process time was 4.22 seconds. The [raw log](focused.log) and [command/hash record](pure-report.json) retain the exact command and result. `node --check` passed for all three helpers; `git diff --check` passed. These are verification additions, not a product behavior change; the source guards already passed on the preserved base.

## Native command and evidence boundary

The coordinator owns the browser slot. After composing the helper into a frozen candidate, run from its `frontend/` directory:

```bash
CHROME_PATH=/usr/bin/chromium node scripts/capture-visual-matrix.mjs /absolute/candidate/frontend /absolute/review-output
```

The command owns a temporary loopback Vite server and browser, loads the specified candidate's own modules, and closes both in `finally`. Before allocating those resources, it verifies that the actually executed capture script matches the candidate's script bytes. It captures 22 sheets across 1280×720 and 375×812 viewports. Contact sheets use full-page captures, so their recorded PNG height may exceed the viewport. `report.json` records exact source trees, candidate helper hashes, the actual executed helper hash, source bindings, topology, calls/triangles and image dimensions/hashes. A failed assertion remains failed and receives a failure record.

A deliberate wrong-candidate probe of guard commit `015394e1` was refused with exit 1 in **0.78 seconds**, before any output or browser allocation. The [receipt](provenance-refusal.json) records the mismatch; its temporary candidate was removed. Helper syntax and whitespace checks passed after this guard. This refusal probe is a source-provenance check, not a native rendering pass.

**Native run pending at this leaf checkpoint.** No native pass, screenshot acceptance or whole-suite pass is claimed here. The coordinator's full-game proof separately covers real paid placement, upgrades, camera input and combat. Tree positions/colliders and zero/one/two-house progress are covered by VIS54 and the combined actual-game review.

## Explain-back and limits

I use the same frame selector and renderer as the game, then check their outputs against the real registered assets. A missing tier cannot silently become an older cannon, and a broken wall cannot retain its two intact links. I keep these art fixtures separate from real-game tests because drawing a wall does not prove that a player could legally build or pay for it.

These checks do not prove live health, production payments, multiplayer, Safari, physical phones, sustained performance, balance or human acceptance. More game states can be added as explicit cases; progression and game rules must stay in their existing owners.

Before readiness, Johannes should answer:

1. Why do the world and combat frame selectors need to agree for every intact tier?
2. Why does one broken cell remove two links rather than only changing its picture?
3. Which important behaviors does an art contact sheet leave unverified?

All work remains Draft. No merge, deployment, live migration or production flag change.
