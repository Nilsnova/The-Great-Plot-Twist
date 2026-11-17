# COC-07 house-level art evidence

Responsible teammate: Johannes Franz Lang (`frcola`), [issue #148](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/148).

These are screenshots of the real Canvas house painter in a controlled art fixture. They are labeled as fixtures in the images and do not show a full gameplay session. The before drawing comes from main baseline `a09787c079ba2921fb05facdecb41f61ca8ab84d`; the after drawing comes from this task branch.

| Viewport | Before | After |
|---|---|---|
| 1280 × 720 | [Before](before-1280x720.png) | [After](after-1280x720.png) |
| 375 × 812 | [Before](before-375x812.png) | [After](after-375x812.png) |

The neutral house occupies the first row. Subsequent rows show Barracks, Tavern and Workshop. A role is unavailable at level 1, so those cells state “Role opens at L2” rather than showing an impossible role state.

Level 2 adds a side room. Level 3 adds a taller main building and upper windows. Role signs and the original frame box/ground anchor remain stable. New frames are painted through the existing lazy art path.

Reproduce from `frontend/`:

```sh
node scripts/capture-house-levels.js ../docs/evidence/COC-07-house-levels origin/main
```

Use the recorded baseline commit instead of `origin/main` if main has advanced. [capture-report.json](capture-report.json) records the selected Git reference, frame IDs, dimensions, anchors and silhouette hashes. The runner rejects API/external requests, checks browser errors, compares each level's opaque silhouette and verifies that the existing level-1 silhouette is preserved.

Focused tests: **4 files passed / 32 tests passed**, duration **18.46s**. Full game, build/budget, accessibility/demo and physical-device results belong to the coordinated integration check and are not represented by these fixture images.
