# Overflow item 2: focused accessibility fixes

Branch: `feat/overflow-accessibility`, based on `integrate/overflow-1-3` at G9 `dda021b`.

## Changed

- Account deletion cancellation now returns keyboard focus to **Delete my data**. The **Keep my data** control also keeps focus when account view data refreshes. Previously both paths detached the focused element and left focus on the document body.
- Native modal wrap now skips controls disabled by a parent fieldset and negative-tabindex controls, and respects the checked radio in a native group. A busy prediction form previously stopped backward navigation at the Close button; wrapping to the last unchecked radio also bypassed the group's native Tab stop.
- The board's visible pairing timer continues to count down, while a persistent polite status announces the cooldown and readiness only at transitions. The previous live status was rewritten on every tick. No pairing eligibility or timing rules changed.

## Verification

The focused command is:

```sh
cd frontend
npx vitest run tests/g20-kit-dom.test.js tests/a11y-native-controls.test.js tests/case-controls-stability.test.js tests/account-focus.test.js tests/g9-account-expiry-presentation.test.js --maxWorkers=1
```

All 20 tests pass across 5 files. The new account, modal and timer regressions were also run against their original implementation and failed as expected. Tests use real Chromium keyboard navigation and MutationObserver evidence; account tests send no player-data intent.

[Short-height capture checks](../../frontend/captures/20261108_overflow-a11y/checks.json) cover 320×400 and 375×400: visible focus, viewport fit, no horizontal overflow, and 44px active native-control targets. The isolated capture pass had no browser errors or external requests.

- [Account cancellation, 320px](../../frontend/captures/20261108_overflow-a11y/account-cancel-320x400.png)
- [Account focus restored, 320px](../../frontend/captures/20261108_overflow-a11y/account-restored-320x400.png)
- [Busy prediction form wrap, 320px](../../frontend/captures/20261108_overflow-a11y/busy-form-320x400.png)
- Matching 375px captures are in the same directory.

The integration owner will run the complete 61-screen accessibility audit after all three overflow changes merge. Physical phone, VoiceOver/NVDA and other browser engines remain manual coverage; no new claim of those checks is made here. This change adds no animation, new CSS, dependencies, assets or cold-title imports. Root will run the final title budget check.

## Mobile walking report

The initial user report was reproduced with a real CDP touch pointer at 375×667, 320×568 and 844×390 (`isMobile`, `hasTouch`, and coarse pointer enabled). Dragging the outdoor joystick moved the captain at all sizes, with no blocking dialog or failed hit test. Pointer release reset the thumb and stopped movement. Outdoor tapping had no movement implementation; the integration owner is adding tap-to-walk and clearer guidance. The room D-pad remains part of that owner's final movement verification.

No live deployment, environment variables, server rules, money semantics, reveal content, database files or API routes changed in this branch.
