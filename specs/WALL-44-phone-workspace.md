# WALL-44: preserve the phone construction workspace and truthful camera insets

Responsible human: Johannes Franz Lang (`frcola`). Authorized follow-up to #241. No activation, deployment or merge.

## Verified problem

The actual 375×812 paid-fixture image `wall-24-accepted/unpaid-ghost-375x812.png` has an expanded wall bar about 516px tall, leaving a tiny island partly behind the panel. The camera also caps each inset at 60%, so it models less than the actual obstruction when this panel exceeds that threshold.

## Acceptance and scoped plan

1. Pin aggregate `b1755351b07e5c7e76c22de199ab5ddb70068d0c` on an immutable review base and claim a draft.
2. Make the phone fine arrows horizontal and combine camera/secondary actions efficiently, retaining every 44px target and current type size. Target normal expanded height at most360px, preferably340px.
3. Show initial instructions while needed; remove only redundant unquoted price/instruction rows after the status explains the next action. Keep actual quoted prices and all pending/unknown intent warnings. Use unambiguous compact Undo/Clear/Cancel controls with accessible names.
4. Signal every layout state through bar classes so existing camera inset caching refreshes.
5. Remove the camera's per-inset0.6 cap and invented10% free area. Respect real bounds; if no room exists, fail fit clearly and hold a finite stable view until room returns.
6. Extend real DOM viewport/caption/refusal/quoted/pending cases and canonical shore camera bounds. Keep desktop WALL-42 limits and original purchase/keyboard/quote tests.
7. Run only the coordinated available verification lane; WALL-24 performs a bounded actual-game phone ghost/refusal probe before final captures.

Likely files: wall-builder.css, wall-builder-bar.js, narrow player/camera.js math and existing DOM/camera tests, plus documentation. No rules, prices, protocol, transport, force clicks or smaller fonts.

## Current evidence and coordination

The original actual-game image is the reproduction, not a generated mock. The full frontend run owns Chromium now; this writer will not start a competing browser. Camera-agent read-only math review and WALL-24 selector/canonical-shore coordination are active. After implementation, actual-game before/after and aggregate checks remain required before human review.
