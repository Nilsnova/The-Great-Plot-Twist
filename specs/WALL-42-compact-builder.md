# WALL-42: compact the real wall builder without losing accessible controls

Responsible teammate: Johannes Franz Lang (`frcola`). Authorized integration follow-up to the full-perimeter roadmap, parent #241. No activation, deployment or merge.

## Reproduced problem and goal

The actual 1280×720 full-game capture shows an expanded construction bar about 566 pixels wide and 376 pixels high. Its occupied area forces Fit village to leave a roughly 220-pixel island. The controls must use desktop width effectively while preserving all copy, fine-position actions and 44-pixel buttons on phones.

## Acceptance checks

- At 1280×720, the builder is about 800–1000 pixels wide, no more than 200 pixels tall closed and 250 expanded for the representative two-wall draft/ready states.
- Desktop groups the camera and purchase actions beside the draft information rather than stacking every group vertically.
- At 375×812, all controls remain reachable, at least44×44, and within the viewport; narration clearance, scroll, keyboard disclosure and actual click hit targets remain valid.
- All existing accessible names, essential copy, prices, pending/unknown purchase behavior and fine-position controls remain unchanged. No forced clicks or smaller fonts.
- Extend the existing real DOM layout cases for the actual geometry targets. Actual before/after full-game captures belong to the coordinated WALL-24 browser lane.

## Scope and plan

1. Pin the current aggregate ce719a3e as an immutable review base and claim a draft.
2. Use responsive desktop grid grouping in wall-builder.css; add only minimal semantic layout classes to the existing bar.
3. Retain the phone flow, scroll and safe-area/narration clearance, without reducing typography or touch targets.
4. Extend existing component DOM checks with desktop closed/expanded geometry and reachable44px controls; preserve phone checks.
5. Run the coordinated allowed checks, inspect the diff and provide handoff for actual-game captures.

Likely files: frontend/src/island/wall-builder.css, minimal frontend/src/island/wall-builder-bar.js class additions if needed, frontend/tests/island/wall-builder-dom.test.js and this specification. No game rules, purchases, camera math, transport or selector changes.

## Verification status

Before evidence: /workspace/village-perimeter-work/wall-24-bringup/failure.png (expanded actual game) and before-construction-1280x720.png. Not yet changed or verified. Browser lane is reserved by the integration owner; no independent Chromium launch before release.
