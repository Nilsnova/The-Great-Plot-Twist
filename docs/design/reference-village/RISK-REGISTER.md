# Failure and decision register

For the proposed reference-village plan. These risks were pressure-tested against current source by separate renderer/UI, gameplay and transaction reviews. This is a planning register, not proof that the unimplemented features pass.

| Risk / decision | Required failure case or evidence | Owner |
|---|---|---|
| Accepted walls snap back to lanes on read | Effective legacy versus raw positions, new off-lane save/read/reload/next-wave exactness; trusted carrier distinct from current layout-version numbers | WALL-01/06/07/08 |
| Placement and continuous movement disagree | Integer/half-grid shifts, shared edges/corners, open and closed gaps, coast and occupied-footprint egress | WALL-13/15/17 |
| Coast and empty-site semantics are assumed | Current center-on-land behavior is explicit; stricter support is reviewed. Unbuilt reservations or inventory-only mode matches client/server and protects legacy/default build routes | WALL-01/05/06/08/12 |
| Capacity is increased only in the UI | Complete whole-island reads, admitted-ID constraints, 26-entry vector bound, first new ID before a new wave, exact defaults/current positions | WALL-02/03/19/20/21/22 |
| Batch identity collides with piece/refund identity | Maximum-length UID, distinct per-piece refs and ID-position pairing, existing UNIQUE/payment constraints, per-payer per-level refund | WALL-05/10/12/21 |
| Old receipt discloses or reapplies state | Ex-member/cross-island retry, same UID/different intent, reset/demolition/rebuild, lost reply and current state returned separately | WALL-05/10/12/24 |
| Upgrade grants an implicit repair | Correct selected protocol, V1 needs_repair versus legacy, per-piece discount rounding, no refundable repair spending | WALL-09/10/11 |
| A move applies future healing retroactively | Controlled DB instant, old effective coordinates/rate first, new Workshop rate for future time only; refusal permits legitimate baseline time settlement | WALL-06/07/12 |
| Active combat rereads a mutable village | Accepted frozen positions/instances/maxHP, pending changes and reconnect, unsupported combinations fail explicitly | WALL-14 |
| Art seals a real gap or traps an occupant | Actual 0-to-positive barrier state, ordered accepted repair only, normal entry versus explicit already-inside egress, no invented captain/projectile cover | WALL-17/23 |
| Preview ignores a durability-changing upgrade | Reproduce full-band same-position maxHP/level change, invalidate only cost-relevant guide inputs and retain bounded damage-band caching | WALL-16 |
| Cohort rollback loses paid pieces | Stop new offers after ownership while retaining read/mutation/recovery/snapshot/refund compatibility; no automatic narrow-CHECK downgrade or hidden pieces | WALL-19 and cohort gate |
| Fancy art is unreadable in the actual village | Working zoom/pan versus Fit, quiet/caption/refusal safe area, actual object size, transparent picking and world/atlas handoff | BASE-02, VIS-01/02/04/18/30/31 |
| Late action response overwrites another context | Leave/dispose/reset while pending; original receipt/intent retained, new island/epoch not repainted, no automatic replacement UID | WALL-12/24 |
| Wall work pretends to solve score reset policy | Name current behavior and pending BASE-45; compare versions/spending/seeds without changing ranking or success thresholds | BASE-45, WALL-18/24 |

## What is deliberately not assumed

The target image is not a legality/capacity fixture, a real working pier, a production screenshot or proof of safe transactions. New art does not grant land, money, health, an unlock or universal cover. Runtime assets need an accepted pipeline and budgets. A core twelve-piece wall release does not need expanded cohorts or batch upgrades, but a larger claimed layout requires them.

## Evidence boundary

Root ran 75 existing tests across 6 baseline files and the declared two-size browser fixture. Future scratch SQL, concurrency, migration application, balance, real-device, Safari and production results remain unverified. Every implementation reports its actual commands/source/outcomes, and a different human reviews it before release.
