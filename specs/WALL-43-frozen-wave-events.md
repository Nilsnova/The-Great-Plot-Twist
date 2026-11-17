# WALL-43: preserve frozen local waves through the normal bell

For Johannes Franz Lang (`frcola`) and the integration reviewers; tracking [WALL-43 #333](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/333), a child of WALL-00.

The actual normal bell exposed an adapter gap: the fake returns `perimeterDemo`, the API validates it and the controller supports it, but `wave-flow.begin()` reconstructs `wave_started_server` without it. Ring, joined-running and current/reload-then-join all use this shared event boundary. Forward the field by property presence so supplied malformed values reach the strict controller rather than silently becoming ordinary legacy mode. True absence stays absent, including production V1 responses.

Own only the minimal wave-flow forwarding hunk, event contract comments, focused normal-flow-to-controller regressions and this spec. Start from frozen integration `2661ed09`; pin immutable review base `chore/wall-43-wave-events-base`. Test a paid 102-piece fake island through the actual API wrapper, normal flow ring, real event bus and actual controller/simulation, then current/reload join. Check frozen geometry/crew and pathing/perimeter options, malformed refusal and unchanged absent legacy/V1 behavior. Coordinate the actual bell/card browser probe with WALL-24; no full Chrome rerun here.

This fixes the existing local adapter. Production remains strict V1; there is no new fake durable protocol, dependency, environment file, migration, deployment or merge. Keep draft for combined evidence, explain-back and human review.
