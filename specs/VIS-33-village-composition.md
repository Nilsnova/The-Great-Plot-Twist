# VIS-33: readable village working composition

For Johannes Franz Lang (`frcola`, `83476@novasbe.pt`) and the visual reviewers; tracking [VIS-33 #345](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/345). The user explicitly approved the detailed desktop and portrait concepts before implementation. This slice implements camera composition; new world artwork is a coordinated separate lane.

## Contract and scope

Initial village management shows a close, pannable building district rather than the former whole-shore Fit. The initial working scale is absolute zoom 1, which gives a current three-unit cannon about 98 pixels at 1280×720 and 70 pixels at 375×812. This is a district composition: peripheral coast can leave the frame, and bounded pan reaches it. Dedicated Fit and held Tab retain the unchanged analytic whole-island frame. Releasing Tab restores the exact saved working center/zoom. Existing battle/tour/input priority and exploration state remain separate.

Working zoom stays stable as real overlays reflow; the visible district remains centered in the measured usable area. Zoom limits, finite/no-room handling and pan bounds remain enforced. A `work` camera action returns to the default close district. Selected-anchor focus may be added only with the integration writer's consuming hook; it never moves a logical building or captain.

Own `frontend/src/player/camera.js`, focused camera/gesture tests and this spec. Navigation hooks only if required. The coordinator owns game/bar hooks, including replacing the current automatic Fit on entering construction so it does not undo the approved close view. The asset pipeline owns world art/textures. Preserve the half-unit grid, `.72` projection, analytic surface, hit anchors, colliders, prices, unlocks and saved coordinates.

## Plan and proof

1. Claim this isolated draft from `9dc1bea5` on immutable `review/village-visual-9dc1bea5`.
2. Write failing close-entry, stable-reflow, Fit/Tab restore, pan/reach and interruption regressions.
3. Separate absolute working zoom from the unchanged fitted overview; keep finite bounded state.
4. Coordinate minimal game/bar actions and selected-anchor behavior with the integration writer.
5. Run focused meaningful camera/navigation tests without Chrome or a concurrent full frontend job.
6. When the coordinator grants the sole browser lane, capture the identical paid layout with old art before/after at 1280×720 and 375×812, then defer combined-art acceptance to the integrated lane.

The concept images are design targets, not runtime proof. Actual screenshots must name the exact source and asset state and retain real controls, picking, caption/refusal reflow and saved-state evidence. Build/transfer budget, broader browser checks, physical phone/Safari and final human acceptance are separate gates. No package, service, account, environment file, migration, live activation, main/force push, deployment or merge is included. Keep Draft for explain-back and independent human review.
