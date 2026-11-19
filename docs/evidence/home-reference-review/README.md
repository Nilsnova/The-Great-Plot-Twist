# Home Island mockup review

[Desktop Fit](desktop.jpg) · [Phone Cannon selection](phone.jpg) · [Playable view at the mockup’s 9:16 ratio](mockup-ratio.jpg)

The original mockup provided the terraced cliffs, rock outcrops, grass, palms and curved beach. The scenery was isolated from the reference and registered to the playable Home coast. Limestone paths, taller building sprites, the timber pier, the tender and the cannon controls render in the live scene.

The captures show `db2e5e0d` on the same offline save used in the previous visual comparison. The save has ten purchased structures with the same types, levels and coordinates. It shows the actual balance, wave record, cannon range, damage and upgrade price. The mockup shows four cottages and a different arrangement of buildings.

## Playable checks

- Chrome and WebKit exercised 1280 × 720 desktop, 375 × 812 phone, 320 × 568 phone and 450 × 800 touch. Native click and tap selected the house by its visible roof at all four sizes. Rotation and travel restored the appropriate camera.
- A click and tap on the gold Cannon button opened the existing confirmation with 15,500 coins still available. One confirmation bought Level 2 for 60 coins. Move, Range, Details and Close remain available through the selection panel.
- Chrome desktop and phone each selected the built wall on the canvas. Moving it into the existing join at `(16.5, -2.5)` retained both joins and the same wallet balance.
- The Wave 11 Smugglers longboat floats in the northern inlet and anchors at `(-4.82, -23.71)` after 13.9 seconds. The first boarder lands at `(-4.64, -22.87)` after 14.5 seconds. Both coordinates and times match the previous build.
- The production build passed seven packaged browser checks. Physical phone and VoiceOver acceptance remain open in [#236](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/236).
