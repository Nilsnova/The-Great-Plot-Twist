# Detailed coastal art — November 6

Owner: Nils, implemented on `feat/redesign-art`. Scope: original title art, all 36 default island sprites, canonical ground, density-aware sprite selection and evidence. No server, migration, flag, dependency or runtime assistant integration changes.

## Changed

- `public/places/title.webp`: original generated 1672 × 941 coastal illustration, 274,026 bytes; prompt, processing and source/output hashes in `frontend/scripts/hires_art/PROVENANCE.md`.
- `public/pixel/hd/`: 36 newly drawn sprites at four times the original width and height, plus 4096 × 3072 freshly sampled ground. These contain finer authored details, rather than resized original PNGs. Every explorer direction and walking pose is covered. Manifest verifies dimensions, sizes and SHA-256.
- `pixelArt[].detail` and `loadArt`: detailed textures selected by default, logical sizes/anchors unchanged. Old PNGs and ordinary selectively loaded library art remain valid. Explicit `{detail:false}` loads old sources for comparison. This is an explicit quality/source option; the loader does not silently hide missing detailed-file errors.
- Transfer: all detailed sprites + ground **491,329 bytes**. Maximum decoded full-kit RGBA allocation **59,453,440 bytes (56.70 MiB)**, consisting of 8.70 MiB sprites + 48 MiB ground. No mipmaps. Live places load a subset of the full kit.

## Integration hooks

Root owns the following call sites and already has the requested changes prepared:

- `frontend/src/main.js`: title source `places/title.webp`, preserve `places/title.png` as fallback.
- `frontend/src/world/places/lighthouse.js`: use `pixel/hd/ground.png`, with legacy fallback if desired. Plane remains 64 × 48; no terrain/collision changes.
- Shell: normal image sampling and cover sizing for the illustrated title; remove the old 480 × 300 integer-scale assumption. Explicit title transfer budget 350 KB, unchanged JS/CSS budgets.
- Movement: render at native display resolution so the finer sources remain visible; camera, renderer and foot smoothing belong to the movement branch.
- Existing `check-pixel.js` retains legacy PNG gallery checks but its old world integer-upscale/foot-snap checks require the movement redesign's update. Root should ensure request accounting recognizes `/pixel/hd/` as well as legacy files.

## Verified

- `npm test -- tests/hires-art.test.js tests/pixel.test.js`: 10 tests pass. Physical assets/hash coverage, density/size/foot-anchor separation, library compatibility, legacy option, failed sibling load disposal, transfer/GPU bounds and old asset registration.
- `npm run build`: production build and spoiler guard pass.
- `uv run --project backend ruff check --config backend/pyproject.toml frontend/scripts/hires_art`: pass. `ruff format --check` with same config: eight files formatted.
- Real Chrome, same 1280 × 720 framebuffer and frozen camera positions before/after: cottage, lighthouse and shore. Both phases report 27 textures and 97 draw calls, no page/console errors and no external requests. HUD hidden for an unobstructed art comparison; the movement branch is not applied to this comparison. The after fixture selects the HD ground at the old ground URL because root owns the production ground call site.
- Art comparison files: `/workspace/redesign-art-evidence/{before,after}-{cottage,lighthouse,shore}.png`; JSON reports in the same directory. These session-local captures are review evidence, not public downloads.
- Fine-detail inspection with Pillow: within visible native 4 × 4 source blocks, 75.8% cottage, 87.9% explorer, 93.7% birch and 64.3% lighthouse contain sub-logical-pixel color/alpha variation. A nearest-neighbor enlargement would have no such variation. Visual review remains the quality gate.

## Limits and remaining

Production title usage, root's ground fallback, final native-resolution composition and mobile behavior require root's integrated browser checks. This branch intentionally leaves story/festival library characters and buildings at their original density; those are selective follow-on art work, not part of the default Lighthouse kit. The high-density ground has a 4096-pixel edge and a 48 MiB decoded cost; Three.js may rescale on devices with a smaller maximum texture size. No new texture requests or draw calls are added for the richer sprites.
