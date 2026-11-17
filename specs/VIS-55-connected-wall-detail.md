# VIS55 Connected wall detail

> **What this is:** a presentation-only refinement of existing wall tiers and selection.
>
> **Who uses it:** village builders, defenders and reviewers of the shared wall renderer.

- **Status:** in progress; Draft review and human acceptance remain open.
- **Branch:** `fix/vis-55-connected-wall-detail`
- **Issue:** [#423](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/423)
- **Base:** `6c87b8dcd2d7a1bb5376c3b64bbede27a144479e`, the VIS57 current-main/visual preview.

## Why and scope

Straight connected runs currently hide every middle post, including a selected wall's authored banner. The five existing materials need clearer profiles and cap trim. Use the supplied artwork and existing painter layers; add detail geometry without creating one draw object per wall.

Likely files: `frontend/src/island/wall-batches.js`, focused wall drawing tests and evidence. No public interface or new shared product decision changes: D063/D064 already authorize this bounded presentation work. The old no-art fallback and its independent position/hash receipts remain unchanged.

## Presentation contract

- Keep full authored posts at ends, corners, branches, mixed tiers, damage and selection.
- On uniform straight runs, retain a buttress every third two-unit segment, determined by the varying logical coordinate rather than array order or ID.
- Use level-specific span heights `.95`, `1.15`, `1.35`, `1.45`, `1.55`. The highest cap stays below the existing upright post top, `1.625` units above its foot.
- Replace the existing fourth thin top stripe with an upright cap on the long visible face, using the existing top material. Keep four quads per span.
- Both village and combat continue using the same rendering function. No ordinary layer rises above foliage; selection retains its existing foreground layer.

## Unchanged gameplay

Wall IDs, paid positions, two-unit footprints, exact contacts, lower-endpoint-tier shared spans, HP, damage states, broken gaps, purchases, upgrades, simulation, controls, progression and server authority remain unchanged. No package, service, environment setting, database or deployment change.

## Acceptance and tests first

- [ ] All five tiers have the fixed independent horizontal/vertical expected coordinates, proper atlas UVs and unchanged index/quad counts.
- [ ] A selected non-buttress middle segment displays its actual tier post.
- [ ] Sparse buttresses and full corner/branch/mixed/damaged posts remain deterministic after reorder.
- [ ] A broken segment opens both real joins and retains only its ruin at that position.
- [ ] Existing fallback hashes, ground feet, ordering, nonmutation and resource lifetime assertions still pass.
- [ ] Relevant pure tests and build run with exact results; actual desktop/phone and level/state screenshots are captured by the coordinator.
- [ ] Responsible human explain-back and a different human's review remain required before readiness or merge.

## Responsibility and limits

Responsible teammate: **Johannes Franz Lang (`frcola`)**. One isolated coding agent owns this branch; an independent agent may review. Suggested human reviewer: Nicolas Radomski for rendering. Source appearance, physical devices, Safari, performance and final visual acceptance require their own evidence. No agent merge.

## Explain-back

The drawing reads each wall's real position and tier. It draws a continuous span only for a real full-side contact, and uses the lower tier where different levels meet. Most straight segments stay simple, while regular buttresses and the selected segment show the existing detailed post. Heights and trim change only the picture; they do not change what blocks a boarder.

Questions: Why use coordinates for buttresses? Why keep the lower tier on a shared span? Why does a broken wall remove its adjacent joins rather than merely change color?
