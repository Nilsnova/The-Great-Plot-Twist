# VIS-14: dimensional connected walls

For Johannes Franz Lang (`frcola`), assisted by the wall-art agent. Issue [#219](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/219). This implementation builds on the approved perimeter candidate `9dc1bea505fe3b26bd56d6ad02c21a2db8bd8be9` and current main `8759fc80`; it remains unmerged.

## Approved direction

The user rejected the flat-painter trial and approved richly shaded desktop, wall-selection and phone concepts on 17 November. Walls must read as continuous timber or masonry, with visible top/front faces and stronger corners/posts. Their artwork must remain consistent in exploration and frozen combat. Generated artwork alone is not runtime acceptance.

## Scope

- Original transparent wall artwork and `src/art/village/walls.js` family data.
- Dedicated wall-material/geometry helpers, plus the existing exploration/combat wall presentation hooks.
- Preserve levels 1–5, authoritative positions, the 2×2 footprint, actual standing-neighbor topology, health, repair, upgrade and breach rules.
- Preserve logical wall-link diagnostics and painter-layer batching from WALL-23/45. No new gates, colliders, IDs, prices or land.
- Shared raster loading belongs to VIS-32; coordinate that interface before integrating. Root owns the explicit world-art policy exception and cold-title protection.

## Plan

1. Claim this draft and inspect the shared frame/geometry contracts.
2. Generate original shaded timber, stone and gold-capped wall materials from the approved reference.
3. Register bounded source rectangles and stable logical frame/foot metadata.
4. Render thick spans and posts using actual cardinal contacts, including ends/corners/T/mixed-level cases.
5. Preserve true damaged/broken appearance and exploration/combat phase handoff.
6. Run meaningful topology, buffer, state and lifetime tests; record exact results.
7. Coordinate actual 1280×720 and 375×812 captures on the integrated candidate.
8. Document source provenance, explain-back and remaining acceptance; keep Draft.

## Acceptance

- [ ] Original high-quality materials genuinely appear in runtime, not merely in a generated sheet.
- [ ] Five levels have a stable identity and a consistent foot; decoded pixel dimensions do not change paid geometry.
- [ ] Real cardinal contacts alone create spans; partial/diagonal contacts and broken walls stay open.
- [ ] Mixed-level spans use the weaker level; end/corner posts remain readable.
- [ ] World and combat use the same material family and accepted state; repair restores it without inventing health.
- [ ] Batched painter ordering, exact link diagnostics, disposal and failure paths remain meaningful.
- [ ] Required actual desktop/phone before/after screenshots and exact tests are recorded.
- [ ] Rendering budgets remain unchanged; no claim that the under-150 target passes without measurement.

## Risks and limits

A thicker silhouette can obscure a captain or shift perceived ground contact. Baked lighting must match the village. New textures increase decode/atlas memory, so source resolution and logical geometry must be separate. The loader, art metrics and world/combat names must be integrated together. No browser checks have run at claim time. No package, service, `.env`, live migration, production flag or deployment change is authorized.

## Explain-back

1. Which authoritative rule decides whether two walls share a visual span?
2. Why does a thicker rendered wall not increase its collision footprint or breach cost?
3. How do world, combat and repair preserve the same wall identity and honest opening?
