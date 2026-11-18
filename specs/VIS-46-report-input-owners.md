## Goal

Make the actual-game defense-report input test isolate the report's ownership. Measured diagnostics at frozen preview `6e2c3e8b` found a tutorial/unlock overlay active alongside the report, so the blocked-movement assertion could pass for the wrong input owner. The original file also exceeds its unchanged 20-second budget on cold runs; this task does not claim a timing fix.

Responsible teammate: Johannes Franz Lang (`frcola`), assisted by one QA agent in a separate clone. Parent: [VIS-31 #236](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/236).

## Scope

Only the actual-game test, this bounded spec and exact diagnostic evidence. Initialize a veteran device using the documented guided/seen tutorial memory and actual catalog IDs through wave 30. Keep tutorials enabled, consume the campaign update through its public method, and await its real queue/active readiness before opening the report. Assert exclusive report ownership while open and cleared owners after Close. No runtime, DOM masking, mocked ownership or product behavior change.

## Acceptance

- Preserve every original report-active, keyboard/gamepad, blocked-position and resumed-movement assertion, both 12-real-rAF windows, the 20-second limit and high graphics quality.
- Await the actual tutorial queue plus active/cardLoading state so a late asynchronous card import cannot pass a false calm check.
- The declared veteran has seen actual `CARDS` through wave 30, including previous flag variants. Cards above wave 30 remain unseen. Do not hide/remove tutorial DOM, disable tutorials, or stub owner flags.
- Activate the same visible, enabled and focused native Play/Create/Start/Close buttons using genuine keyboard Enter. Their production click handlers remain the route; pointer hit-testing is not asserted by this input-ownership test and is not claimed as retained here.
- Assert the report is the only active input overlay while it is open, and all relevant owners/dialogs are clear after Close.
- Keep all setup inside the original test timer. No sleep, longer timeout, frame reduction, lowered quality or moved-beforeAll setup to obtain a pass.
- Run native verification only after root releases the current UI-audit Chrome lease. Report correctness and timing separately; preserve any remaining budget failure honestly.

Keep Draft for explain-back and a different human's current-revision review. No main/force push, merge, deployment or production activation.

## Correctness and timing evidence

The original fixture could have unrelated onboarding own input alongside the report. The candidate adds explicit independent-owner/queue/dialog checks before the wave, while the report is open and after Close. `world.busy` includes the report through `isBlocked()`, so its expected value is true while the report is open and false afterward; this derived flag is not an independent overlay.

The initial sole-owner candidate `4844c2c1` failed the new `worldBusy` expectation in 18.375s; corrected `4f69978f` and coherent-veteran `870e624b` exceeded the unchanged 20-second limit. After current-main startup changes, the same pointer fixture passed once in 19.440s at composed source `5e3dd6cc`, leaving only 0.560s margin. The later full run at `52f6bb15` exceeded the limit again in this case at 20.042s; that excerpt is not a completed full-suite result. The [separate receipts](../docs/evidence/VIS-46-report-input/README.md) preserve both outcomes without claiming robust timing. Existing tutorial memory/catalog contracts passed 13 tests across 2 files (626ms), before the keyboard refinement.

The [timestamp-only diagnostic](../docs/evidence/VIS-46-report-input/vis46-veteran-phases-README.md) on `870e624b` preserves raw timings, command result and instrumentation patch. Game readiness was 12.938 s; API setup completed at 14.129 s, campaign/owner readiness at 14.871 s, report opened at 15.502 s, and the blocked 12-frame position assertion passed at 19.008 s. The unchanged 20-second limit expired while waiting for the real Close click; post-Close movement was not verified. The measured 0.539 s API setup is not the dominant interval. Completed-click timestamps do not partition legitimate lazy/world loading from pointer actionability, so no speed improvement is promised.

Candidate `5cdc9b17` uses native keyboard activation because this test checks keyboard/gamepad ownership. An independent source review confirmed that native buttons use the same click callbacks, modal key traps handle only Tab/Escape, and relevant global handlers do not intercept button Enter. The test now explicitly asserts focused, visible, enabled controls. All original game/API setup, ownership/position checks, 24 real frames, high quality and the 20-second limit remain. Syntax/diff checks pass; **native verification of this keyboard refinement is pending** the shared Chrome lease. If it still exceeds the limit, keep the timing failure open rather than relaxing it.
