# VIS-27: shaded unpaid wall previews

For Johannes Franz Lang (`frcola`), assisted by the wall-art agent. Focused slice of [VIS-27 #232](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/232), following [VIS-14 Draft #347](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/347) at `d0cf1e3e`. The approved world-raster route and existing paid-grid rules remain authoritative.

## Goal and scope

Unpaid wall drafts use the same shaded post/face renderer and actual footprint geometry as paid walls. A ghost must not promise a solid connection through a missing cell or keep the obsolete flat silhouette after the world art loads. This is drawing/input evidence only: construction authority, valid cells, quote, wallet, action UID, payment, health and collision are unchanged.

Owned files: the wall-builder preview, a small tint/diagnostic API on the shared wall renderer, the world-art handoff and focused tests. Ordinary Move and its action bar remain other agents' scope. Root owns shared provider registration, visible asset-error UI and the coordinated actual browser lane.

## Plan

1. Claim a separate Draft against the frozen wall-core review base.
2. Borrow the world wall atlas without taking ownership of its texture.
3. Render the ordered unpaid cells through the same neighbor/face/post geometry.
4. Apply existing valid/refused/unchecked ghost color and opacity.
5. Expose read-only semantic cells and actual rendered-state diagnostics.
6. Verify real buffers, turns/gaps, fine-grid movement, cancel/clear and disposal.
7. Capture actual before/after at 1280×720 and 375×812 in the coordinated candidate.
8. Record exact source/results and explain-back; keep Draft and unmerged.

## Acceptance

- [ ] The real generated art appears in actual construction previews; no concept-image overlay.
- [ ] Every rendered ghost retains its exact snapped ground coordinate and registered foot.
- [ ] Only full cardinal contacts connect; turns, actual gaps and partial contacts stay truthful.
- [ ] State-color changes work even when positions do not change.
- [ ] Clear/cancel remove ghost buffers and do not alter money or paid state.
- [ ] Borrowed texture is never disposed by the preview; all owned geometry/materials are disposed once.
- [ ] Actual required desktop/phone evidence and applicable checks are recorded.

## Proof and risks

Batching changes the number of meshes, so proof must compare ordered semantic cells plus real post/span buffers, not preserve a one-mesh-per-cell assumption. It must retain actual foot/position and real-interaction assertions. A late atlas load may replace a visible draft; the current model must be reapplied safely. Registered-art errors are a distinct loading/retry state, not accepted painter fallback. No runtime tests or captures have run at claim time.

## Explain-back

1. Why can an unpaid preview borrow the paid renderer without granting a purchase?
2. Which real positions determine whether two ghost pieces connect?
3. Why does clearing a draft dispose its buffers but not the world's atlas texture?

## Implemented checkpoint

The world atlas now activates the same shaded wall renderer in its unpaid draft. Read-only ordered-cell diagnostics and exact paid/preview position/UV/index parity are covered by tests, including half-grid movement, turns/gaps, state tint, clear/cancel and texture ownership. Six focused files / 32 tests passed in 3.26s; build, spoiler guard, cold-title transfer and text lint pass. Actual integrated captures and broader UI acceptance remain with the coordinator; no browser or performance pass is claimed here.
