# VIS-35: authoritative core HP after optional travel

Responsible teammate: Johannes Franz Lang (`frcola`). Coding agent: core travel fix agent.

Issue: [#378](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/378), child of VIS-35 [#364](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/364).

Branch: `fix/vis-35-core-travel-rejoin`, based on the coordinated integration snapshot `3d34f8b9`. This stacked Draft uses `review/vis35-core-rejoin-3d34f8b` as its review base to keep the fix independently reviewable.

## Claimed scope

Restore actual core HP drawing after returning to the same island, epoch and server-confirmed live wave with optional travel enabled. A presentation-context change alone must never relabel an old controller wave as belonging to a different island. Preserve existing gameplay, simulation and stale-event rejection.

Expected code: the core publisher, returned-island load/wiring and focused pure/actual-controller/source-contract regressions. No browser run or full test suite is planned in this isolated slice while the coordinator captures the frozen integration.

## Status

Claim recorded before runtime edits. Implementation and exact verification pending. No merge or deployment.
