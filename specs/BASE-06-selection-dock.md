# BASE-06: compact management selection dock

For Johannes Franz Lang (`frcola`, `83476@novasbe.pt`), tracking [#147](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/147). The approved visual concepts authorize this implementation. Pinned combined visual source: `cd6dc2e7`; immutable dependency base `review/base-06-visual-cd6dc2e7`.

The first slice is a nonmodal bottom dock for a healthy built own wall during village management. It reuses the actual model, shared renderer frame identity, confirmed recovery HP and existing upgrade/Move handlers. Missing health stays unavailable; damaged/unbuilt/visitor/complex cards retain the full existing native dialog. Show title, level, real portrait, actual health and upgrade price with readable Close/Move/Details controls. No new editor, purchase or repair state machine.

Only true native modals block the world. The UI keeps its existing build selection identity, supports direct selection changes, and exposes the measured selection element plus logical selected anchor to the separate camera/projection owner. Details uses the existing full native card; user Close/Escape returns to a fresh dock, while Move/travel/reset performs unconditional cleanup. The generic modal kit and other cards stay unchanged.

Pending requests retain server/wallet authority. Reselection cannot put an old action A's refusal or structure-specific data into B; another selected action is visibly disabled while the global building mutation is pending. Keep all loading/refusal/unknown/recovery text and critical prices visible. Secondary stats and demolition remain reachable through the existing full card and confirmation.

Own selected component/CSS/model/tests, the shared Move portrait extraction and narrow ui.js/index.js selection hunks. Preserve static-art ctx.container additions; game.js belongs to the projection writer. A selected ground bracket, if small, must use existing projection-aware geometry without pretending Move or changing coordinates; otherwise split it.

Verification: focused model, host, stale action, callbacks, Details/Close/Escape and portrait/lifecycle tests; then actual1280×720 and375×812 screenshots/44px/text/selected-foot checks in the coordinator's sole browser lane. Target a compact80–120px desktop / below250px phone healthy case without hiding errors or essential prices. Keep Draft for explain-back and independent human review; report all missing checks explicitly. No packages/env/live migration/flag/main or force push/merge/deploy.
