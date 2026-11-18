# WALL-44: preserve the phone construction workspace and truthful camera insets

Responsible human: Johannes Franz Lang (`frcola`). Authorized follow-up to #241. No activation, deployment or merge.

[Issue #335](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/335), native child of #241; [Draft #336](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/336). Branch `fix/wall-44-phone-workspace`, immutable base `chore/wall-44-pinned-base` at the source above. Retarget before eventual human merge.

## Verified problem

The actual 375×812 paid-fixture image `wall-24-accepted/unpaid-ghost-375x812.png` has an expanded wall bar about 516px tall, leaving a tiny island partly behind the panel. The camera also caps each inset at 60%, so it models less than the actual obstruction when this panel exceeds that threshold.

## Acceptance and scoped plan

1. Pin aggregate `b1755351b07e5c7e76c22de199ab5ddb70068d0c` on an immutable review base and claim a draft.
2. Make the phone fine arrows horizontal and combine camera/secondary actions efficiently, retaining every 44px target and current type size. Target normal expanded height at most 360px, preferably 340px.
3. Show initial instructions while needed; remove only redundant unquoted price/instruction rows after the status explains the next action. Keep actual quoted prices and all pending/unknown intent warnings. Use unambiguous compact Undo/Clear/Cancel controls with accessible names.
4. Signal every layout state through bar classes so existing camera inset caching refreshes.
5. Remove the camera's per-inset 0.6 cap and invented 10% free area. Respect real bounds; if no room exists, fail fit clearly and hold a finite stable view until room returns.
6. Extend real DOM viewport/caption/refusal/quoted/pending cases and canonical shore camera bounds. Keep desktop WALL-42 limits and original purchase/keyboard/quote tests.
7. Run only the coordinated available verification lane; WALL-24 performs a bounded actual-game phone ghost/refusal probe before final captures.

Likely files: wall-builder.css, wall-builder-bar.js, narrow player/camera.js math and existing DOM/camera tests, plus documentation. No rules, prices, protocol, transport, force clicks or smaller fonts.

## Current evidence and coordination

The original actual-game image is the reproduction, not a generated mock. The full frontend run owns Chromium now; this writer will not start a competing browser. Camera-agent read-only math review and WALL-24 selector/canonical-shore coordination are active. After implementation, actual-game before/after and aggregate checks remain required before human review.

## Implemented behavior

At phone widths up to 480px, all four fine arrows occupy one horizontal row. Camera controls and Undo/Clear/Cancel share a touch-size row; purchase keeps a full row. At widths below 375px the camera uses a separate row so no touch target or label must shrink. The bar stays at most 340px tall and remains scrollable inside existing safe-area/narration bounds; typography is unchanged. Undo retains the accessible name `Remove last`, while Clear still removes the entire draft.

Initial instructions remain for an empty draft. A nonempty draft with its own status does not repeat the initial tap instructions. An unquoted price paragraph is omitted because the status and Get price action already explain that step. Actual quoted totals/capacity and the full pending/unknown warning remain. Explicit `has-wall-instructions`, `has-wall-warning` and `has-wall-quote` classes make reflows visible to the game's existing camera inset cache. Disclosure's existing class signal remains unchanged.

The camera uses actual nonnegative top/bottom fractions. It no longer caps each at 0.6 or invents a 10% free area. When overlays leave no room, `villageFrame` returns null; an obstructed home-island management view holds its last finite camera rather than consuming exploration wheel input or jumping to captain zoom. Tour, battle and Tab precedence and other places retain their existing handling. A returning usable region recomputes the frame normally. The camera agent independently reviewed this math/fallback without editing source.

## Executed evidence

Before changing camera code, the two new focused regressions failed: a canonical shore point reached y=296.5156 behind the true panel boundary y=296, and a fully occupied viewport returned an invented positive fit. After correction:

```sh
cd frontend
npx vitest run --maxWorkers=1 tests/player/village-camera.test.js
```

**Test Files 1 passed (1); Tests 13 passed (13); Duration 1.79s; exit 0**. The canonical 181-point `cliffProfile` contour stays between the actual 180px top and 516px bottom insets on 375×812. No-room hold/recovery does not consume exploration wheel input. Existing Fit, working zoom/pan, travel, battle/tour and invalid-update tests remain.

After the integration owner released the single browser lane:

```sh
cd frontend
npx vitest run --maxWorkers=1 tests/island/wall-builder-dom.test.js
```

**Test Files 1 passed (1); Tests 10 passed (10); Duration 28.25s; exit 0**. No timeout or assertion was relaxed. Cases include the original phone disclosure, 120px caption, actual draft shift/quote invalidation/clear/Escape and all original desktop bounds/purchase isolation cases. The new real DOM case exercises draft/ready/refused/building/unknown states at 375×812 and 320×568 with a declared 120px caption and 100px top region: expanded height ≤340px, every enabled button scrollable to an actual 44px direct hit, preserved quoted totals/capacity and pending warning, complete refusal text and the canonical coastline above the measured panel.

`node scripts/text-lint/index.mjs`: **4507 candidate strings in 500 source files; 0 errors, 8 report-only findings; exit 0**. `undo` was checked as the standard American English verb for reversing the last draft edit, then added to the word list. `git diff --check` passed. Chromium was released immediately after the focused job.

## Remaining and explain-back

WALL-24 must run the bounded actual-game 375px ghost/refusal probe on the integrated source and attach actual before/after images. These component/pure tests do not replace the original full-game reproduction or establish Safari, physical-device, production or aggregate full-suite evidence. The root coordinates full frontend/build/budget/a11y/demo checks after other pending fixes. No rollout, activation, live migration application or merge.

In Johannes's words: I stopped repeating instructions once the draft already explains its next action, kept paid-build warnings and real prices, and arranged touch controls to leave more room for the island. The camera now fits the space that actually exists. If there is no space, it keeps a stable view until the controls or captions leave room again.

Questions: Why must a pending purchase keep its warning after closing? Why does the camera need actual overlay heights rather than a percentage cap? Why can a scrollable panel be more usable than shrinking touch targets?

## Visible-label follow-up

The WALL-24 actual-game quoted phone image prompted a text-fit audit. A read-only 375×812 probe loaded the real game `kit.css`, including its 700-weight 17px system font. Before correction, Cancel's Range advance was 56.25px inside only 48.33px of content: button width 60.33px, clientWidth 56 / scrollWidth 60, with its text reaching 3.92px beyond the inner border. The previous component fixture did not load those global kit styles, so its touch-box checks had not detected this clipping.

The three text columns now use intrinsic `min-content` minima, preserving unbroken labels while allowing spanning draft text to wrap. Two pixels of horizontal panel padding per side are reclaimed; the font, buttons, panel width and 340px cap stay unchanged. Phones below 375px use the separate camera row. `max-content` was considered but rejected by the same bounds checks because it also expanded spanning draft content; it is absent from the final change.

The existing quote/retry DOM case now imports the real kit styles and checks each visible button's Range bounds against its content padding plus scrollWidth≤clientWidth, in addition to all original 44px/hit/viewport/desktop checks. The focused regression first failed specifically `Visible label: Cancel`. After correction, the complete unchanged 10-case file passed:

`cd frontend && npx vitest run --maxWorkers=1 tests/island/wall-builder-dom.test.js`

**Test Files 1 passed (1); Tests 10 passed (10); Duration 17.62s; exit 0.** No timeout, existing assertion, font size or touch target was weakened. `git diff --check` passed. Chrome was released immediately after this file; no database, render metrics or full capture journey was rerun for this CSS correction.

Post-correction read-only probe with actual kit font: Cancel button 68.25px / text 56.25px / content 56.25px, clientWidth 64 / scrollWidth 64; Undo and Clear each 58.375px with text 45.31/44.06px inside 46.375px content. Quoted expanded bar height remains 334.953px. Root owns the affected actual-game workspace probe/snapshots on the final aggregate; this component evidence is not substituted for that final image.
