# WALL-03: bounded perimeter-wall catalogue and recognition

Responsible human: Johannes Franz Lang (`frcola`). Draft implementation authorized on 17 November 2026 by the request for walls around the buildable island perimeter. Tracks [WALL-03 #244](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/244). No merge, migration application or live activation.

## Scope and plan

1. Preserve the existing 22 legacy spots and D060 tower behavior.
2. Add a pure catalogue adapter for the trusted capacity selected by the service: 12 legacy or 128 perimeter walls, reusing wall rules/prices/unlocks.
3. Keep added IDs inventory-only: no unpaid world positions or fallbacks to `(0,0)`.
4. Read the complete bounded whole-island building set and refuse overflow rather than silently truncate it.
5. Recognize only exact stable IDs `wall_1` through `wall_128` in the browser; show added pieces only from built, positioned authoritative answer rows.
6. Exercise identity boundaries, missing coordinates, legacy behavior, complete reads and overflow; hand over exact checks and limits.

Likely implementation files: `backend/server/island/catalogue.py`, `backend/server/island/store.py`, `frontend/src/island/spots.js`, new `frontend/src/island/wall-cohort.js`, and focused backend/frontend tests. The layout writer owns shared Python identity constants; service/policy/placement/recovery/SQL and builder controls are separate tasks.

## Evidence and limits

Read-only measurement found a 102-piece edge-sharing coast-following ring on current land, clear of fixed keep-outs and all default non-wall sites including D060. A bounded 128 pieces leaves 26 for compartments. Fixed shoreline services may lie outside the inset enclosure; no claim encloses every protected coastal object. The ring needs actual persisted construction and combat evidence in the integration gate.

This slice does not enable the policy, sell new pieces, apply migrations, change geometry/health/economy, create reserved empty sites or implement the complete builder. Invalid IDs, wrong types, missing positions and over-capacity reads must fail or remain absent safely. Proposed free-grid rules must not relocate paid old walls on read.
