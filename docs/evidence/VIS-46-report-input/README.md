# VIS46: report-only input fixture evidence

Used by the VIS46 reviewer to distinguish input ownership, actual native behavior and this cloud host's timing limit. Responsible human: Johannes Franz Lang (`frcola`); [issue #407](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/407), [Draft #408](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/408).

The fixture declares a veteran device through wave 30 using actual tutorial catalog IDs, keeps tutorials enabled, and waits for the public campaign update plus empty queue/active state. Independent input owners must be clear before opening the actual completed-wave report and after closing it. While the report is open, `world.busy` is correctly true because it derives from the report's blocking flag; every other independent owner is false.

## Historical pointer results

| Check | Exact result | Source and scope |
|---|---|---|
| Timestamp-only diagnostic | Test exceeded the unchanged 20s limit; blocked movement passed at 19.008s, then Close did not complete | [Detailed trace](vis46-veteran-phases-README.md), [raw log](vis46-veteran-phases.log), [result](vis46-veteran-phases-result.json), [timings](vis46-veteran-phases.ndjson), [instrumentation diff](diagnostic-instrumentation.patch); original candidate 870e624b plus 29 synchronous logging lines only |
| Pointer fixture after current-main startup work | `1 passed`, body 19440ms, runner 21.98s | Source 5e3dd6ccb3597617e67a8b720525d3add78c3704; [log](pointer-pass.log), [source/command/result](pointer-pass-report.json). Unchanged20s limit, 0.560s margin. |
| Later pointer case in a fuller run | Case timed out at 20042ms | Source 52f6bb158b03188b57260c1872e273391598debf; [test-specific excerpt](pointer-full-run-timeout-excerpt.txt). The complete runner was still in progress when copied; no final suite outcome is claimed here. |

These are distinct checks on named sources. A narrow pass with 0.560s margin did not establish robust timing. No graphics setting, assertion, frame count or test limit was changed to obtain it. The timestamp trace includes real startup/visibility and pointer actionability together; it does not identify which dominates or promise a speed improvement.

## Keyboard candidate awaiting native verification

Source-only refinement `5cdc9b17` activates the same native Play/Create/Start/Close buttons through genuine keyboard Enter. It waits for visible/enabled controls, focuses each one and asserts actual focus. An independent source review confirmed the native click callbacks are the same and relevant modal/global handlers do not intercept button Enter. This tests the keyboard route directly, fitting the test's keyboard/gamepad input-ownership purpose. Incidental pointer hit-testing coverage is changed and is not claimed as retained.

All original actual UI/game startup, paid level-five cannon setup, report/state/position assertions, 24 real requested frames, high graphics quality and the 20-second limit remain. There is no added synthetic button activation, forced click, private owner mutation, lower quality, skipped action, longer timer or setup moved outside the test timer. The original held-KeyA/gamepad fixture remains unchanged.

Verified for this refinement: `node --check frontend/tests/pirates/defense-report-ownership.test.js`, `git diff --check`, installed Vitest 5.1 promise-poll API and independent source review. **Native keyboard verification is pending** the coordinator's Chrome lease and composition onto the current application. Do not run this old review branch's application and treat it as a current-application result. If the current composed keyboard case still times out, retain that known timing failure rather than adding further workarounds.

The immutable PR base remains the earlier focused review base 6e2c3e8b. No application source, package, production setting, live database or merge is changed by VIS46. Keep Draft for explain-back and a different human's current-head review.
