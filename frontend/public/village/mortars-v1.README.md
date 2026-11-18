# Original shaded mortar family

VIS-08 #213, Johannes Franz Lang (`frcola`). Original OpenAI image-generation
output created17 November2026 for this project. No downloaded game assets,
third-party sprite packs or external image URLs. The project source cannon sheet
was supplied as a material/style reference; no third-party license is added.
This provenance does not assert exclusivity or a legal guarantee about generated
art. No offline crop, background removal, recolor, resize or pixel editing was
applied. The final original output was copied unchanged into this directory.

- Final original: `exec-0dd1cde1-d71d-450b-9453-ed869902e0de.png`.
- SHA-256: `6c61d30dd35419312568d98e66f80b4d54f5885fc4302475b3a6435fc102719f`.
- Native:1536×1024 RGBA,2,020,969 encoded bytes,6,291,456 decoded bytes.
- Source reference: `cannons-v1.png`, SHA-256
  `34d114e147b363bbef131b407d762d7006201a9d4c0cd89a3d01aa12238f48bf`.
- Five columns are existing levels1–5; four rows are intact, firing, damaged,
  broken. Metadata crops retain a3-pixel antialias gutter and shared per-tier
  root-relative fit. No source crop is written back to the original image.
- Coordinator approved logical visual box56×48/anchor7 to match cannon volume.
  Existing canonical frames remain48×32/5 in the fallback painter. World and
  combat use the coordinator's shared raster metadata only after registration.
  The paid2×2 footprint and all simulation state remain unchanged.
- Read-only alpha/bounds audit: `docs/evidence/VIS-08-mortars/asset-audit.json`.
  All4corners alpha0,968,800 alpha0 pixels, minimum10,404 solid pixels/crop,
  maximum crop-edge alpha4/255. Alpha>4 content fits one separate state cell.

## Generation record

Each call used `transparent_background: true`. Calls2/3 edited the preceding
image through the image tool, rather than an offline image processor. The first
output was rejected for translucent background haze. The second removed it but
its higher-tier firing smoke touched the row above. The final layout repair
produced separated safe crops. Only the final output ships here.

### Request1 — design, referencing the project cannon sheet

Create an ORIGINAL game sprite sheet of PIRATE MORTARS, not cannons. Use the attached cannon sheet ONLY as the material/rendering style reference: polished richly shaded 3D miniature game art with warm upper-left lighting, navy painted panels, brass/gold hardware, wood supports and gray masonry. New mortars must be SHORT WIDE upright squat metal pots with very large open dark mouths aimed steeply upward, on low sturdy bases, never long horizontal cannon barrels. Transparent background, absolutely no background color, no overall glow, no labels, text, divider lines, border or UI. Make a landscape1536×1024 sprite sheet with exactly FIVE evenly spaced columns (five upgrade levels) and FOUR evenly spaced rows (states). Maintain ample fully transparent gutters between every sprite; each complete sprite fits safely inside its307×256 cell. Same front-left three-quarter viewpoint, same ground center at cell centerX and cell bottom minus20pixels. Every state in the same column retains the exact same size, base location and foot. Columns left to right: level1 simple short dark iron mortar on compact timber cradle; level2 same design with a brass middle band and small cannonball pile; level3 enlarged reinforced mortar on a low octagonal stone pad; level4 brass-edged stone pad and elegant navy anchor-emblem side panels; level5 imposing gold/brass rim and armor, navy anchor emblem and reinforced brass corners, still identifiable as mortar. ROW1 intact and ready, row2 firing with a SMALL bright warm flash and one compact puff rising straight from its upper mouth, retaining original hardware and foot and no oversized floating smoke; row3 damaged, clear cracks/scorching/chipped rim but still standing, no firing; row4 broken, collapsed squat barrel and low rubble/wood/brass fragments lying on the SAME foundation footprint. Distinct tiers, rounded bevels, convincing metal highlights, readable dark rim cavity, detailed wood and stone, clean cutout edges, ambient shading only INSIDE each object. The scene contains only the20 mortar sprites. Do not reuse a cannon silhouette. Avoid a solid background or any painted rectangle behind the sprites.

Output: `exec-48ba7bb3-d781-46ed-9a1d-16b12d6d97dd.png` — rejected.

### Request2 — true transparent cutouts

Clean this sprite sheet into a production-ready transparent PNG cutout. Preserve the exact20 mortar designs, five columns/four rows, their existing locations, size, perspective, state, materials and painted detail. REMOVE EVERY TRACE of the white/gray/checkered/background haze, all wide cast shadows and halos behind/between sprites, and ALL background color to exact fully transparent alpha0. Only mortar hardware, its small physically attached foundations, fragments and compact firing puff/flame belong in each cutout. Transparent gutters should be completely clear. No new objects, labels, outlines, resizing or repositioning. Keep1536×1024 landscape canvas and full20sprites. The current file has translucent background across the whole canvas; fix it with true clean transparency including all four corners and every region between sprites. Keep visible hardware opaque with antialiased object edges. Background must be alpha0, not a faint transparent checker or fog.

Output: `exec-6f3ccfc0-a9db-4e4b-b1a5-63ee38e0225e.png` — rejected layout.

### Request3 — independent state-cell gutters

Production sprite-atlas layout repair. Preserve these20 excellent mortar designs/materials and true transparent cutout background, but there is TOO LITTLE SPACE between rows and the smoke of firing tier4/5 touches the intact bases above. Re-layout ALL20 sprites inside a precise5-column by4-row1536×1024 transparent atlas. Each cell307×256. Put every complete mortar's foot at cellY+224, center at cellX+154. Keep every sprite (including smoke, foundation fragments and all antialiasing) within x=cellX+28 tocellX+279 and y=cellY+26 tocellY+228. This leaves at least50 entirely transparent pixels between all rows. Reduce all tier hardware in each column uniformly as necessary so firing/standing/broken share the EXACT same per-tier physical scale and ground anchor. Firing flash/puff SMALL and compact, no smoke extending beyond safe box. Row1 intact, row2 firing, row3 damaged, row4 broken. Five progressively upgraded columns. Do not add, merge, omit or repeat sprites. Transparent empty gutters, alpha0 across every background pixel and allcorners. No ground plane/background/glow/shadow, no labels or UI. All existing visual identities and20 separate states retained. Particularly ensure the firing smoke cannot enter the intact row crop, and broken fragments have30px clear space from adjacent columns.

Output: final source named above. The resulting generator spacing is measured,
not assumed from requested cell coordinates; see the audit and actual metadata.
