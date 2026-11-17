# VIS-35: existing core and progress landmarks

For Johannes Franz Lang (`frcola`), assisted by the building-art writer. Tracks
[issue #364](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/364), starting
from material checkpoint `cd6dc2e77218762ba512d147a860f9228aed85d6`.

## Approved scope

The actual desktop/phone stage-one images show that an empty central heart,
oversized flat record/statue symbols and bright planning strips still prevent the
approved village composition. Restyle those existing displays. No headquarters
entity, purchase, progression, price, resource, collider or target is added.

The existing heart remains at `HEART={x:0,z:2}`, with unchanged 4×4 placement
keep-out and existing passability. Its visible landmark is an open-front navy and
gold pavilion, so the artwork does not imply a closed wall across a walkable
target. Core frames use approved presentation 128×128/anchor12 and common native
fit bounds across intact/damaged/ruin looks. The ordinary cabin remains separate.

## State and ownership plan

1. Claim Draft before source changes and retain separate clones/branches.
2. Generate original core and smaller progress-landmark assets; measure complete
   native rectangles, feet, transparency and shared state-scale bounds.
3. Implement a separate core decoration with `setHealth`, context reset,
   `retryArt` and idempotent disposal. The shared VIS-32 provider supplies art.
4. Read actual controller `islandHp/maxIslandHp`, immediately after island event
   batches and on the existing 250ms display poll. The narrator's threshold-only
   `heart_changed` event is not a complete health source.
5. Bind snapshots to the accepted wave and captured island context/epoch; ignore
   late old-wave/context/tick state. Accepted zero remains rubble until a new
   accepted wave or genuine reset/context change. Never write HP to the sim.
6. Keep real best-wave/rank and milestone stages in smaller wood/brass/nautical
   displays; draw actual numbers, never bake a concept's score into the asset.
7. Hide obsolete D056 strips for trusted perimeter policy1 and redundant large
   idle heart/planning graphics while managing, retaining live guidance/settings.
8. Run actual state/lifetime checks and obtain new complete desktop/phone game
   captures before any visual-acceptance claim.

VIS-34 owns projection conversions in `island/decorations.js` and
`pirates/battle-guide.js`; this writer changes artwork/size and presentation only.
New decoration feet use the existing `world/art.js` projection compatibility
alias. VIS-18 owns `island/world.js` loading/retry; the core uses a separate task
channel and no static fixed-frame tracker. Root reserves the small core-context
and health-forwarding hunks in `island/index.js` and `pirates/game-wiring.js`.

## Acceptance boundaries

- All real target coordinates, AI/pathing, paid layout, collision and player
  passability remain unchanged.
- Valid partial and zero HP select truthful art; missing/malformed/late snapshots
  cannot invent healing or show another island's damage.
- Registered asset failure is explicit/retryable; disposal ignores late work and
  releases owned textures/materials without a stale scene write.
- Record numbers/ranks and statue thresholds stay authoritative, including reset.
- Generated sources are supplementary; actual 1280×720 and 375×812 scenes decide
  the next quality checkpoint. No Chrome/full suite until coordinator allocation.

No dependency, account/service, environment edit, backend/migration, production
activation, main/force push, deployment or merge is authorized. Keep Draft for
Johannes's explain-back and independent human review.
