# Home broadleaf

Original decorative Home vegetation generated with the built-in OpenAI image tool on 19 November 2026. The plant uses the existing Home garden batch. Its foot and logical size come from `src/art/village/home-foliage.js`.

The source stays here for authoring. In an isolated checkout of the frontend, run `node scripts/bake-village-art.mjs --families=home-foliage` and `node scripts/ship-village-art.mjs`. The 168 × 120 WebP in `village/accents/` uses the resulting 4× frame with the source's alpha intact. The browser comparison measured a mean visible RGB delta of 3.87. Its size is 8,260 bytes.

## Generation prompt

> One production-ready game vegetation sprite, isolated on genuine transparent alpha. A single low, compact tropical broadleaf fern clump for an original sunny pirate island village. Three-quarter view from above at about 35 degrees, with the feet visible and foliage oriented naturally. The silhouette is low and roughly wider than it is tall, with five to eight broad curved leaves, each with a readable ridged midrib, layered overlapping leaf masses, a few small short basal blades, and rich peacock-green shadows under fresh lime and golden-green sunlit tips. Sculpted painterly 3D lighting from the upper left. Clean bright color. Dark deep-olive occlusion where leaves gather, gentle controlled reflective light on the right. Readable at 24 pixels. Ground origin centered at the lower stem. Completely isolated, no pot, no soil patch, no rock, no flowers, no detached leaves, no cast shadow outside the plant, no water, no words, no framing, no game interface. Keep the whole plant visible with transparent margin around it. The output is one reusable original in-game sprite.
