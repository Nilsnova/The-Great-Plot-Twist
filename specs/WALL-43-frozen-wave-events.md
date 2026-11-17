# WALL-43: preserve frozen local waves through the normal bell

For Johannes Franz Lang (`frcola`) and the integration reviewers; tracking [WALL-43 #333](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/333), a child of WALL-00.

The actual normal bell exposed an adapter gap: the fake returns `perimeterDemo`, the API validates it and the controller supports it, but `wave-flow.begin()` reconstructs `wave_started_server` without it. Ring, joined-running and current/reload-then-join all use this shared event boundary. Forward the field by property presence so supplied malformed values reach the strict controller rather than silently becoming ordinary legacy mode. True absence stays absent, including production V1 responses.

Own only the minimal wave-flow forwarding hunk, event contract comments, focused normal-flow-to-controller regressions and this spec. Start from frozen integration `2661ed09`; pin immutable review base `chore/wall-43-wave-events-base`. Test a paid 102-piece fake island through the actual API wrapper, normal flow ring, real event bus and actual controller/simulation, then current/reload join. Check frozen geometry/crew and pathing/perimeter options, malformed refusal and unchanged absent legacy/V1 behavior. Coordinate the actual bell/card browser probe with WALL-24; no full Chrome rerun here.

This fixes the existing local adapter. Production remains strict V1; there is no new fake durable protocol, dependency, environment file, migration, deployment or merge. Keep draft for combined evidence, explain-back and human review.


## Result and evidence

`begin()` now forwards an own `perimeterDemo` property unchanged. This shared boundary serves successful ring, explicit join and current/reload discovery followed by join, including the normal bell's `joinRunning` race path. The event contract states that this is declared local data and that malformed supplied values reach strict controller validation. Production recovery metadata and absent fields are unchanged.

The new normal-flow regressions first failed on frozen `2661ed09`: `Tests  7 failed (7)`. After the fix, the actual command was:

```sh
npm --prefix frontend test -- --maxWorkers=1 tests/island/perimeter-wave-flow.test.js tests/island/wave-flow.test.js tests/pirates/perimeter-demo.test.js tests/pirates/recovery-controller.test.js tests/island/structure-recovery-api.test.js
```

Actual final result: `Test Files  5 passed (5)`; `Tests  51 passed (51)`; `Duration  4.51s`. `git diff --check` passed.

The main regression purchases the measured 102-wall ring in four atomic fake runs, uses the actual client API wrapper and normal `flow.ring()` with the real event bus, then inspects the actual controller and simulation. The real simulation is observed with a call-through spy, confirming frozen defenses/crew plus `pathing` and `perimeterWalls`, despite conflicting mutable getters and ordinary options. Mutating the caller's returned data cannot alter the controller's frozen input. Current/reload-then-join reproduces the same initial state and twenty actual simulation steps, and normal ring racing an existing wave joins with the same snapshot. Null, false, zero, strings and malformed objects remain present in the event and are rejected by the controller. Existing exact legacy event and production V1 metadata tests remain green and V1 events omit the demo field.

These focused tests use the controlled local transport, not production durable recovery or a physical browser. WALL-24 owns the actual nearby-captain bell/card probe and new integrated captures after the integration writer freezes the corrected source. No broader browser/full-app check is claimed here.

## Explain-back

I had built the frozen input producer and consumer, but the normal bell rebuilt their event and left out the new field. I now carry that optional field across the shared flow boundary instead of making the controller read mutable island state. I preserve invalid supplied values so validation can reject them; dropping null or another false value would silently start ordinary legacy mode. Production responses still have no local demo field.

Before the draft is marked ready:

1. Why did direct controller tests pass while the normal bell still used the wrong mode?
2. Why does the adapter preserve a malformed supplied value rather than discard it?
3. Which test proves normal ring and current/reload join reach the actual frozen simulation, and which production guarantees remain unproven?
