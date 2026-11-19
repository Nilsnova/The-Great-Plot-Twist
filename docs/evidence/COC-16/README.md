# Village approach coverage review

The captures use the same paid Swivel and Harpoon in the actual local game. Ground and Sea use the same layout. The 375 × 812 Move capture shows the analysis from a valid unsaved position after panning.

| View | Coverage off | Coverage on |
| --- | --- | --- |
| Desktop 1280 × 720 | [Village](desktop-before.png) | [Ground](desktop-ground.png) |
| Phone 375 × 812 | [Village](phone-before.png) | [Ground](phone-ground.png) · [Sea](phone-sea.png) · [Move preview](phone-move.png) |
| Short phone 320 × 568 | | [Ground](short-phone-ground.png) |

All three Chrome scenarios verified the mode switch, a stable marker buffer on unchanged frames, a legal draft, a refused draft, Cancel, leaving for a friend's island, and starting a wave. The saved layout and wallet matched after the canceled Move. The short-phone Chrome accessibility tree exposed one named legend group with separate labels for each shape. The normal battle guide remained available during combat. The phone runs used touch emulation and reduced motion on the M1 Max with the local island fixture.

At 375 × 812, the confirmed Ground view drew 28 gap markers. The valid draft drew 10, and the refused move and Cancel restored the original 28. A pan exposed six of the draft markers on screen while retaining the draft coordinates.

The render count was 98 draw calls with coverage off and 99 for both Ground and Sea. Each of three settled 90-frame measurements had a 16.70 ms 95th-percentile browser frame interval. The separate desktop model benchmark prepared and classified 129 points against 11 attack towers in 0.036 ms at the 95th percentile. That measurement covers the model calculations only.

The cold title measurements passed with 19,011 bytes of JavaScript and 9,248 bytes of CSS, identical to the base revision. The stock loading check timed out on both revisions while waiting for focus on the game canvas after onboarding. A separate production browser run reached a visible game canvas with no browser errors or external requests.

The overlap audit passed 115 state and viewport combinations, including the active coverage toolbar with a toast at five sizes. The short landscape layout keeps the controls and legend clear of the toast.
