# Core and progress source artwork (VIS-35)

Original assets generated with OpenAI image generation on November 17, 2026 for
Johannes Franz Lang (`frcola`), [issue #364](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/364).
No downloaded game assets, fonts or external runtime services are included.
The approved pirate-village concept and the project's original cabin artwork
were supplied as style references. PNG bytes are copied unchanged from the tool;
no offline crop, background removal, recoloring or resizing was performed.

## Prompt and source history

The core prompt requested the existing heart target as a shaded navy-slate,
timber and brass pavilion with a low stone floor, open front and open sides.
It required transparent space under the roof, identical floor scale/feet in
intact, cracked/damaged and collapsed low-rubble states, without text, people,
UI or scenery. The first landscape output was 2172×724 and exceeded the
provider's 2048-pixel side limit. An image-generation edit rearranged those
same states into a square 2×2 sheet: intact top left, damaged top right,
rubble bottom left and empty bottom right, with transparent gutters.

The progress prompt requested five small nautical landmarks on transparency:
a timber/brass record board with a blank navy plaque, and bronze, silver,
gold/pennant and crowned captain statues with blank plinth plaques. It
explicitly prohibited baked-in numbers, labels, UI and scenery. The generated
columns are unequal; measured native rectangles, rather than equal guessed
cells, are supplied to the renderer.

Tool source basenames: `exec-34e568b3-1054-41fc-b1ab-702ede8bb96d.png`
(core) and `exec-6f7c1462-cdaa-4068-bf46-a74443139cec.png` (progress).
The original rejected-size intermediate was
`exec-5c1c6fd4-a2f5-4600-8f83-a209e34eb342.png`; it is not shipped.

## Measured source and fitting contract

| File | Native pixels | Encoded bytes | SHA-256 |
|---|---|---:|---|
| core-v1.png | 1254×1254 RGBA | 1,078,155 | add2139b0c727713130ef46a61babfa73be43ab8b71a7b6c1db3fef9236f4f54 |
| progress-v1.png | 1774×887 RGBA | 1,200,780 | e1bb8a1679dd6e0d53ff50b515f6e849f6f2cb93637d775827b4ebe023183636 |

Core has 1,118,141 exact-alpha-zero pixels; progress has 1,056,707.
Read-only Pillow alpha inspection measured solid silhouettes (alpha ≥16);
native rectangles include a small transparent margin. Alpha-zero RGB may look
dark in a raw preview; the runtime uses the actual alpha channel.

`src/art/village/core.js` and `progress.js` contain native source rectangles,
ground feet and presentation sizes. Core states share `[281,551,282,24]`
left/top/right/bottom fit bounds and 128×128/anchor12 logical pixels. The
collapsed state retains the same scale and ground foot; it is not enlarged to
fill the intact roof's height. Statues share fit bounds across the four stages.
Board and statue logical sizes are 40×48/anchor4 and 40×56/anchor4.

The world draws the actual best-wave number/rank and the existing milestone
threshold (25/50/75/100) on the blank plaques. These assets add no headquarters
entity, purchases, progression, resource, collider, pathing or health values.
The pavilion reads actual combat HP through a guarded display adapter. A zero-HP
core is rubble until a new accepted wave or real island reset/context change.

These images prove source quality and transparency only. Whole-game desktop
and phone captures after combined integration determine visual acceptance.
