# VIS66: clear the western wall corridor

Bounded scenery layout follow-up for Johannes Franz Lang (`frcola`); used by the visual review coordinator and peer reviewer. Tracks [issue #448](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/448).

## Agreed scope

Move the existing decorative home-island barrel from `(-12, 7)` to `(-10.5, 8)` and update its matching prospective wall reserve in the client and server data. The barrel has no collider, saved position or interaction zone. All other scenery/reserves, tree blockers, KEEP_OUT, routing, legacy settlement and paid wall positions remain unchanged.

This task is stacked on VIS61 review source `81404e2b`. It creates room for a correctly validated two-unit wall corridor between the wreck and cabin; it does not move paid walls or modify historical ring evidence.

## Status

Claim only. Implementation and exact checks are pending. Root owns the new valid ring and actual screenshots; this writer will not launch Chrome. All work remains Draft for human review; no merge, deployment, live SQL or new dependency.
