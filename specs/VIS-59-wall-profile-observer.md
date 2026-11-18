# VIS59 Observe the current wall profile independently

> **What this is:** a verification-only correction for the multiplayer map observer.
>
> **Who uses it:** Johannes Franz Lang (`frcola`) and multiplayer reviewers.

- **Status:** in progress; Draft only.
- **Issue:** [#434](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/434).
- **Branch:** `test/vis-59-wall-profile-observer`.
- **Base:** coordinator review `480d636d`, containing current-main gameplay.

## Goal and scope

The source-7fab full frontend run has 4,639 passes and two failures across 424 files (563.75 s). The existing native input case times out at its unchanged 20-second limit. The second failure is a stale verifier: it expects the former 1.45-unit level-three straight cap, while the intentional current profile is **0.95, 1.15, 1.25, 1.35, 1.43** units for tiers 1–5. Straight runs also retain sparse full posts at coordinate-defined buttress positions.

Update only `frontend/scripts/multiplayer-map-observer.js` and its focused test. Specify the presentation contract independently in the observer; do not import renderer heights or shape-selection helpers. Retain indexed position/UV checks, texture receipts, transforms, visibility, draw ranges, semantic levels/pips, stale-teardown rejection and duplicate-renderer rejection.

## Acceptance and verification

- Preserve all existing observer tests and retain the original failing result.
- Add all five tiers × both orientations × straight-cap/authored-buttress positive cases.
- Add targeted stale-diagnostic and position/UV/index corruption checks for both forms.
- Run the original observer first, then the meaningful new tests before the implementation, followed by the focused corrected suite.
- Product files, game rules, timeout/frame/quality limits and native checks remain unchanged.
- Coordinator runs native multiplayer and a fresh full frontend suite on the composed immutable source. This task runs no Chrome and claims no full-suite pass.

## Responsibility and limits

Johannes Franz Lang remains responsible for the agent-assisted output. Keep Draft pending exact evidence, explain-back and different-human review. No main/PR merge, deployment, live migration, feature flag, package or environment changes.

## Explain-back

“The game already draws the intended wall profile. The test observer still expected an older silhouette, so I updated its independently written expectation and added real-buffer cases for every supported tier and orientation. It still checks the actual indexed pixels and refuses stale diagnostics, invalid textures and hidden or moved geometry. This does not repair the separate native input timeout.”

Before readiness: why must the observer have independent expected values; why is a diagnostic tier insufficient without UV/geometry proof; why must a stale quad fail after its semantic row disappears?
