# CF1 Captain combat feedback

What this is: contextual weapon range, visual shot feedback and urgent battle warnings.
Who uses it: Ianno, the frontend implementation agent and the human reviewer.

- Status: implemented and scoped checks verified; all three explain-back questions and Ianno manual review completed; PR publication explicitly authorized on 18 November 2026; independent human peer review pending.
- Responsible teammate: Ianno (`Iannomh123456`); agent assistance: Codex.
- Task: [#453](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/453).
- Branch: `feat/captain-combat-feedback`, from main `48aee0e7`.
- Parallel helper branch: `feat/captain-danger-feedback`; one writer per worktree.

## Goal and agreed behavior

The player could not tell whether firing helped or an enemy was beyond reach.
On 18 November 2026 Ianno chose a contextual range display, warnings for both
captain and heart, and visual warnings with a brief sound when effects are enabled.

Show current weapon reach while the fire button is hovered, focused or held and
briefly after a firing attempt, including refused attempts. The ring follows the
captain, uses `captainStats()` and fades after release. A contextual slash shows
melee reach. State whether the target is beyond reach, the weapon is reloading,
or a shot was fired. Per Ianno's visual review, use quiet broken parchment arcs
with a short direction cap at the true range boundary. Remove the written Hit
and damage confirmation: the existing bullet arrival and impact flash convey shots.
Bomb reach means landing distance; blast and rifle pierce can extend beyond it.

Prioritize one actionable warning from current enemy targeting or fresh captain
and heart damage. Pair its words with a marker pointing toward the danger.
Limit warning sounds globally; repeated frames must not repeat announcements.
Ianno's final audio rule is one sound attempt per continuous warning episode,
followed by visuals only. Track captain and heart separately so changes in
priority, wording or critical HP cannot repeat an ongoing warning. Observing
that threat clear during active play starts a new episode when it returns.
Temporarily hiding feedback or unmuting audio does not restart an episode.
The audio cue's existing six-second guard only suppresses rapid new episodes;
it never schedules another sound for the same episode.
Hide combat feedback during menus, countdown, falling, finishers, catch-up,
after wave end and on island changes. Reduced motion keeps static information.

## Scope and contracts

Frontend presentation only: controller, HUD, a small range/marker renderer,
pure feedback helpers, existing audio cues, tests and player documentation.
No attack eligibility, simulation, damage, balance, money, server, network or
recovery contract changes; no dependency. Existing commands are documented in
[ENGINEERING](../docs/ENGINEERING.md#3-commands).

The controller passes optional `combatFeedback` to its renderer, and calls
optional HUD `rangeFeedback` and `danger` methods. A HUD `onRangePreview`
callback reports hover/focus intent. These are internal presentation interfaces.
The danger helper consumes only the existing fresh-event stream and current
state; predicted cosmetic effects never confirm damage or trigger warnings.

## Acceptance and verification plan

- Write failing tests first for range lifetime, exact weapon/skill boundaries,
  rejected attempts, reload, preserved visual impact events, contextual melee and cleanup.
- Check actual gaps, exact arc/cap radius, direction before flat projection,
  hidden/expired caps, and the absence of written damage feedback.
- Test danger priority, teammate distinction, source direction, expiry, inactive
  transitions and sound cooldown; verify effects mute and reduced motion.
- Run the full frontend tests and build, budget/text checks and applicable
  accessibility/overlap/browser checks. Report exact failures and limits.
- Capture the actual local fake game at 1280×720 and 375×812 before/after;
  identify fixtures separately and inspect the images.
- Independently review the complete diff. Update player help and evidence.

## Handover and publication

Prepare a plain-English code walkthrough and ask three explain-back questions,
one at a time. Ianno manually reviews and explicitly confirms publication before
a pull request is opened, as requested in the established workflow. No agent
merge, main edits or deployment. Verification results will be recorded in
`docs/evidence/CF1-captain-combat-feedback/README.md`.

Publication gate completed: Ianno stated "i reviewed, open PR" on 18 November 2026. Task #453 records the PR link and current peer-review state. No merge authorization was given.


## Current-main integration for PR #475

Main `37eb70fa` introduced D064's shared ground projection, native combat HUD updates, wall connections and renderer pooling after CF1's original base. Use `projectGround`, `projectGroundVector` and cached `groundShapeMatrix()` for all range origins, arc/cap transforms and danger directions. Tests invert actual transformed geometry back to logical XZ to verify true range. The danger row spans the new HUD grid. Preserve all newer main renderer, HUD, input and performance changes. CF1's decision is now D068 because main already owns D061–D065. PR #475 remains unmerged; the integration changes and refreshed screenshots require current human peer review.

Latest publication refresh includes main through `db573347` (WebP art shipping). Screenshot source is `29736a89`; landscape control-column follow-up `21440b26` reserves room for expanded range feedback beside real toasts. Scoped follow-up: 11 layout tests, 13 art/overlay tests, 14 native game checks and 21 overlap checks pass; build/spoiler/budget pass. These overlapping checks do not represent a fresh full-suite run. PR #475 is open and awaits current independent human peer review.

Visibility refinement requested by Ianno: strengthen the parchment arcs slightly over textured terrain by increasing inward stroke width, warm brightness and backing contrast. Preserve exact range, sparse gaps, timing and warning audio. Runtime `203c696a`; fresh desktop/phone evidence is under `docs/evidence/CF1-captain-combat-feedback/visibility/`. Existing PR #475 receives this refinement.

Multiplayer ownership requirement: each browser shows range only for its own captain, from its local position and weapon/skills. Remote room/presence/journal events cannot reveal or move range. Existing behavior already follows this rule; `a93b140f` adds connected host/visitor and recovery regression tests (31 tests across six files pass), plus no fallback to a remote figure if the local position is absent. No new build/browser/full-suite/live-multiplayer proof is claimed for this test/comment-only follow-up.
