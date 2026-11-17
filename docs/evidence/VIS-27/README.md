# VIS-27: shaded wall draft evidence

For Johannes Franz Lang (`frcola`); [issue #232](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/232), [Draft #359](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/359). This focused slice follows the separate [VIS-14 wall core](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/347) at `d0cf1e3e`. No merge, production change or completed visual acceptance is implied.

## What changes

After the world wall atlas is ready, the unpaid draft borrows that same texture and the paid wall renderer. Its materials, connected post/span geometry, end panels, turns, gaps, tier-1 appearance and exact ground feet therefore come from one route. The existing valid/refused/unchecked colors and ghost opacity remain. Fine positioning still changes the controller's real snapped cells; rendering grants no purchase or placement authority.

The current model is reapplied if the atlas arrives while a draft is visible. Clearing or canceling removes the shaded buffers. The preview disposes its own materials and geometry, and never disposes the world's borrowed texture. Ordinary Move and the action bar are unchanged.

Batching changes draw meshes, so construction proof uses read-only `draftCells` and `renderedWallCells` on `island-wall-draft`, plus actual geometry and `wallLinks` under `wall-draft-connections`. These diagnostics describe ordered cells and the real renderer input. They do not replace input or actual-pixel evidence. Unit checks compare every actual position/UV/index buffer against the independently constructed paid-wall consumer and verify visible state tint, real gap contacts, exact half-cell translation and cleanup. Old unregistered preview fixtures retain their original one-mesh-per-cell route and assertions.

## Executed checks

From `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/island/wall-shaded-preview.test.js tests/island/wall-builder-preview.test.js tests/island/wall-textured-batches.test.js tests/island/wall-connections.test.js tests/island/wall-span-batches.test.js tests/pirates/wall-connections.test.js
```

**6 files passed; 32 tests passed in 3.26s; exit 0.** The checks include:

- Exact paid/preview buffer parity for a real three-cell turn.
- No links across 2.5-unit gaps or partial contacts.
- Actual buffer translation of +0.5 x / +0.5 z, including unchanged topology and corresponding painter-layer shift.
- Refused/valid feedback on the actual shared material without rebuilding unchanged geometry.
- Clear/cancel removal and a 32-cell cap with immutable ordered diagnostics.
- One-time owned-material disposal, safe late-art refusal after teardown, and no borrowed-texture disposal.

`npm run build` passed in 1.13s, including `Spoiler guard: 241 text files, 12 protected lines, no suspect elimination data.` `node scripts/report-budget.js --check` exited 0; it verifies cold-title transfer, not world rendering performance. Root text lint reported **4,508 candidate strings in 503 source files; 0 errors, 8 existing report-only findings**; exit 0.

## Remaining coordinated proof

No actual browser capture or UI-suite pass is claimed by this component checkpoint. Root owns the single browser lane and central provider/family integration. Required actual 1280×720 and 375×812 evidence must retain real pointer/keyboard/fine controls, quote/cancel behavior, actual atlas pixels, input-ground correspondence and honest gaps. The observer must check semantic cells and actual shaded buffers after batching; it must not drop interaction/position checks because old mesh counts changed.

Generated concepts and fake-texture unit checks do not prove the visual target. Safari, physical devices, live saves, sustained performance and production rollout remain unverified. Draft readiness still requires explain-back and a different human's current-revision review.
