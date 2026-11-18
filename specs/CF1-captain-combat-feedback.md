# CF1 Captain combat feedback

What this is: contextual weapon range, visual shot feedback and urgent battle warnings.
Who uses it: Ianno, the frontend implementation agent and the human reviewer.

- Status: implemented and scoped checks verified; manual review, explain-back and publication confirmation pending.
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
