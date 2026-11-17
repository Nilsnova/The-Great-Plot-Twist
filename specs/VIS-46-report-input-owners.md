## Goal

Make the actual-game defense-report input test isolate the report's ownership. Measured diagnostics at frozen preview `6e2c3e8b` found a tutorial/unlock overlay active alongside the report, so the blocked-movement assertion could pass for the wrong input owner. The original file also exceeds its unchanged 20-second budget on cold runs; this task does not claim a timing fix.

Responsible teammate: Johannes Franz Lang (`frcola`), assisted by one QA agent in a separate clone. Parent: [VIS-31 #236](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/236).

## Scope

Only `frontend/tests/pirates/defense-report-ownership.test.js` and a bounded spec. Initialize the existing progressed guided-tutorial device memory, settle any actual queued unlock onboarding through its real public UI/queue readiness before opening the report, and assert exclusive report ownership while open and cleared owners after Close. No runtime, DOM masking, mocked ownership or product behavior change.

## Acceptance

- Preserve every original report-active, keyboard/gamepad, blocked-position and resumed-movement assertion, both 12-real-rAF windows, the 20-second limit and high graphics quality.
- Await the actual tutorial queue plus active/cardLoading state so a late asynchronous card import cannot pass a false calm check.
- Use real Skip all/Got it controls to settle unrelated onboarding; do not hide/remove its DOM or stub its owner flag.
- Assert the report is the only active input overlay while it is open, and all relevant owners/dialogs are clear after Close.
- Keep all setup inside the original test timer. No sleep, longer timeout, frame reduction, lowered quality or moved-beforeAll setup to obtain a pass.
- Run native verification only after root releases the current UI-audit Chrome lease. Report correctness and timing separately; preserve any remaining budget failure honestly.

Keep Draft for explain-back and a different human's current-revision review. No main/force push, merge, deployment or production activation.
