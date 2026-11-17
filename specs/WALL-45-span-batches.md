# WALL-45: batch spans without changing painter order

For Johannes Franz Lang (`frcola`) and the rendering reviewers; tracking [WALL-45 #337](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/337), a child of WALL-00.

## Approved contract

The measured 102-wall fixture produces 106 logical joins and 106 separate span meshes. They occupy 36 exact painter layers, each ordered at `100 + meanZ - 0.02`. Posts and spans use transparent materials without depth tests, so a global batch would change occlusion. Preserve that contract: concatenate span vertices, colors and indices only within the same existing painter layer. All triangles and their order within a layer remain unchanged, with one indexed mesh per layer sharing the existing material.

Expected fixture reduction is 106 to 36 join draws (70 saved), rather than the initially estimated 105. Keep the logical `links` accessor stable; a read-only `group.wallLinks` getter returns cloned logical rows for WALL-24 diagnostics, which count logical links and draw meshes separately. Coordinates, colors, heights, topology, HP inputs, collision, picking exclusion and depth behavior remain unchanged. Cache identical topology and dispose each replaced geometry and owned material once.

Own only `frontend/src/island/wall-connections.js`, focused geometry/lifetime fixtures/tests and this spec. Start from frozen integration `b1755351`; immutable review base `chore/wall-45-span-review-base`. WALL-44 owns camera/bar/phone styles. Freeze parity expectations from the original geometry, reproduce missing batching in tests, implement, run pure scene/renderer tests, then request a coordinated actual metric lane. No Chrome job while the integration writer owns it.

## Budget and remaining work

Actual pre-change full-game stills reported 375 calls, 269 geometries and 30 textures. The documented total target remains below 150 draw calls and is not solved here: even 70 fewer from this baseline predicts about 305, which is an estimate pending actual measurement. Further wall-post and other sprite batching, sustained real-device performance/frame-time/thermal checks and whole-game budget acceptance remain separate follow-ups. Do not weaken or relabel existing budgets.

No dependency, gameplay authority change, environment file, migration, deployment or merge. Keep the draft for actual metrics, explain-back and human review.
