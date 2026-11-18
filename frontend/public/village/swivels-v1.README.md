# Original shaded swivel-gun nests — VIS11

Original artwork generated for this project with OpenAI image generation.
No third-party downloaded artwork or game sprite was included. The coordinator
approved the supplied reference direction and the56×48/anchor7 presentation
box; native image pixels do not change the paid2×2 footprint or game rules.

- File: `swivels-v1.png`, original final tool output copied without pixel edits.
- Native:1536×1024,8-bit RGBA;2,610,002 encoded bytes;6,291,456 native RGBA bytes.
- SHA256:`f9ea99856f45b670f7f708b225c08ab819f393a2b1f4aa69515e2f446c4f5d78`.
- Final output:`exec-7b676506-cc40-497a-bc64-6e79d89f0651.png`.
- First output:`exec-989a6319-2ed8-49e6-afde-81769a3dd090.png`, rejected background haze.
- First cleanup:`exec-ec366484-94c5-448d-8796-ad68988c4f3b.png`, rejected residual corner opacity.
- Transparency was corrected through image generation, not an offline image editor.

The twenty canonical frames are five real tiers by intact/firing/damaged/broken
state. The existing pellet remains code-drawn. Tier1 iron/plain timber, tier2
stone footing/full sandbag ring, tier3 brass/powder keg, tier4 gold/teal pennant,
tier5 gilded gun/navy star pennant. The short wide-mouth gun sits in a yoke on a
post within sandbags; it has no wheels/carriage and remains distinct from cannons.
The source row bands are measured0–263,263–525,525–800,800–1024; the generator
was not assumed to have followed exact uniform row boundaries. Each native crop
has a clear edge, and each tier's four states share one fitting box and foot.
Read-only alpha/bounds findings are in `docs/evidence/VIS-11-swivels/asset-audit.json`.

## Exact generation prompt

`transparent_background: true`; new image with no referenced images:

```text
Create an ORIGINAL professional game sprite atlas on a genuinely transparent alpha background. Landscape 1536 by 1024 composition. EXACTLY 20 separately isolated pirate swivel-gun nest miniatures, arranged as FIVE evenly spaced columns by FOUR evenly spaced rows. Each cell is 307x256. Keep ALL pixels of each sprite including its shadow and smoke inside its own cell with a completely TRANSPARENT margin at least 20 pixels on every side. No labels, numbers, letters, watermark, borders, grid or scenery. The transparent background must have alpha zero, not gray haze or colored fill. Each column is the SAME swivel-gun nest upgrade tier in all four rows. Rows top to bottom: INTACT, FIRING, DAMAGED but standing, BROKEN wreck. Same viewing angle and same ground foot within each column across rows. Consistent LEFT-to-RIGHT increasing tiers1 to5, same natural scale rather than objects expanding hugely.

STYLE: richly shaded stylized 3D pirate village miniature for an approachable high-quality strategy game, like hand-painted 3D models viewed from a slightly elevated front-three-quarter angle. Warm gold/brass accents, naval navy-blue cloth, warm timber, pale sandstone, gray stone base, soft warm upper-left key light, readable chunky material volumes, clean separated silhouettes, refined beveled edges, soft internal shadows. No realistic photo look, no thick cartoon black outlines. Weapon faces RIGHT so the muzzle is at the right of the sprite.

Distinct SWIVEL-GUN NEST identity: a SHORT, WIDE-MOUTHED blunderbuss-like naval swivel gun, mounted on a fork/yoke on a short timber post, surrounded by a LOW ROUND RING OF SANDBAGS. NO cannon wheels, NO carriage, NO long cannon barrel, NO mortar pointing upwards. Low compact base, visible beige sandbag pillows and tied seams. Tiny powder keg on the right for higher tiers. No human characters.
Tier1: plain dark iron wide-mouth swivel gun, a few tan sandbags, simple wood post, modest timber footing.
Tier2: complete sandbag ring on a fitted gray stone footing, sturdier iron yoke, small brass band.
Tier3: polished brass short flared barrel, iron yoke, small powder keg, layered stone footing.
Tier4: brass barrel with bright gold muzzle ring, gold ropes on sandbags, small TEAL pennant on a pole at the back LEFT.
Tier5: royal gilded short swivel gun, reinforced dark iron yoke, navy-blue pennant with a small gold STAR, ornate but legible stone base and sandbag ring.

Top row intact. Second row firing: same nests and feet with a SMALL bright THREE-PRONG pellet muzzle flash at the right muzzle, tiny localized pale smoke puff. Keep flash/smoke fully isolated INSIDE each cell; do not create clouds reaching cell boundaries. Third row damaged: same tier's recognizable standing nest, scorched/cracked sandbags and bent support, little contained smoke at most, not a duplicate intact object. Bottom row broken: low wreck of that SAME tier, split sandbags spilling sand, snapped post, short bent recognizable gun lying on rubble. Broken wrecks retain their own tier materials and tiny pennant remnants, but have genuine much lower silhouette; do NOT fill missing height with large smoke. No huge floor shadows or backdrop. Keep all twenty objects crisp, consistent and transparent-separated.
```

## Exact first cleanup prompt

`transparent_background: true`; referenced first output:

```text
Clean this original 20-object swivel-gun nest game sprite atlas for production transparency. Preserve ALL twenty distinct designs, state identities, tier order, the 5-column by4-row layout, proportions and feet. Keep the same 1536x1024 landscape canvas. Remove the brown/gray/teal background haze COMPLETELY, including between sprites, below sprites, and behind smoke/flags. ALL negative space must be actual alpha-zero transparency, no matte color, no checkerboard pixels, no glow, no opaque rectangle, no vignette, no global fog. Each sprite must be individually cut out. Keep only the miniature itself and its small contact shadow; any smoke must be very small/localized with transparency and fully inside its cell. Keep at least16 fully transparent pixels at outer edges of EACH307x256 cell, especially top-tier4 and5 flags and bottom rubble. Reduce and lower top-row flags slightly if needed to create that clean margin, without changing visual tier identity. Do not crop flag tops or connect any sprite to another by haze/smoke. No labels/numbers/text/grid/borders. The style is refined shaded3Dpirate miniatures with a short wide-mouth swivel gun on yoke/post and LOW sandbag nest, not wheeled cannon. Preserve one genuine firing state row with three-prong flash, one cracked/scorched standing damage row, and the low broken wreck row. Crisp actual object opacity and TRUE TRANSPARENT BACKGROUND everywhere else.
```

## Exact final cleanup prompt

`transparent_background: true`; referenced first cleanup:

```text
Make this an actual transparent-alpha game atlas, preserving every one of the twenty original swivel-gun nest designs and their five-column, four-row positions. Remove the faint colored background matte/haze behind and between all the individual objects. Set the entire outside negative space, ALL four corners and the outermost 16-pixel canvas border to completely clear alpha ZERO. The background must be empty transparent pixels, not a visible dark or colored surface and not semitransparent residual haze. Isolate each miniature with a clean cutout alpha edge; keep genuine object colors opaque and keep only a small tight ground-contact shadow. Keep localized smoke attached to the damaged weapons but no smoke on the background or connecting cells. No large floor shadows. Do not repaint the weapons, change level identities, state order, gun direction, flags or feet. Preserve original 1536x1024 canvas and separated sprites, with no extra labels/grid/text/checkerboard graphic. The bottom-left corner currently contains a tiny residual alpha; explicitly eliminate all residual opacity in every outside corner and along every outside canvas edge.
```

## Limits

The native PNG and recording-canvas tests prove source metadata and normalization
math. They do not prove composed browser appearance, muzzle/HP-bar alignment,
world/combat pixel parity, sustained performance or final desktop/phone matching.
Registration and compiled-source inclusion are the coordinator's separate changes.
