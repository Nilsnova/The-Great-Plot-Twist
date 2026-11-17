# BASE-06: compact management selection dock

For Johannes Franz Lang (`frcola`, `83476@novasbe.pt`), tracking [#147](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/147). The approved visual concepts authorize this implementation. Pinned combined visual source: `cd6dc2e7`; immutable dependency base `review/base-06-visual-cd6dc2e7`.

The first slice is a nonmodal bottom dock for a healthy built own wall during village management. It reuses the actual model, shared renderer frame identity, confirmed recovery HP and existing upgrade/Move handlers. Missing health stays unavailable; damaged/unbuilt/visitor/complex cards retain the full existing native dialog. Show title, level, real portrait, actual health and upgrade price with readable Close/Move/Details controls. No new editor, purchase or repair state machine.

Only true native modals block the world. The UI keeps its existing build selection identity, supports direct selection changes, and exposes the measured selection element plus logical selected anchor to the separate camera/projection owner. Details uses the existing full native card; user Close/Escape returns to a fresh dock, while Move/travel/reset performs unconditional cleanup. The generic modal kit and other cards stay unchanged.

Pending requests retain server/wallet authority. Reselection cannot put an old action A's refusal or structure-specific data into B; another selected action is visibly disabled while the global building mutation is pending. Keep all loading/refusal/unknown/recovery text and critical prices visible. Secondary stats and demolition remain reachable through the existing full card and confirmation.

Own selected component/CSS/model/tests, the shared Move portrait extraction and narrow ui.js/index.js selection hunks. Preserve static-art ctx.container additions; game.js belongs to the projection writer. A selected ground bracket, if small, must use existing projection-aware geometry without pretending Move or changing coordinates; otherwise split it.

Verification: focused model, host, stale action, callbacks, Details/Close/Escape and portrait/lifecycle tests; then actual1280×720 and375×812 screenshots/44px/text/selected-foot checks in the coordinator's sole browser lane. Target a compact80–120px desktop / below250px phone healthy case without hiding errors or essential prices. Keep Draft for explain-back and independent human review; report all missing checks explicitly. No packages/env/live migration/flag/main or force push/merge/deploy.

## Implemented checkpoint

The component reads existing model fields and delegates Upgrade/Move. The full native Details card retains secondary actions and demolition confirmation. User cancel restores its latest model; unconditional close cannot reopen it. The shared portrait cache/token implementation is extracted from Move without introducing a second art source. A pending A action visibly holds B's paid choices/tree/move/demolition; A's refusal goes to the global toast rather than B. Health from an old level is unavailable until the existing read supplies the matching level; confirmed upgrades request that read.

The final focused run passed seven files/102 tests in7.39s, including two real Chromium cases. Actual bounds/font/44px/compact-height checks passed at1280×720 and375×812; a real dock-click upgrade crossed A→B/native Details, both refusal and later confirmed success, Escape return and unconditional cleanup. The supplied60/60 recovery view in the component is declared fixture data, not live service evidence. The normal fake truthfully has no recovery health view.

Source provenance limit: pinned `cd6dc2e7` does not register the authored walls family in village-families.js, so the tested wall portrait is the genuine shared procedural frame, not proven decoded wall PNG. The coordinator owns that missing registration; actual PNG provenance and selected-foot/camera/ground-bracket integration remain for combined validation. Before/after screenshots, full-game input/overlay checks, full build/budget/accessibility/demo and physical-device/Safari evidence remain pending. No visual acceptance is claimed.
