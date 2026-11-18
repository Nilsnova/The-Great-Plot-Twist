# VIS62: wall clearance around existing scenery

Responsible human: **Johannes Franz Lang (`frcola`)**.
Issue: [#439](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/439).
Branch: `fix/vis-62-scenery-clearance`.
Base: `1bce43099cc4e78781faa0b74051d331bfe85e24`, the current-main-preserving review.

## Agreed scope

Reject future explicit wall placements whose paid footprint intersects an existing
tree trunk or a fixed prop's ground reserve. Keep the client preview, local fake
transactions and trusted Python quote/move validation consistent. Existing paid
coordinates, reads, receipts, legacy settlement, route admission, physical
colliders and combat remain unchanged. No SQL, live migration, deployment or new
dependency is required.

The original 102-piece fixture contains nine wall/tree intersections. It remains
historical evidence. The coordinator owns a separately named obstacle-aware
review fixture and actual before/after browser captures.

## Verification status

Claimed before implementation. Focused red/green checks and exact results will be
recorded here. No implementation or passing result is claimed yet. This PR stays
Draft; human explain-back and a different human's review remain required.
