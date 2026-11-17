# COC-02 camera evidence

This folder records the current-base fit view. Unit evidence is in
[the specification](../../../specs/COC-02-village-overview.md).

**At the initial draft commit:** six unit tests passed. Integrated before/after
screenshots and broader checks are pending. A missing screenshot must not be
reported as a passed visual check.

The comparison will use the real game renderer and the repository's local fake
transport. It will compare COC-49 without the camera slice against COC-49 with
this slice, at 1280 × 720 and 375 × 812. That is a controlled UI fixture, not a
production sign-in or live database claim. No merge is involved.
