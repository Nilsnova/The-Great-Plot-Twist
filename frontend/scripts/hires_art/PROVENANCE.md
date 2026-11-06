# Original detailed coastal artwork

Created for Nils's November 6, 2026 request for substantially richer, higher-resolution game graphics. No art was extracted from the supplied screenshots, other games, texture packs, logos or named characters.

The 36 PNGs in `public/pixel/hd/` are fresh project-authored drawings from the Python sources in this directory. They use quarter-logical-pixel drawing coordinates at four times the original width and height. They do not read, enlarge, filter or trace an old PNG. The new detail includes masonry courses, individually edged roof shingles, timber grain and nails, glass reflections, cottage window boxes, hat fibres, coat seams, backpack hardware, nine walking/directional poses, individually shaded foliage clusters and leaves, bark, ropes and dock equipment. Their unchanged logical bounds and feet anchors preserve movement and collision contracts.

The 4096 × 3072 ground is freshly sampled at 64 pixels per world unit from `src/world/terrain.js` by `export-ground.mjs`, with code-authored grass, fine sand, pebbles and stone ledges. It maps to the same 64 × 48 plane. Visual path routes preserve the original approach and destinations. The authoring script reads no server, private story data or external service.

From `frontend/`, run `python3 scripts/hires_art/generate.py`. Authoring requires Python, Pillow, NumPy and Node with the existing frontend installation; runtime/build tests require no new dependency. The initial verified environment used Python 3.12, Pillow 13.0.0 and NumPy 2.3.5. Fixed seeds make drawings reproducible within that authoring stack. `public/pixel/hd/manifest.json` records dimensions, byte counts and SHA-256 hashes. No cached Python bytecode or authoring virtual environment belongs in Git.

## Illustrated title

`public/places/title.webp` is a new original image produced on November 6, 2026 using the OpenAI image-generation tool (`image_gen.imagegen`), followed only by format compression. It is 1672 × 941, with no baked lettering, UI, logos, people or story spoilers. The quiet left-hand sea leaves room for accessible HTML title controls; lighthouse and harbor detail gather on the right. The old `places/title.png` remains as a fallback and historical source.

The generated PNG was compressed with ImageMagick using `magick <original.png> -strip -quality 84 frontend/public/places/title.webp`. The generated original is retained as a session artifact, rather than shipped as another 2.6 MB download. The shipped WebP is the durable composition; re-running a generative prompt is not a byte-reproducible source process.

Generation prompt:

> Create an ORIGINAL premium illustrated game title background, landscape 16:9 composition, no lettering, no logos, no UI, no watermark. An atmospheric North Atlantic storybook coastal island at blue-hour sunrise: a tall ivory lighthouse with a warm amber lantern and slate cap dominates the RIGHT third on a rugged mossy headland; below it a tiny lovingly detailed timber harbor village, red and teal roofs, stone paths, rope moorings and small fishing boats; silver turquoise water sweeps from lower left through the bay, layered distant misty islands, seabirds, wild grasses and wind-bent pines in foreground. The LEFT third must be mostly quiet deep navy/teal sea and mist with only sparse subtle texture so cream game title text can sit there legibly later; scene details and warm light gather to the right. Art direction: exceptionally polished high-resolution 2D adventure game environment, hand-painted fine material detail, precise small architectural edges, richly textured slate and weathered wood, soft volumetric lighthouse beam and beautiful subtle water reflections, crisp vivid silhouettes and restrained cinematic depth. Modern cozy mystery RPG, mature inviting and magical atmosphere, visually rich rather than blocky low-resolution pixels, absolutely no humans or named story characters. Keep terrain and building forms believable, no fantastical impossible architecture. New original art, not emulating any specific artist or franchise.

Title output hashes are recorded below. No runtime image-generation or assistant connection is added.

- Original generated PNG SHA-256: `692d1356473474d5475aaa03d6508623fcf75f4945f11621328a498b11278440`
- Shipped WebP SHA-256: `2529451181e7bcaab34335822f341b1511a74753afd1d0a2b4f26070bcd8d5e0`
