# VIS-35: authoritative core HP after optional travel

Responsible teammate: Johannes Franz Lang (`frcola`). Coding agent: core travel fix agent.

Issue: [#378](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/378), child of VIS-35 [#364](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/364).

Branch: `fix/vis-35-core-travel-rejoin`, based on the coordinated integration snapshot `3d34f8b9`. This stacked Draft uses `review/vis35-core-rejoin-3d34f8b` as its review base to keep the fix independently reviewable.

## Claimed scope

Restore actual core HP drawing after returning to the same island, epoch and server-confirmed live wave with optional travel enabled. A presentation-context change alone must never relabel an old controller wave as belonging to a different island. Preserve existing gameplay, simulation and stale-event rejection.

Expected code: the core publisher, returned-island load/wiring and focused pure/actual-controller/source-contract regressions. No browser run or full test suite is planned in this isolated slice while the coordinator captures the frozen integration.

## Changed

The core publisher retains its original island identity (code, server epoch and local reset generation). Travel alone cannot relabel that wave. A successful returned-island load can expose a narrowly scoped proof for the current context and server wave. Only that proof lets the same retained controller adopt the new travel display key. The load must have accepted fresh island data, and its ticket, travel generation and target must still match when the current-wave answer returns.

## Verified

- The two new same-wave return regressions failed before the runtime change: `2 failed | 16 passed (18)`.
- `cd frontend && npm test -- --run tests/island/core-rejoin-load.test.js tests/pirates/core-display.test.js tests/pirates/core-controller.test.js tests/island/core-state.test.js tests/island/core-world.test.js tests/island/wave-flow.test.js --maxWorkers=1`: `Test Files 6 passed (6)`; `Tests 49 passed (49)`.
- `cd frontend && npm run build`: `✓ built in 780ms`; `Spoiler guard: 244 text files, 12 protected lines, no suspect elimination data.`
- `git diff --check`: exit 0, no output.
- Actual `createIsland`, API parsing and wave-flow run in Node with only DOM UI/bars mocked. Their tests reject missing/failed/invalid server waves, cached island identity after a failed read, late travel answers and older concurrent loads.
- The real wave controller keeps its wave object and advances actual HP while away. Its regression verifies authorized return resumes that HP and another island remains rejected.

## Not verified / remaining

No Chrome/Safari travel run, new screenshots, full frontend suite, live backend, deployment or merge in this slice. The coordinator owns combined-game visual evidence. Another human must review the current diff; Johannes must explain the bounded rejoin authority before marking the Draft ready.

Explain-back prompts: Why is a changing presentation key alone insufficient authority? Which three parts of island identity prevent another island/reset borrowing an old wave? What do the real-controller and DOM-mocked island-load tests each prove, and what still needs a browser?
