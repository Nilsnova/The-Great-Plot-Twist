# WALL-41: temporary overview and the working village camera

For Johannes Franz Lang (`frcola`) and integration reviewers; tracking [WALL-41 #326](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/326), a child of WALL-00.

The merged temporary Tab overview and BASE-02 working camera share the fitted camera branch. Applying the saved village scale and center unconditionally makes Tab inherit those settings after panning/zooming or leaving village mode. Tab must use the untouched whole-island frame; releasing it must restore the saved working view or ordinary exploration/battle view. Guided tours keep their existing priority, and reduced motion still snaps exactly.

Own only the guarded working transform in `frontend/src/player/camera.js`, the final game-owned canvas accessibility label in `frontend/src/game.js`, focused camera tests and this spec. Preserve the merged input handling, Fit/reset methods, gestures and battle behavior. Based on local integration `9daf8e59`; draft base is `chore/perimeter-preview-base`. This isolated branch contains only a bounded integration fix, no camera rewrite or new dependency.

Write regressions before the fix, run focused camera/input tests, inspect the diff and keep the result draft for combined evidence and human review. No browser job, environment file, migration, deployment or merge.
