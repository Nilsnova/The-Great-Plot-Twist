# VIS54: Home-island tree clearance

Responsible teammate: Johannes Franz Lang (`frcola`). Issue [#422](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/422).

## Problem and intended behavior

The shaded tree drawings are about five world units wide. Existing house progress
can enlarge them by another 20%, obscuring several two-unit wall cells. Make the
home-island foliage more restrained so the outer perimeter and inner defenses are
easier to read, while keeping the game behavior the team has already playtested.

Use a uniform 0.70 visual baseline for home-island trees only. The existing house
growth remains multiplicative: 0.70 with no houses, 0.77 with one and 0.84 with
two. Keep each tree's exact ground point, collider radius of 0.48, material, wind,
player fade and painter order. Other destinations retain their existing scale.

## Scope and review boundary

- Runtime: `frontend/src/world/places/settlement.js`; a home-only visual scale at
  tree creation, before progress captures each mesh's original scale.
- Tests: real Three.js place construction and the existing progress decorator,
  without a browser, network account or new dependency.
- No changes to legal placement, saved positions, walls, controls, prices,
  progression, combat, collision rules, terrain ownership or production settings.
- Stacked on `chore/vis-57-playtest-base` at `6c87b8dc`, which reconciles the prior
  visual review build with current main. This component is reviewed against that
  base rather than duplicating the entire visual programme in its diff.

## Evidence required

1. A red regression run on the unchanged base, then a green focused run after the
   scale change.
2. All home tree feet, render orders and colliders match the original scene data;
   other places retain their original tree scale.
3. Actual progress applies and removes zero/one/two-house growth without changing
   blockers; disposal restores the smaller baseline and keeps lifetime ownership.
4. Existing placement, wall topology and selection tests retain their assertions.
5. Coordinator captures at 1280x720 and 375x812 compare actual wall sightlines,
   including the house-growth states. These native captures and composed-build
   checks are separate from this agent's pure tests and remain pending here.

## Explain-back

"I reduced the size of the tree pictures on our home island. The trees still stand
at the same places and block the same small circles, so walking and building rules
do not change. Houses still make trees a little larger, but they now grow from a
smaller starting size. I kept the existing wind and player fading because the
change only sets each mesh's initial visual scale."

Limits: this does not remove every possible canopy overlap or move trees outside a
player's chosen wall layout. Actual screenshots must confirm the scale still looks
lush. Keep Draft until Johannes understands the change and another human reviews
the current revision. No merge or rollout is part of this task.
