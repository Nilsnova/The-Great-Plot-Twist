# VIS-12: approved bell pavilion and watchtower artwork

For Johannes Franz Lang (`frcola`), assisted by the building-art agent. Tracks
[issue #217](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/217) and the
shared VIS-04 presentation decision, on unmerged candidate `9dc1bea5`.

## Scope

Generate one coherent original transparent source for the existing bell pavilion
and three actual watchtower frames: base (also selected at levels 2/3), level 4 and
level 5. Use shaded timber, navy slate, brass/gold, stone foundations and clear
upper-left light. No decorative occupant creates a crew member or new weapon.

Root approved a presentation-only bell box of 56×72/anchor 8; the previous 24×40
box was too small for the approved pavilion. Its existing ground point,
interaction zone, keep-out/collider and wave/input rules remain unchanged.
Watchtower stays 64×128/anchor 8. The shared provider must apply the same logical
metrics, aspect-preserving source-foot alignment and preparation-placeholder normalization in
every renderer. Presentation bounds do not grant land or change collision.

## Plan and owned files

1. Claim a separate Draft before source changes.
2. Generate a4-cell transparent landmark source using the approved style.
3. Inspect complete visible bounds and native ground feet; record unchanged PNG
   bytes and provenance. Rectangles may omit only empty cell margins at runtime.
4. Map existing `island-bell` and watchtower base/l4/l5 identities in
   `frontend/src/art/village/landmarks.js`.
5. Verify source/geometry/selection boundaries, build, budget and text checks.
6. Obtain actual desktop/phone foot, overhang, neighbor and phase evidence in the
   coordinated browser lane.
7. Keep Draft for explain-back and a different human's current-revision review.

VIS-32 owns shared loader/world/combat registration. The coordinator owns the
explicit visual-metrics policy and integration. Do not edit those shared hooks
from this family branch.

## Acceptance and risks

- Bell remains the real ring-the-bell action; decorative details add no service.
- Watchtower level 2/3 still selects its authoritative base; tier 4 teal and tier 5
  royal-blue/gold-star identity remain legible without adding a new level.
- Feet align exactly, with complete roof, pennant, posts, foundation and shadow.
- The larger bell art clears neighbors and real HUD controls at 1280×720 /375×812.
- Original transparent art is supplementary; actual gameplay decides acceptance.

At claim time no asset, passing application check or runtime evidence is claimed.
No new dependencies, services, environment changes, backend rules, migrations,
production flags, main/force push, deployment or merge belongs to this slice.

Explain back: why the bell's visible box can change while its interaction stays
fixed; which watchtower frame is selected at each real level; and why a registered
image failure rejects clearly while an unprepared synchronous placeholder still
keeps the correct foot.

## Authored-source handoff

The original four-frame source, measured source rectangles and shared data mapping
are implemented. [Source and exact boundary checks](../docs/evidence/VIS-12-landmarks/README.md)
record 2 files / 7 tests passed in 1.32s. Shared provider registration and actual
desktop/phone bell-neighbor/phase evidence remain coordinated work; this source
branch does not claim a standalone live visual switch or final acceptance.
