# COC-02: fit the current base in village management

**Status:** implemented as a small draft slice for review; depends on the village
management state introduced by PR #192. This is not the complete COC-02 editor
camera: independent panning, pinch zoom and layout presets remain separate work.
**Owner:** Johannes Franz Lang (@frcola). **Task:** #143. No merge authorization.

## Player problem

COC-49 stops captain movement while buildings are managed. The exploration camera
normally follows that captain and only zooms between 1 and 2. On a 375-pixel phone,
most of the island can therefore be outside the viewport with no way to walk
closer. Remote picking alone does not make the whole base reachable.

This slice frames the current whole home island when management is active. It
returns to the captain and the player's previous exploration zoom on exit.

## Boundaries

- `game.js` reads the optional `island.managing` getter and disables the request
  while a wave controller is active, including its local result break. On main
  without PR #192, the missing getter is false.
- `player/camera.js` owns the camera position and zoom. `setVillageView(bool)` is
  a local display request, not a server command or a wave pause.
- `villageFrame()` reads today's existing `home_islet` radii from `surfaces.js`.
  It includes the existing wavy coast and space for buildings and screen UI.
- The game measures the visible management/move bar and phone quest strip when
  the layout key changes. Caption-height changes, resize, quest content/folding
  and entering placement invalidate that key. The active bar's text and classes
  also invalidate it: a wrapped refusal must not keep the previous short bar's
  inset while placement stays active. The camera fits and centers the
  base in the remaining vertical viewport rather than behind these overlays.
- Reading the existing inline caption-height signal and canvas dimensions avoids
  measuring DOM rectangles every frame. No resize observer or new global UI
  service is introduced.
- No positions, footprints, coins, upgrades, HP, wave state or ownership change.
- No use or mutation of `battleZoom`, `battleFocus` or tutorial `tour` as a
  village control. Existing combat zoom and valid tutorial focus take precedence.
- This is explicitly for the current static island. A later COC-20/25 land
  geometry implementation must provide its accepted bounds before this view
  claims to frame newly acquired land.

## State and timing

| State | Camera behavior |
|---|---|
| Explore | Existing captain follow and saved exploration zoom |
| Manage on own island | Center and fit current base; preserve exploration zoom |
| Manage with valid tutorial focus | Existing tutorial focus takes precedence |
| Wave / combat zoom | Existing battle camera takes precedence |
| Exit management | Return to captain follow and prior exploration zoom |
| Travel / setPlace | Clear the local overview request; normal arrival framing |
| Paused camera / invalid delta | No movement or zoom update |

Normal motion eases into the frame. Reduced motion snaps directly, matching the
existing camera's preference. The fit is recalculated after a viewport resize.
Wheel input does not alter exploration zoom while this fixed overview owns the
view. The existing input end-of-frame handling clears that wheel delta normally.

## Acceptance evidence

- The actual current coastline's sampled land cells fit inside both 1280 × 720
  and 375 × 812 camera views, with a separate tall-building check.
- Land cells and the tall-building point also fit between measured UI insets.
- A recorded long client refusal grows the same active Move bar; the fit updates
  before that bar can cover the southern land. The probe restores the client
  adapter and cancels the uncommitted move without a server write.
- Entering the view leaves the captain position unchanged.
- Exiting restores the prior exploration zoom and follow position.
- Combat and tutorial requests still work and are not overwritten.
- A resize recomputes the fit; travel does not carry management framing over.
- Reduced motion, ordinary easing, pause and invalid deltas have explicit tests.

The unit test updates the camera world matrix before projecting cells because
the actual Three.js renderer does the same before drawing. The initial test run
omitted that renderer step and failed a projected-coordinate assertion; the
fixture was corrected without loosening the screen-bound assertions.

## Verification record

Executed on this branch after the overlay-aware follow-up:

```text
npx vitest run tests/player/village-camera.test.js --maxWorkers=1
Test Files  1 passed (1)
Tests       8 passed (8)
Duration    516ms
```

Combined game screenshots are recorded in `docs/evidence/COC-02/README.md`.
Build, budget and broader regression results are recorded there after they run;
they must not be inferred from the eight unit tests. Safari, production, physical
phones and future expanded land are not verified by this branch.

## Explain-back

The existing camera already owns following and zooming, so I added one explicit
display request there. Management asks for an overview; it does not move the
captain or pretend that a battle has started. The normal zoom stays saved in its
existing variable while management is active. The measured overlay area keeps
the map clear of captions and the management bar. The first version uses today's
island surface bounds. Later I could accept versioned land bounds and add an
independent pan controller without changing the money or combat rules.

Walkthrough questions:

1. Why does freezing the captain make a separate view necessary on a phone?
2. Which state takes precedence if combat zoom and management are both requested?
3. What must change here when the island can actually grow?

## Review and release

The PR remains a draft and references the still-open parent task. PR #192 is a
runtime dependency for the menu entry and managing state. A combined preview is
evidence for their interaction, not a merge into main. Johannes reviews the code
and screenshots, then a different human teammate reviews according to the team
rules. No activation, deployment or merge is authorized by this document.
