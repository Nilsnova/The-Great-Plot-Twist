## Goal

Make the house role-art lifecycle test wait for actual public artwork preparation before inspecting loaded meshes. The first full-suite run at the coordinator's frozen `9f47c142` preview observed the procedural stand-in asset `island-house:house_1` where the test requires the real tavern frame.

Responsible teammate: Johannes Franz Lang (`frcola`), assisted by one QA agent in a separate clone. Parent: [VIS-31 #236](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/236).

## Confirmed source cause and scope

`decorateIsland` starts artwork through `createArtworkTasks.run`, whose `Promise.resolve().then(operation)` stage then awaits the asynchronous loader before applying prepared art. A single `await Promise.resolve()` in the test does not join that preparation lifetime. The returned public `drawing.retryArt()` promise joins the pending preparation tasks, including the existing building task.

Only change `frontend/tests/island/house-level-art.test.js` and a bounded spec. Use the real public preparation promise; do not add sleeps, longer timeouts, runtime changes or a stand-in-tolerant expectation.

## Acceptance

- Preserve requested role-frame, real tavern asset, position/box, geometry replacement/reuse and exactly-once disposal assertions.
- Await actual preparation before applying and inspecting role art.
- Read and review the runtime scheduling cause. Run the native file only in a coordinator-granted Chrome slot; no browser while the first full suite collects failures.
- Record exact results and limits. Full-suite acceptance remains coordinator work. Keep Draft for explain-back and different-human review; no main/force push or merge.
