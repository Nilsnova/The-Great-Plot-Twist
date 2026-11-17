# VIS-19: raised cliff and grass-rim trial

Responsible teammate: Johannes Franz Lang (`frcola`). [VIS-19 #224](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/224). Branch `feat/vis-19-raised-cliffs`, base `569d8fda3474cb84af36af190853d1a0e02b7abf`.

## Approved bounded seam

Johannes authorized the reference-village implementation. The primary agent approved this bounded prototype seam on 17 November; D062 records it. This is permission to implement and measure the trial, not acceptance of final target quality.

The original **walkable top** remains the analytic `surfaces.home_islet` contour (rx20/rz22/seed3), with the same .72 projection, 64×48 backdrop, saved coordinates, placement, selection, collisions, sea lanes and landing rules. Paint a downward decorative rock face first, then overpaint its interior with the unchanged beach/top polygon. Every legal shore building/captain foot therefore stays on the top. The rock face grants no new land, support, collision or range.

Backdrop **decorative alpha** becomes the cliff-body/base silhouette. The existing sea distance field follows it visually, placing foam at the cliff base. Walking/placement do not read that alpha. No second bitmap is allocated: the existing analytic surface is the named walkable-top authority. Correct the misleading ground-header claim that the walker reads backdrop alpha.

Decorative depth is bounded to about 1.4 projected world units, tapered to .35 around each current east/south/west naval/beach approach (approximately ±18 degrees with a soft transition). This avoids covering the nearest south anchors/entry while preserving actual routes. East/west screen-X extent is unchanged. Report the decorative depth to the camera lane and check actual foreground ship/captain/wall feet rather than inferring safety from an asset sheet.

## Plan

1. Add a small deterministic top/base contour and original layered rock painter using existing Canvas helpers.
2. Integrate below the current beach/top and add a clipped grass/soil rim; preserve the original coast and seeded top-detail sequence.
3. Test contour/analytic alignment, bounded extents, approach taper and existing placement/world/lifetime behavior.
4. Run a declared actual-game before/after trial at 1280×720 and 375×812 after the shared browser lane is free.
5. Check real ground alpha/top support, foreground objects and repeated scene lifetime; record quality outcome and remaining limits.

## Verification and risks

A decorative-alpha change is intentional and must never be called island growth. Main risks are misleading apparent walking support, a face covering a legal foot point, shifted foam, approaching ships intersecting the facade, camera clipping and extra retained texture resources. Keep one existing backdrop texture and no new mesh/material lifetime.

The first trial is bounded original code-authored material work. No imported/generated runtime image, new package, new geometry authority, database migration, activation, deployment or merge. Full terrain composition, new pier, land growth and final visual acceptance stay separate.
