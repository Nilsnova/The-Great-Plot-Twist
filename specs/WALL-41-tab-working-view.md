# WALL-41: temporary overview and the working village camera

For Johannes Franz Lang (`frcola`) and integration reviewers; tracking [WALL-41 #326](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/326), a child of WALL-00.

The merged temporary Tab overview and BASE-02 working camera share the fitted camera branch. Applying the saved village scale and center unconditionally makes Tab inherit those settings after panning/zooming or leaving village mode. Tab must use the untouched whole-island frame; releasing it must restore the saved working view or ordinary exploration/battle view. Guided tours keep their existing priority, and reduced motion still snaps exactly.

Own only the guarded working transform in `frontend/src/player/camera.js`, the final game-owned canvas accessibility label in `frontend/src/game.js`, focused camera tests and this spec. Preserve the merged input handling, Fit/reset methods, gestures and battle behavior. Based on local integration `9daf8e59`; immutable draft base is `chore/wall-41-tab-review-base`. This isolated branch contains only a bounded integration fix, no camera rewrite or new dependency.

Write regressions before the fix, run focused camera/input tests, inspect the diff and keep the result draft for combined evidence and human review. No browser job, environment file, migration, deployment or merge.


## Result and focused evidence

Only `village && !peek` applies the saved working transform. Tab therefore uses the unchanged fitted frame, without modifying the saved pan/zoom. Releasing it restores that exact working state; after village exit it returns to the ordinary exploration or battle camera. The final game-owned canvas label now includes the existing Tab instruction instead of overwriting the renderer hint.

The new regressions first failed on the unguarded combined camera. After the fix:

```sh
npm --prefix frontend test -- --maxWorkers=1 tests/player/tab-overview.test.js tests/player/village-camera.test.js tests/player/village-navigation.test.js
```

Actual result: `Test Files  3 passed (3)`; `Tests  24 passed (24)`; `Duration  1.48s`. `git diff --check` passed. Repeated hold/release at 1280×720 and 375×812 retains the exact saved working view in reduced motion. Additional cases cover stale working settings after exit, unchanged battle overview/release, exploration zoom restoration and guided-tour priority. Existing village zoom, pan, Fit and gesture cases pass in the same run.

These are camera/input unit checks, not browser screenshots or Safari evidence. The integrated browser/full-app lane remains separate. No new input behavior, package, environment file, migration, deployment or merge is included.

## Explain-back

The fitted frame and the working view share one camera branch, but they represent different temporary choices. I apply the saved pan/zoom only while actively using the village working view. Holding Tab borrows the fitted frame and leaves those saved values alone, so release can restore them exactly. The test uses both screen sizes and checks repeated hold/release to catch accidental loss or accumulation of state.

Before the draft is marked ready:

1. Why must Tab bypass the saved transform without resetting its values?
2. Why is `village && !peek` sufficient to preserve the existing battle and tour priority?
3. Which cases prove exact state restoration, and which browser behavior remains unverified?
