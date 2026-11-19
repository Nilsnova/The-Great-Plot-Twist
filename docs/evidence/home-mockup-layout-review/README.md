# Home Island mockup layout review

[Desktop before Wave 14](desktop.jpg) · [Phone before Wave 14](phone.jpg) · [9:16 phone with cannons arranged using Move](phone-move-example.jpg) · [Live Wave 14](live-wave.jpg)

The layout follows the mockup’s four-cottage composition, eastern watchtower, southern bell and center-right timber pier. The two northern cottages are part of the scenery. The existing two paid houses appear as players build and upgrade them. The cannon footings, character shading, shore sand and stone paths complete the same visual treatment. The 9:16 example uses three ordinary, accepted cannon moves. It is an example save rather than a third set of default positions.

The game uses the original wave lanes, land shape, costs, unlocks, paid slots and combat rules. An older save gives priority to its saved placements. The earlier anchors and scenery visibility handle overlaps without rewriting the save. The bell remains usable when an existing defense occupies the preferred southern placement.

## What was exercised

- The runtime in `d1c0013c` ran natively on desktop and three touch viewports, including 320 px and the mockup’s 9:16 aspect ratio. Four cottages appeared after the existing two houses were purchased. Real movement, placement and the moved bell started Wave 14. The cannon and mortar fired.
- The live east, south, west and northern smuggler approaches recorded identical ship spawns, anchors and first landings to the previous build. Each first dry step samples warm sand. A separate sweep across 96 Smugglers scenarios kept 288 longboat anchors and 1,152 neighboring hull samples clear of the illustrated shore.
- In a real northern encounter, a roof faded while a boarder passed behind it. Its captain collision remained active, and full opacity returned after the boarder passed and after settlement.
- Chrome verified live Wave 41 damage on desktop and phone, including the damaged Heart art and broken wall states. A transferred older browser save kept its island code, balance and saved positions.
- WebKit exercised touch movement and cannon selection at 375, 450 and 320 px. With a selected cannon, the watchtower fades only when it obscures the selected building. The pier clears the selection card at all three sizes.

Physical phone and VoiceOver acceptance remain open in [#236](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/236).
