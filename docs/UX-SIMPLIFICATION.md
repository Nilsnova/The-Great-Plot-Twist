# Simpler, more visual game · 6 Nov 2026

Owner: Nils with Codex. This is the execution plan for Nils's screenshot feedback.
G9 is still being built in its separate cloud session. Its checkpoint remains the integration
gate for normal browser multiplayer and cloud saves; the redesign must keep that seam intact.
The AI companion is cancelled and removed separately.

## Player experience

1. **Start with the world.** Rich original coastal art, one short premise and clear Play,
   Continue and Play with friends entries. Explain connection availability in one sentence.
2. **One passage at a time.** A compact dialogue box replaces its previous passage. Advance
   or show the full current passage; old notes, inventory and history live behind Journal.
   Keep the existing story actions/save/referee valid while simplifying their presentation.
3. **Enter a place.** Crossing a house doorway opens an opaque full-screen interior with its
   own floor, objects, explorer and exit. Story interaction opens over that room. Closing
   restores a safe outside position; existing server place/hotspot IDs remain valid.
4. **One clear goal.** Collapse secondary case pages into a Journal menu. Present light
   challenges as a stable chart and clear numbered light stations with a single active step.
   Do not show a long row of every future mechanic or resize the modal on every update.
5. **Quiet controls.** Hide the keyboard guide by default; one labelled toggle opens it.
   Keep a compact location/status header and a few actions with no overlapping boxes.
6. **Responsive movement.** Remove quantized player/camera motion, preserve fast input
   response and collision safety, and render at a materially denser framebuffer.
7. **Real visual detail.** New original title artwork and higher-density hero/building/tree/
   terrain textures add actual detail while retaining logical geometry and sensible budgets.

## Work and integration

Separate worktrees own dialogue, HUD/start, interiors, motion/rendering, original art and AI
removal. The coordinator owns game wiring, case/challenge layouts, integration and proof.
Sports configuration/verification proceeds independently with Nils's supplied provider key.
No task rewrites applied SQL or changes Relighting. No demo stand-in is described as live play.

The first scene keeps its existing meaningful story and rewards. Simplification removes the
simultaneous wall of prose, repeated headings and advanced controls; it does not silently
change the mystery solution or award progress from the browser.

## Release evidence

- Same-position before/after title, world, dialogue, interior and light-panel captures.
- No horizontal/body overflow at 320/375px phone or 1280×720 desktop. Dialogs retain usable
  controls at short heights and browser zoom; text and buttons stay readable.
- Dialogue paging/choices, save restoration, keyboard/touch/gamepad, focus/Escape and disposal.
- Stable challenge bounds across off/preparation/night/locked/success states.
- Actual framebuffer dimensions and motion measurements; no larger-sprite geometry mistake.
- Production build, spoiler guard, relevant integration/regression checks and independent review.
- Reviewed code pushed and production build identity/health/config verified after deployment.

High-detail art may need a reviewed image-transfer budget above the previous 40 kB title
thumbnail ceiling. This does not justify removing JavaScript/CSS or runtime memory checks.
The result is judged visually at the same camera position as well as by measured pixel counts.
