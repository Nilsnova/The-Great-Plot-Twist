# VIS-41 — Fence stale current-wave lookups

Responsible teammate: Johannes Franz Lang (`frcola`, `83476@novasbe.pt`). Child of VIS-31 #236; tracks #397.

Claimed before runtime edits on `fix/vis-41-wave-look-fence`, based on frozen coordinated candidate `9f47c142`. Stacked Draft base: `review/vis41-wave-look-9f47c142`.

An older asynchronous wave lookup must not overwrite a newer island/wave, revive reset state or replace an accepted start/join. Fence mutations inside wave-flow, preserve the core model's expected-wave authority, and cover deferred lookup/reset/admission ordering plus actual island-load state. Scope: wave-flow and focused tests only; no new package, backend, environment, browser run, deployment or merge.

## Changed

Wave-flow now checks lookup and target/reset generations before any read can mutate `current`. A newer lookup, admission start/accepted begin, finished/cleared wave or reset invalidates older reads. Pending start/join responses and their preparation must still belong to the requested target/reset scope; a join also stays tied to its original wave ID. A different same-target wave freshly confirmed while start/prepare waits cannot be overwritten by that older admission. Empty/failed same-target refresh does not cancel a valid start. A superseded `wave_running` fallback cannot auto-join cached state and cancel a newer read. Core expected-wave checks remain unchanged.

A confirmed empty different target clears the previous joined wave, countdown timers and banner together; same-target empty refresh preserves all three. This is reachable when `game.js` reloads an already visible island and a failed visit falls back to the own island inside `load()` without a travel reset. The actual island-load regression covers that fallback.

## Verified

- Before the runtime change, deferred race tests plus the strengthened actual island-load assertions produced `Test Files 2 failed (2)`; `Tests 14 failed | 8 passed (22)`.
- A delegated source review found the reverse preparation order (newer read returns before older admission begins). Three additional boundary cases failed first: `Tests 3 failed | 19 passed (22)`, then passed after the admission guard.
- The empty different-target flow and actual load fallback checks failed before the final bounded read-transition change: `Tests 2 failed | 31 passed (33)`. Deferred checks also assert stale countdown/banner removal and unchanged same-target countdown/banner.
- `cd frontend && npm test -- --run tests/island/wave-flow-races.test.js tests/island/core-rejoin-load.test.js tests/island/wave-flow.test.js tests/pirates/core-controller.test.js tests/pirates/core-display.test.js tests/island/core-state.test.js --maxWorkers=1`: `Test Files 6 passed (6)`; `Tests 70 passed (70)` (2.53s).
- `node --check frontend/src/island/wave-flow.js` and `git diff --check`: exit 0, no output.
- Deferred real-flow tests cover both A/B reply orders, stale null/failure, failed newest lookup, reset/clear, admission/preparation, same-target refresh and late join outcomes on both the same/new target.
- The actual island-load tests now assert `flow.current`, and the actual controller test verifies stale lookup completion cannot break acceptance of its real partial HP through the unchanged model guard.

## Not verified / remaining

No Chrome/Safari, full suite, build, live backend or deployment in this focused slice. The coordinator's ongoing immutable-candidate checks are separate and do not verify this later source revision. Coordinator integration/checks, Johannes's explain-back and independent human review remain; keep Draft and do not merge.

Explain-back prompts: Why use separate lookup and target/reset generations? Why must an accepted begin invalidate a read started during preparation? Why should the core continue checking the actual current wave instead of accepting stale wave IDs?
