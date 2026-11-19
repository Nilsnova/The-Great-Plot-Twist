# Native idle wave discovery within the read budget

This bounded runtime correction keeps idle shared islands discoverable without exhausting the existing server budget. Used by the island wave wiring and its controlled timer regressions.

## Problem and scope

The native idle check currently calls `joinRunningWave` every second. The actual server permits 30 wave reads in a rolling 60-second window, so an otherwise idle player exhausts the budget. The island assembly also discards a refused current-wave read, hiding its `Retry-After` from the wiring.

Change only `frontend/src/pirates/game-wiring.js`, the refusal propagation in `frontend/src/island/index.js`, dedicated tests and this specification. Keep the backend budget, authentication, canonical session state, journal and combat authority unchanged.

## Behavior

- Automatic shared idle discovery starts at the existing first tick and attempts at most once every three seconds thereafter. Twenty attempts per minute leave ten reads for ordinary wave operations. An attempt counts when started, including a refused or slow attempt.
- Arrival and room `wave_start` continue to request discovery promptly, independent of the ordinary idle interval. Existing one-inflight admission, busy retries, already-joined detection and disposal remain in effect.
- A known 429 blocks every discovery trigger until the positive finite `retryAfterSeconds` deadline has elapsed. A thrown refusal may expose the existing `retryAfter` alias. A missing or invalid wait uses the ordinary three-second interval. The next ordinary tick or room signal may retry after that deadline; no timer backlog is created.
- `joinRunningWave` returns a refused current-wave read before considering an older cached wave for joining. It preserves the original refusal, including its wait; an accepted read keeps existing behavior.

## Verification

Use actual production wave wiring with controlled timers and a test-only rolling budget matching `PlayerBudget` (strict 60-second cutoff, limit 30). Run three minutes of idle discovery plus eight ordinary reads per minute; expect no refused request and continued discovery. Cover returned and thrown 429 deadlines, room and arrival behavior, slow joins, busy retries and disposal. Exercise the real island assembly with a transport stub and a cached unjoined wave to prove a 429 is returned without a stale join.

Run the focused Vitest files, the existing multiplayer/load and wave-flow regressions, production build and full diff review. These tests do not claim hosted-provider, rendered multiplayer or reset acceptance; those remain separate integration checks.

The six-file focused run passed 58 tests. The production build and spoiler guard passed. Independent source review found no actionable issue. The controlled regression first reproduced the rolling-budget refusals, ignored cooldown and stale cached join before the correction.
