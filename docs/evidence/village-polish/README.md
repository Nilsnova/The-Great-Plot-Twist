# Village inspection and shore polish

The selected building stays visible while you see its actual level, installed role or skill, and confirmed health where available. Village mode supports mouse, touch, and keyboard. Press **E** from the village canvas to focus **Find building**. **Details** opens the existing action panel and returns focus to the selected-building dock when you close it.

| What to review | Evidence |
| --- | --- |
| Selected Cannon and foreground foliage | [Desktop before and after](desktop.png) |
| Level 5 Cannon with Heavy shot and 200 / 400 confirmed HP | [Phone before and after](phone.png) |
| Bollard, mooring rope and small navy skiff | [Southwest shore detail](cove.png) |

## What the tests covered

- On the early, middle and late saved islands, the real desktop and touch journeys selected the expected buildings in Fit and Work. An opaque foreground Barracks roof now picks the Barracks. Transparent artwork leaves the visible building behind it selectable. The sampled Cannon regained visibility when only its foreground tree faded.
- The optional clear-weather Range overlay matches the selected weapon's primary target acquisition. The three sampled Cannon ranges were 28, 42 and 50 units. The Mortar sample showed its 52-unit outer radius and 8-unit minimum. A confirmed zero-health Mortar had repair details and no firing overlay. The preview covers the between-wave slice of #156.
- Native Chrome checks covered 1280 × 720 desktop, 375 × 812 touch and a 320 × 640 touch layout. Fit, Work, panning, focus return, Move cancel and actual saved health were exercised in the game.
- In matched Wave 9 Treasure Galleon runs, the skiff and rope hid at countdown and through the live attack. The bollard remained visible. Shore walking, tree collision, Harbor round trips and the ship snapshot matched the baseline.

The paired images use offline saves and the same viewport within each pair. Village inspection was captured at `6e9a30bb` and the shore detail at `0c6430e2`. The combined desktop and touch rerun at `373c6fb3` over `main` at `d58d9246` reproduced the same camera, prop positions, and wave visibility. The browser phone runs used touch emulation.
