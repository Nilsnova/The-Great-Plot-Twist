# WALL-35: explicit frozen local perimeter demo

For Johannes Franz Lang (`frcola`), tracking [WALL-35 #309](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/309) and [Draft PR #310](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/310). This controlled local legacy demo is separate from production perimeter V1 recovery and durable inputs. Production never emits `perimeterDemo`; no fake durable recovery RPC is added.

## Result and boundary

The fake freezes paid built defenses, levels, coordinates, health and crew when a perimeter-policy wave starts. It includes a declared `version: 1` demo input bound to the wave ID, seed, number, start time and island epoch, with pathing and perimeter walls enabled. The bounded parser validates, clones and freezes that input. Malformed provided data refuses instead of falling back to mutable current-island getters. The controller uses these inputs only in a legacy local demo; absent-demo legacy behavior and production V1 paths remain separate.

Start, current, join and shared-store reload return the same declared input. The finish boundary accepts only canonical `wall_1` through `wall_128`, at most 128 health entries. A local perimeter wave blocks new ordinary construction and upgrades while running; recorded action receipts can still reconcile. New perimeter admission and construction respect the local `perimeter_walls` offer flag. Pausing offers preserves owned pieces and committed build receipts.

The parser caps defenses at 142, accepts only catalogue IDs and matching kinds, half-grid finite coordinates, supported levels, bounded health, known crew keys/counts and bounded optional progression fields. It refuses production V1 headers combined with local demo data. The controller applies the frozen defenses, crew and required perimeter options after ordinary simulation overrides, so later getters or generic options cannot replace them.

## Verification

Command, from the repository root:

```sh
npm --prefix frontend test -- --maxWorkers=1 tests/pirates/perimeter-demo.test.js tests/pirates/controller.test.js tests/pirates/recovery-controller.test.js tests/island/wall-runs-fake.test.js tests/pirates/fake-api.test.js tests/pirates/perimeter-landing.test.js
```

Actual result: `Test Files  6 passed (6)`; `Tests  78 passed (78)`; `Duration  5.97s`. `git diff --check` passed.

The integration case pays for a measured 102-piece ring in four atomic runs, starts a wave, verifies unchanged current/join/reloaded inputs, runs the actual deterministic simulation to completion, observes exterior landings and real wall breaches, submits all 102 health entries and confirms the run is finished. Other cases cover malformed input, current-state mutation, option overrides, paused offers, retry receipts and ordinary legacy/V1 controller compatibility.

These checks prove local construction and deterministic demo integration. They do not prove durable production recovery, concurrent production participants, real deployment, Safari behavior or screenshot quality. Actual integrated game captures and broader checks remain in the coordinated integration lane. Prerequisites are WALL-29 exterior landing, WALL-31 local construction and WALL-30 world display. No package, environment file, migration, live activation or merge is included.

## Explain-back

I snapshot the local island when a wave begins because moving or upgrading a building later must not change that running battle. The demo has an explicit field and a small parser so it cannot silently masquerade as the production recovery protocol. The production path still needs its real frozen V1 snapshot and durable event journal. If we later add more local simulation inputs, we must extend validation and tests together rather than reading mutable island state during a fight.

Before marking the draft ready, explain:

1. Why must a running battle use its start-time defenses instead of the latest island view?
2. Why does a successful 102-wall local finish not prove production V1 durability?
3. When new construction is paused, why may a committed receipt still return successfully?
