# VIS-33: readable village working composition

For Johannes Franz Lang (`frcola`, `83476@novasbe.pt`) and the visual reviewers; tracking [VIS-33 #345](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/345). The user explicitly approved the detailed desktop and portrait concepts before implementation. This slice implements camera composition; new world artwork is a coordinated separate lane.

## Contract and scope

Initial village management shows a close, pannable building district rather than the former whole-shore Fit. The initial working center is logical `(-4, -4)`, showing the cabin/left-house/heart district on narrow screens. The initial working scale is absolute zoom 1, which gives a current three-unit cannon about 98 pixels at 1280×720 and 70 pixels at 375×812. This is a district composition: peripheral coast can leave the frame, and bounded pan reaches it. Dedicated Fit and held Tab retain the unchanged analytic whole-island frame. Releasing Tab restores the exact saved working center/zoom. Existing battle/tour/input priority and exploration state remain separate.

Working zoom stays stable as real overlays reflow; the visible district remains centered in the measured usable area. Zoom limits, finite/no-room handling and pan bounds remain enforced. A `work` camera action returns to the default close district. `focusVillage({x, z, lift = 0})` is coordinated with the integration writer's consuming hook. It retains the working view while the selected anchor fits a one-unit inner margin; otherwise it pans within the existing bounds. A focus intent from Fit enters close Work first. Invalid/inactive/no-room/battle/tour requests return false. It never moves a logical building or captain.

Own `frontend/src/player/camera.js`, focused camera/gesture tests and this spec. Navigation hooks only if required. The coordinator owns game/bar hooks, including replacing the current automatic Fit on entering construction so it does not undo the approved close view. The asset pipeline owns world art/textures. Preserve the half-unit grid, `.72` projection, analytic surface, hit anchors, colliders, prices, unlocks and saved coordinates.

## Plan and proof

1. Claim this isolated draft from `9dc1bea5` on immutable `review/village-visual-9dc1bea5`.
2. Write failing close-entry, stable-reflow, Fit/Tab restore, pan/reach and interruption regressions.
3. Separate absolute working zoom from the unchanged fitted overview; keep finite bounded state.
4. Coordinate minimal game/bar actions and selected-anchor behavior with the integration writer.
5. Run focused meaningful camera/navigation tests without Chrome or a concurrent full frontend job.
6. When the coordinator grants the sole browser lane, capture the identical paid layout with old art before/after at 1280×720 and 375×812, then defer combined-art acceptance to the integrated lane.

The concept images are design targets, not runtime proof. Actual screenshots must name the exact source and asset state and retain real controls, picking, caption/refusal reflow and saved-state evidence. Build/transfer budget, broader browser checks, physical phone/Safari and final human acceptance are separate gates. No package, service, account, environment file, migration, live activation, main/force push, deployment or merge is included. Keep Draft for explain-back and independent human review.


## Actual implementation and focused evidence

Working mode now stores an absolute zoom independently of the analytic Fit frame. Measured panel changes adjust usable-area centering without shrinking the user's chosen working scale. `work` returns to zoom 1 and the initial district; `fit` retains the original full-shore formula. Held Tab temporarily borrows that exact Fit frame and restores saved working state. Existing pan limits, exploration zoom, battle/tour precedence and finite/no-room hold remain.

At representative insets (desktop top 92/bottom 124; phone top 180/bottom 112), the initial usable district is approximately:

| Viewport | Visible logical x interval | Visible logical z interval | Three-unit cannon frame width |
|---|---|---|---|
| 1280×720 | −23.6 to 15.6 | −14.7 to 6.7 | 98.2px |
| 375×812 | −12 to 4 | −19.4 to 11.4 | 70.3px |

These are mathematical camera bounds, not screenshots or a promise to show the whole island at close scale. Remote structures remain reachable by bounded pan or an explicit selected-anchor focus intent. The integration writer owns the consuming Work/focus controls, removing automatic Fit on construction entry and enabling safe management pan during placing. Call focus on a real selection/focus intent rather than every animation frame, so explicit Fit remains the user's choice.

The new regressions first failed on the unchanged camera: `Tests  9 failed (9)`. Actual final command:

```sh
npm --prefix frontend test -- --maxWorkers=1 tests/player/village-composition.test.js tests/player/village-camera.test.js tests/player/village-navigation.test.js tests/player/tab-overview.test.js
```

Actual result: `Test Files  4 passed (4)`; `Tests  35 passed (35)`; `Duration  1.36s`. `git diff --check` passed. Existing whole-shore tests explicitly request Fit and retain their original coast/inset assertions. New tests cover close entry/readability, stable absolute zoom under panel reflow, exact Fit/Tab restore, remote anchors, unchanged ground projection round trips, non-refocusing visible anchors, invalid/no-room/priority refusals and exploration restoration. Gesture tests retain click/jitter, drag/return-to-origin, interruption and disposal checks.

The coordinated old-art paired Chromium check later passed on before9dc1 and after/QA f117a446: both1280×720 and375×812, identical102walls/6,660coins and source asset hashes, real entry/Fit/Tab/drag/ground-pick checks,0page errors/external. [Actual camera evidence](../docs/evidence/VIS-33-working-composition/README.md) contains untouched PNGs/reports, manifests and exact commands. Initial zoom changed about0.35/0.33 to1 at the two sizes; explicit Fit remains the original formula. Focus is labeled as a public camera API diagnostic until consuming hooks land. Each viewport records one expected offline503 console line. New-art/control integration, the later3.2decorativecliff envelope, build/transfer budget, wider browser/a11y/demo checks and physical-device/Safari acceptance remain unverified here. The approved concept images are not implementation proof. Source geometry, projection, world art and gameplay state are unchanged in this slice.

## Explain-back

Whole-island Fit made the buildings too small for normal management. I keep that overview as an explicit choice and start with a close district instead. The working zoom is an absolute value, so a taller control panel moves the usable center without shrinking the district. Selecting a remote anchor can pan it into view without changing its saved ground position. Tab borrows the original Fit view and leaves the working values alone.

Before the draft is marked ready:

1. Why does absolute working zoom avoid the old shrink-on-panel-reflow behavior?
2. How do Fit, held Tab and an explicit selected-anchor focus differ?
3. Which tests prove ground picking still uses the same coordinates, and which actual visual/browser evidence remains pending?
