# COC-49: optional village management between waves

Status: bounded first implementation requested by Johannes Franz Lang (@frcola),
tracked in [issue #190](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/190).
This is his requested product direction for review, not a recorded agreement by
every teammate. Draft review and a different human's approval remain required.

The first slice adds an explicit **Village mode** entry on the player's own island.
It reuses the current build, upgrade and Move cards. Explore keeps the existing
walk-up rule. While Village mode is active, tapping a distant structure opens its
existing card and the captain does not walk. Other landmarks retain walk-up input.

## Scope and authority

- The mode changes local selection/input only. The existing API decides prices,
  permissions, building limits, phase guards and payment outcomes.
- Entry requires a loaded own island and no accepted wave reservation. It does
  not add visitor rights or pause a server wave/countdown.
- The Menu only offers Manage when the controller's side-effect-free `available`
  query permits entry; an active mode instead offers Exit. Loading, visits and
  busy/reserved waves therefore do not expose an ineffective Manage button.
- The first slice conservatively exits as soon as a start/join request is
  outstanding (`flow.busy`), before an accepted reservation can wait for its
  defended-island preparation read. Entry stays blocked throughout that gap.
  A failed request leaves Explore active; returning to Village mode is an
  explicit choice once no reservation is known. No payment is undone or added.
- A visible Exit action returns to Explore. Escape first closes a card or cancels
  placement, then exits the mode. Existing committed purchases are never undone.
- Travel, visit/game changes, reset and an accepted bell reservation exit the mode
  and cancel its unconfirmed placement. Late responses retain existing controller
  fences; this feature does not invent a new persistent island epoch.
- Text inputs keep their keys. Map tap-to-walk, movement sticks and nearby Use
  prompts are inactive while managing; world picking remains available.
- The management bar sits below the map content, clear of the goals strip. Move
  temporarily replaces it with the existing placement bar; Cancel/Escape returns
  to management. Enter on a focused Cancel button keeps the button's meaning.
  The existing narrator-height variable lifts the bar above captions, so Exit
  remains visible instead of being hidden by narration.

## First-slice limits

No independent editor camera, new catalogue, group placement, undo history,
layout snapshots, new capacities, HP/recovery logic or backend endpoint is added.
COC-02/03/06 remain separate follow-ups. Ianno's T55–T59 draft work is unchanged.

## State and input table

| Context / action | Result | Authority |
|---|---|---|
| Explore, click a distant structure | Existing Walk closer behavior | Existing reach check |
| Own loaded island, no reservation, choose Manage village | Enter; reset held controls; show a visible Exit | Local mode only |
| Managing, click a structure | Open its existing build/upgrade card | Existing card/API checks |
| Managing, choose Move | Existing ghost and Move controller | Existing placement/API checks |
| Arrow key in a text input | Text/cursor keeps the key | Input-target guard |
| Escape with a card or Move open | Close/cancel that layer, stay managing | Existing UI/Move lifecycle |
| Escape with no card or Move | Exit, reset controls | Local mode lifecycle |
| Visiting, island missing, or a reserved wave | Menu entry absent; direct entry refused | Current island/phase context |
| Outstanding start/join, including accepted but preparing | Exit; re-entry refused | Existing flow busy/current state |
| Travel, visit, reset or accepted wave start | Exit and cancel unconfirmed placement | Existing context events |

The `managing` getter is intentionally separate from the island's `active` overlay
getter. `game.js` uses `captainBlocked` for walking, map-touch and Use prompts;
the world's active/picking gate stays available. Treating management as a global
overlay would disable the very building selection this feature adds. The mode
checks its own island code and phase again when read, rather than granting
selection permanently after the initial menu click.

No new transaction is submitted by the mode controller. Existing asynchronous
Move cancellation still discards a late view update after cancel; it cannot undo
a server operation that already committed on the original island.

## Evidence required before completion

1. Controller tests reject unavailable, visiting or reserved contexts and exit
   once on travel/reset/context loss.
2. Browser checks preserve distant walk-up refusal in Explore, allow direct
   structure selection only after entry, and prove that held movement does not
   move the captain while managing.
3. Escape/card/Move cancellation, text focus, menu exit and wave-start exit are
   checked through the existing adapters. No test calls a local mode an authority.
4. Before/after screenshots use 1280 × 720 and 375 × 812. Fake transport captures
   are labelled fake and do not claim live database or Safari verification.
5. Root coordinates the full suite, build, budget, a11y and demo checks; this lane
   reports only its actually executed focused checks.

The reservation regression holds the actual `prepare` read after a successful
start response. Before `ringBell()` settles or `flow.current` is populated, it
checks that management has left, placement is cancelled, the bar is hidden and
both re-entry and remote-only picking are unavailable. Refused pending start and
join requests have separate model/flow coverage; neither automatically resumes
management after failure.

## Explain-back

I separate walking from managing the base. The mode lets me select a distant
building, but it sends the same build and upgrade actions as before. I block only
captain controls, rather than blocking the whole world, so building picking still
works. Leaving the island or starting a wave removes the local mode. A later
camera or catalogue can reuse the mode without changing server authority.

Questions for Johannes before marking the draft ready:

1. Why must managing block captain movement without blocking world picking?
2. Which server checks still decide whether a build or upgrade succeeds?
3. What happens to an unconfirmed placement when a wave reservation is accepted?
