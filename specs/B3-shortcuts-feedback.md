# B3 Shortcuts loading and failure recovery

For players and reviewers of Johannes Franz Lang's second B3 PR, with Codex assistance.
Parent issue: [#30](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/30).

## Scope

Make pending and failed shortcut loads visible with Retry and Back to game controls
usable on touch screens. Repeated menu/keyboard opens must not stack notices or
load duplicate overlays. Close/dispose must ignore late responses and remove feedback.
Reuse the native modal and the existing shortcuts overlay; no login/API/game-rule changes.
This branch starts independently from main; it does not include the help PR #31.

## Proof

Before/after captures at 1280x720 and 375x812, real Chromium pending/retry/cancel/dispose
regressions, applicable frontend checks and an audit handover. Keep draft for author
review; never merge without Johannes's explicit OK.

## Delivered

Implemented in draft [#32](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/32).
Seven new browser cases and the full 2,997-test frontend run pass, as do build, budgets,
text lint, accessibility (33 screens) and demo (33 checks).
[Audit and limits](../docs/B3-FEEDBACK-AUDIT.md); [captures](../docs/evidence/B3-shortcuts/README.md).
Author review, explain-back and independent human review remain; no merge performed.
