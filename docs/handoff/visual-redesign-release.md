# Visual simplification release · 6 Nov 2026

For Nils, branch `integrate/visual-simplification`. This responds to the screenshot playtest;
G9 continues independently and is not merged or activated by this release.

## Changed

- Original detailed coastal title, freshly drawn island sprites at four times the linear texture
  resolution, and 4096×3072 terrain. Logical sprite sizes, feet anchors and world IDs are preserved.
- Continuous player/camera motion and smoothly changing zoom, immediate input release, bounded
  collision steps, and one consistent input blocker for dialogs, travel and rooms.
- Opaque full-screen cottage, boathouse and opened lighthouse scenes. Walking across a doorway
  enters the room; inspection retains the existing story interaction IDs. Exits restore safe
  outside coordinates. The detailed explorer poses are shared with the outdoor world.
- Short replacing story passages, smaller action batches and optional Journal history/inventory.
  Original actions, legal paths, endings, replay saves and the arrival slot remain intact.
- A compact HUD, Controls and Journal closed by default, a simpler title and an honest Friends
  entry. Normal browser online play is still unavailable until G9 is integrated and verified.
- A fixed case frame, compact navigation, detailed coastal chart/compass and one selected light's
  controls. Server answers still decide locks, progress and reveals. Near-north rounding stays
  within 0–359°, and a rejected aim preserves the player's local angle.
- The canceled AI companion is already removed on main `364d178`. Football activation is already
  live and independently proven; see [sports evidence](sports-live-activation.md).

## Verified

The complete integrated frontend suite passed **1,859 tests /133 files**, including the final
detailed room character and adaptive-density/reset checks. Focused actual WebGL and browser
checks also pass. A final browser-denied-gamepad fix passed all seven room DOM tests; keyboard
and touch remain usable if that optional browser API throws.

- Both original endings, physical room inspection, exact interaction payloads, optional Journal,
  locked choices and reload through the disposable real public story API.
- Title → truthful Friends → new game → room/story → outside → pause/movement → doorway → title,
  with desktop, 320/375px phones and short landscape bounds.
- 62 whole-world checks, including ten round trips with unchanged resources, 31 FPS in the final
  sample, reduced-motion travel and the ordinary wind-driven passage. The graphics gate uses a
  recorded fictional sports board; the separate live proof verifies the real provider.
- 151 case-browser assertions across all pages and preparation/night/dawn/success states, four
  selectable light posts, refusal behavior and native keyboard aiming.
- Original-art decoding/gallery, no external asset requests, clean browser/CSP behavior, title
  loading and production-only travel. Demo skip/cancel proof covers all nine tour steps; its full
  three-minute timed run is not repeated for this release.
- Independent code/visual review. It found and prompted fixes for demo travel blocking, room
  entry/Escape, landscape header overlap, Journal Escape, title layering and reduced-motion resume.
- Production build/spoiler guard and unchanged cold-title budgets: **20,909 B JavaScript,
  11,908 B CSS**. The original title is **274,026 B**, below its reviewed 350,000 B image ceiling.
  No dependency, database migration, cron or workflow change.

## Rendering evidence and limits

At 1280×720, full density contains 921,600 real framebuffer pixels, versus the previous 102,240
(about nine times as many). The new artwork adds actual detail; the full detailed kit is about
56.7 MiB decoded and 491 KB compressed. The title is separate. Draw-call/resource counts remain
97 calls, 27 uploaded textures and 96 geometries in the sampled cottage view.

A serial headless software-renderer comparison exposed fixed-full-density slowdown: about 15 FPS.
Adaptive density, sampled only during active outdoor drawing, brought that environment to about
30 FPS after calibration. It keeps full density on capable devices, reduces backing pixels on
sustained slow frames without changing CSS size or world framing, and avoids rapid recovery
oscillation. Texture detail remains available at every scale. This is a cloud observation, not
an assertion of 60 FPS on physical devices.

The art-only comparison keeps an identical camera. The integrated before/after captures keep the
same player position, viewport and zoom; the redesigned renderer uses a stable 20-world-unit
view height instead of the older desktop's 15. These comparisons must not be conflated.

Selected before/after evidence is under `frontend/captures/visual-review/`; component evidence and
implementation details are linked from [the execution plan](../UX-SIMPLIFICATION.md) and the
individual redesign handoffs.

## G9 merge seams and remaining

- Preserve `game.js`'s narrow `worldBlocked` predicate separately from the broader player/input
  blocker: the highlights tour must still travel while `demo.active` is true.
- Preserve `intro.onSceneChange` and `intro.closeJournal`, room lifetime/input handling and
  `graphics.sampleFrame`. The existing `intro.begin/open/setArrival` and case adapter seam remain.
- Wire the title's optional `onPlayFriends` only when the real account/crew flow is ready. The
  current fallback must not claim connected multiplayer or cloud saves.
- Preserve the main branch's current server contracts, strict CSP, build bindings, canceled AI
  scope and 21,080 B/12,000 B title JavaScript/CSS ceilings. The published G9 `b973113` is a partial
  adapter-core/cloud handoff, not completed sign-in or checkpoint 1.
- After G9: verify real sign-in, cloud-save conflict/reload, solo+NPC and four-player browser
  journeys, presence/reconnect and authoritative rewards. Keep `sign_in` off until those gates.
- Interiors currently retain their parent server place IDs and render the local captain. G9 must
  verify room context and visible indoor co-op before that behavior is claimed.
- Physical laptop/phone/gamepad, listening balance and projector rehearsal remain. No new provider
  key, AI approval or routine merge permission is needed from Nils.

Before rollout the rollback target is healthy `dpl_4HmGdZCJrhgKS8DWF2qUN7eMAhPj`. Production must
report the pushed merge SHA, serve the exact detailed assets, and pass queryless health/config/
sports checks. Eight approved flags remain enabled; `RELIGHT_OPEN` stays unset and
`STOCK_API_PROVIDER` remains `finnhub`.
