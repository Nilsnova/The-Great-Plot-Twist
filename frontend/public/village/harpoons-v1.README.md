# Original shaded harpoon family

VIS-09 #214, Johannes Franz Lang (`frcola`). Original OpenAI image-generation
output created17 November2026 for this project. No downloaded game artwork,
third-party sprite pack or external image URL was used. No third-party asset
license is added. This provenance does not assert exclusivity or a legal
guarantee about generated art. The final output was copied unchanged; no offline
crop, resize, background removal, recolor or pixel editing was applied.

- Final original: `exec-86c4c731-4b5d-47d8-8c06-183907b1d20e.png`.
- SHA-256: `46e2050d0c7fc4480babe7f54f210a7a04572c5fe232f51e7943fc30b5a6d755`.
- Native:1536×1024 RGBA,2,004,621 encoded bytes,6,291,456 decoded bytes.
- Five columns: existing levels1–5. Four rows: intact, firing, damaged, broken.
  Firing releases the loaded harpoon and string; it has no false gun flame.
- Canonical20 identifiers and paid2×2 footprint remain. The coordinator approved
  logical56×48/anchor7 to match the shaded cannon/mortar volume; fallback painter
  remains48×32/5. This drawing does not alter range, slowing, health or price.
- Per-tier shared virtual bounds preserve source scale and the same normalized
  foot across the long loaded shaft, released pose and low rubble. Native
  source feet differ by row because actual generated ground positions differ.
  No source rectangle is written back into the original image.
- Read-only alpha/bounds audit: `docs/evidence/VIS-09-harpoons/asset-audit.json`.
  All4corners alpha0,1,130,214 alpha0 pixels; minimum8,763 solid pixels/crop;
  maximum crop-edge alpha2/255. Alpha>4 content remains in an independent cell.

## Generation record

Both calls used `transparent_background: true`. Request1 generated a new image
without reference images. Its tight layout was rejected: top-row harpoon tips
and bases approached state-cell boundaries. Request2 edited that original using
the image tool, retaining designs while making safer gutters. Only its final
unchanged output ships here. Requested positions are design directions; metadata
uses measured actual output bounds and feet rather than assuming prompt success.

### Request1 — original design

Original production-ready game SPRITE ATLAS, transparent PNG, landscape1536×1024. Exactly20 stylized3D PIRATE HARPOON BALLISTA TOWERS in a precise5-column×4-row grid, no text or labels or dividers. Same warm upper-left studio lighting, polished richly shaded miniature rendering, rounded wood bevels, dark steel, brass/gold hardware, navy anchor-emblem panels and gray stone pads. They must clearly be LARGE CROSSBOW/HARPOON LAUNCHERS: timber stock aimed diagonally upward-right, wide gently curved steel/wood bow arms, visible taut string and a big thick BARBED HARPOON shaft with attached rope, compact rope spool/coil beside its sturdy stand. NOT cannons, rifles, mortar barrels or archer towers. Each307×256 cell has the foot at centerX and bottom minus28pixels; all content including loose rubble and rope stays in cellX+28..cellX+279, cellY+35..cellY+228. At least40 completely transparent pixels between rows and40 between columns. Each column keeps identical hardware scale, ground foot and facing across four states. Level1 plain warm timber stand, wood bow arms, darkiron barbedbolt, rope coil; level2 iron-reinforced timber, brass rivets and brass bow tips; level3 larger reinforced ballista on low octagonal stone foundation, brass bands and heavier rope drum; level4 navy anchor sideplate, gold-edged stone pad, strong brass bow tips; level5 impressive gold/brass-reinforced arms, steel harpoon head, navy anchor armor panels and gilded masonry corners, same basic harpoonballista identity. ROW1 intact with loaded visible harpoon, taut bowstring. ROW2 firing: the projectile is GONE from the stock, bow arms released, string relaxed, short rope end trailing a little to the right; NO flame, fire, muzzle flash, explosions or smoke. ROW3 damaged but standing: cracked wood, bent arm, frayed rope, damaged stone, NO firing or flame. ROW4 broken: collapsed bow arms, splintered wood, snapped rope and metal/stone rubble in the SAME low foundation footprint. Keep wrecks low and avoid intact launch-ready silhouette. Rich coherent3D volume and natural material shading, clear strong silhouettes readable when reduced to56×48 pixels. Clean opaque hardware interiors with antialiased edges. All background/gutters/corners EXACT fully transparent alpha0; NO haze, rectangular backdrop, broad cast shadow, gradient, checkerboard painting or overall halo. Only the20 separate original cutout sprites.

Output: `exec-76dafff5-19be-4799-8566-1d5654593b88.png` — rejected tight layout.

### Request2 — independent cell gutters

Production atlas layout correction ONLY: preserve all20harpoon ballista designs and states, the five upgradecolumns and four rows, polished shadedwood/brass/navy/stone materials and upperleftlight. KEEP true transparent background alpha0. The currenttoprow harpoon tips and several bases are too close to cell boundaries. Make all20 cutout sprites uniformly smaller within their own cells, without changing each column's hardware size between intact/firing/damaged/broken. Canvas1536×1024 exactly, five equalwidthcolumns and four256pixelheightrows. Eachcell centerX=154, anchorY=220 relative toitscell. Every complete object including loaded barbedtip, ropes, rubble, base and antialiasedfringe MUST fit INSIDE cellX+36..cellX+270 and cellY+32..cellY+228, leaving at least64clearverticalpixels betweenrows and70betweenneighborcolumns. Allsourcefeet alignwith samecolumn root. Intactrow loaded harpoon; firingrow noharpoon, releasedstring and shorttrailingrope, NOsmokeorflame; damagedrow bentcracked butstanding; brokenrow lowcollapsedrubble. Do not add/omit/duplicate sprites or change theiridentity. All background pixels, gutters and corners must be EXACTalpha0, no fog/haze/coloredplanes, castshadowgradient orcheckerpattern. Hardware opaque with clean antialiasededges. No labels, text, UI, frames, globalbackdrop or borders. Preserve20 separatecutouts andthe fullbarbedtip withoutclipping.

Output: final source named above. Actual gameplay readability, firing/picking
alignment, GPU parity and final visual acceptance follow coordinator activation.
