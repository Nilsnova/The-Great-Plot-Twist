# WALL-01: full-perimeter wall implementation contract

For Johannes Franz Lang (`frcola`), authorized for draft implementation on 17 November 2026. This updates the reference-village target; independent human review and release remain separate. No merge or live migration application is authorized.

## Requested behavior

Players can purchase, place, move and upgrade connected defensive walls around the island's buildable perimeter, and create internal compartments. This is a strategy system using real saved pieces and existing coin/health rules. Walls block hostile boarder entry until breached; they do not prevent naval/projectile attacks or silently change friendly captain collision.

A measured candidate has 102 edge-sharing pieces on the current half-unit grid. The bounded allowance is **128 stable IDs (`wall_1` through `wall_128`)**, leaving room for internal defenses. The measure uses today's center-on-land rule and all fixed keep-outs/default non-wall sites, including D060. Fixed coastal services may remain outside an inset enclosure; movable buildings can be relocated. This does not promise every shoreline object can be enclosed without a coastal/land contract change. The closed ring and an opened-gap variant must be demonstrated using actual placement, save/reload and hostile movement.

## Coordinates, inventory and old saves

- Keep the existing 0.5-unit grid and 2×2 wall footprint. Edge sharing is valid; overlap is not. Keep existing center-on-land semantics and fixed services. Walls are destructible, so a closed ring remains legal; non-wall reachability rules remain.
- Preserve the twelve existing IDs, purchases, levels, payer contributions and effective D056 positions. Admission materializes their effective coordinates before changing interpretation; it does not silently reposition paid walls.
- The additional 116 IDs are inventory, not 116 reserved empty build sites. An added piece gets its position atomically with its paid construction. An unpositioned old single-build route must refuse a new ID before charging. Existing original unbuilt reservations remain compatible.
- Admission is between waves, owner-only, and monotonic. Pausing new offers must retain read/move/recovery/refund support for owned pieces.

## Trusted policy and transport

Persist `island_wall_policy(island_owner, rule_version, capacity)`. Absence means rule 0 / capacity 12. Rule 1 / capacity 128 enables reviewed free-grid placement; existing layout.version 1/2 retains its original stored/fixed meaning. `LayoutOut` adds `wallRuleVersion` and `wallCapacity`; requests cannot grant themselves either value.

`island_wall_layout_read(p_island_owner)` returns `{ruleVersion, capacity, rows:[{plot,x_half,z_half}], islandEpoch}` from one database snapshot. The epoch is a canonical UUID for rule 1; legacy reads may return null. New mutation CAS compares both the expected policy and ordered raw layout rows. Quotes and paid construction additionally bind the exact island epoch, so an identical layout after reset does not make an old quote valid. Malformed/unsupported state fails closed. The migration must precede deploying dependent server paths; a missing new RPC is not permission to present stale coordinates or omit paid pieces.

Admission and moves use the existing owner lock and recovery mutation begin/finish hooks at one database instant. Settle the old effective coordinates/rate first, then change future geometry. Preserve instance IDs, repair sequences and health units. A refused action may materialize ordinary time recovery, but adds no action-induced healing or spending.

## Payments, concurrency and combat

A positioned run validates all selected IDs/cells against one canonical final layout. Bounded batch size, exact identity-position pairing, actual per-piece rounded prices, existing payer permissions/unlocks, distinct per-piece payment references and the existing UID bounds are mandatory. One atomic receipt reconciles lost replies; retries cannot charge twice, disclose private receipts after membership ends or reconstruct a demolished/reset instance. A run contains 1–32 connected cardinal cells, with stable eligible IDs selected by the server. No partial paid chain is accepted. Existing receipts reconcile before checking current offers and return the historical result alongside a fresh current island view; they never recreate historical buildings.

Widen the full selected cohort consistently in catalogue/read bounds, database identity checks, repair/demolition paths, recovery manifests/vectors and first-new-ID/default-position handling. New default-less pieces cannot enter recovery without their authoritative stored coordinate. Frozen wave geometry must include the approved full wall set. Production uses recovery version 1 / wave protocol 2, public snapshot configVersion 2 and start capability wallClientVersion 1. The local fake transport labels its frozen demo separately and does not claim production recovery durability. Arbitrary geometry requires the actual pathing rule; unsupported protocol/rule combinations refuse admission/start clearly rather than fighting an unrelated layout.

Single-wall upgrades retain existing levels 1–5, unlocks, prices and selected recovery eligibility. Batch upgrades remain a separate convenience. Breaches and accepted restoration update both the real barrier and live connection drawing, with the existing already-inside egress exception.

## Execution and proof

Implement small linked drafts: trusted layout rules/transport, cohort and bounded reads, database admission/guard slices, atomic construction, real builder UI, frozen-wave/recovery compatibility, working camera/art prototype, then integrated lifecycle/perimeter checks. One writer per branch in a separate clone; shared hooks have one owner.

Required evidence: authoritative full-ring and gap placement; current-save admission/reload without drift; exact funds/receipts/retries/concurrent stale layout; all selected ID boundaries including the first added wall; upgrade/damage/repair/demolition/reset; actual exterior-boarder breach/gap movement and frozen start/join state; before/after desktop 1280×720 and phone 375×812; applicable focused/full/build/budget/text/browser checks with exact results. Generated target art does not prove these behaviors.
