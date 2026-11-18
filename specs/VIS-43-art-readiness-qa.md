# VIS-43: await actual house artwork preparation

Issue: [#401](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/401).
Draft: [#402](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/402).

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

## Implemented correction

Test source `fe1174131f14c5411e152b7e0c8cc75a3d95861d` replaces only
the single-microtask await with `await drawing.retryArt()` and a brief
comment explaining why. The public method joins the already pending
building preparation task through its asynchronous loader and application.
It does not guess how many scheduling turns the loader needs.

All requested role IDs, the real tavern asset/role/level, identical position
and box, replaced geometry disposal, stable geometry reuse and exactly-once
final disposal assertions are unchanged. No runtime, screenshot, expected
metadata, sleep or timeout was edited. The frozen coordinator checkout
was not used as a writing branch.

## Exact verification

The coordinator's initial full-suite run supplied the failing stand-in
observation; this lane did not rerun the old version while that run owned
the browser. After an explicit sole-browser grant, from `frontend/`:

```text
npx vitest run --maxWorkers=1 tests/island/house-level-art.test.js
Test Files  1 passed (1)
Tests       3 passed (3)
Duration    5.07s
```

Process exited 0, starting at 20:25:41 on 17 November 2026. The full existing
file ran: pure role/anchor checks, native silhouette checks and native
prepared-role geometry/disposal checks. Assertions and harness timeouts
were retained. After exit, `/proc` showed zero live, non-zombie Chrome
processes, and this lane explicitly released the browser to root.

`node --check frontend/tests/island/house-level-art.test.js` and
`git diff --check` also exited 0. No app build or backend rerun was needed
for this test-only scheduling correction, and none is claimed here.

Not verified here: coordinator's final combined full-suite result, a11y/demo
or live behavior. No product UI or screenshot was changed. Keep Draft for
Johannes's explain-back and a different human's current-revision review.

## Explain-back

I wait for actual preparation because a resolved microtask is only one
scheduling step. The loader can still be waiting to apply its art after
that step. I join the public preparation promise and keep every real-frame
and disposal assertion strict, so the test still catches a stand-in or a
geometry leak. The change makes the test observe the intended ready state
without weakening what it checks.

1. Why can one resolved Promise leave an asynchronous loader unfinished?
2. What work does the public retry promise actually join?
3. Which assertions still reject a stand-in or leaked/replaced geometry?
