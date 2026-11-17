# T57 Repair behavior during waves

> **What this is:** the implementation scope for versioned recovery behavior and ordered shared battle state.
>
> **Who uses it:** Ianno, the T57 agent and recovery state/payment/UI implementers.

- **Status:** in progress; isolated policy/replay tests first, integration follows T55/T56.
- **Branch:** `feat/t57-wave-recovery`
- **Issue:** [#123](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/123)

## Why

Existing simulations contain several free combat repair paths and ephemeral input delivery. The approved [T54 contract](T54-recovery-implementation-plan.md), merged in [PR #135](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/135), requires paused automatic repair and durable ordered paid events. Ianno authorized the implementation sequence and explicitly requested more agents.

## What

- Implement new-policy gates for every free structure-heal path from accepted bell, including preparation/countdown, through canonical finish/expiry. Preserve unrelated Captain/Tavern healing, E actions and frozen legacy-wave behavior.
- Consume immutable versioned initial HP/configuration and the durable authenticated journal; replay by effective tick/server sequence only through the sealed frontier. Apply paid events exactly once with later damage preserved.
- Keep zero-HP structures inactive during reservations unless authenticated paid repair succeeds; preserve fragile positive-HP next-wave starts, safe firing/obstacles/egress and valid new construction.
- Integrate start/join/current/finish negotiation, durable input/event/checkpoint transport and reconnection after T55/T56 adapters are ready. Never grant local HP/payment authority or battle-time healing credit.

**Files likely to change:** pirates simulation/controller/interactions/sync and new isolated replay/transport modules with focused determinism/legacy/two-client tests. T55 owns backend/schema and new config manifest; T58 owns Captain stat/skill modules; T59 owns structure cards/components. Coordinate exact ownership before shared changes.

## Out of scope

No backend schema/payment rewrite, Captain skill redesign or card/renderer redesign. No widened performance/timing limits, dependency upgrades, live migrations, flag activation or deployment. Preserve T50 ship damage and D060 extra plots.

## Done when (acceptance checks)

- [ ] All six kinds and every old free-heal source show no reserved-window HP gain/credit; immediate between-wave resumption and zero/positive HP rules are tested.
- [ ] Same seed/ordered journal reproduces HP/firing/routes, paid restore then damage, stale/duplicate/reordered events, finish, late join and reconnect; legacy fixtures remain unchanged.
- [ ] Focused/full frontend tests, build and applicable rules/obstacle/multiplayer checks pass with exact evidence; unresolved baseline failures and client-trust/performance limits remain explicit. Ianno reviews; a different human approves before merge.

## Tests to write first

Version-aware legacy/new-policy behavior, every automatic/manual free-heal route, sealed replay/page watermarks, paid-then-hit ordering, duplicate old receipt, safe obstacle reactivation and two-client lifecycle. Follow issue #123 and T54's full matrix without weakened bounds.

## Contracts touched

Recovery version 1 / wave protocol 2, immutable snapshots, durable journal/events/health checkpoints, canonical reservation identity and server-paid event interpretation. T55/T56 own backend shapes; agree exact wire fields before integration.

## Owner and reviewer

- **Responsible teammate:** Ianno (@Iannomh123456).
- **Coding agent:** `gpt-6-luna`, high reasoning.
- **Human reviewer:** Franz (@frcola), after Ianno's manual review and explicit publication confirmation.
- **Last updated:** 2026-11-16.

## Follow-up audit · 2026-11-17

The T57 client simulation and replay criteria were checked against the integrated source and focused regressions on `test/t57-wave-recovery-followup`. No production defect was found. A missing combined regression was added in `frontend/tests/pirates/recovery-tower-replay.test.js`: with a zero-HP cannon allowing boarders through, the test waits until one occupies its footprint, then sends a synthetic sealed paid event through `createWaveReplay`, `simulationInputFromJournal` and the combat sim. It verifies the tower resumes firing, the occupied boarder exits, later boarder damage remains possible, and other moving/hacking boarders stay clear while the tower has positive HP. The fixture is not an authenticated server event.

| Acceptance area | Current evidence | Limit |
|---|---|---|
| Pause free healing in the recovery-v1 sim | `wall-recovery.test.js` checks Captain E, two Carpenters, Workshop and Bastion; `tower-health.test.js` checks tower E repair/rebuild; the 18-run diagnostic contrasts legacy Carpenter/Workshop healing against v1. | Does not prove backend clock settlement or every owner/offline interval. Tech policy and skill removals are owned by T58. |
| Preserve frozen legacy behavior | `recovery-policy.test.js`, legacy wall-recovery tests and ordinary tower E tests cover the version dispatch and legacy sim paths. | This follow-up's focused command did not include `recovery-policy.test.js`; full integrated verification is a separate gate. |
| Snapshot and ordered journal replay | `recovery-snapshot.test.js`, `wave-replay.test.js` and `recovery-controller.test.js` cover frozen instance identity, single-application, fixed head/seal pagination, ordered replay, stale/conflicting event rejection, checkpoints and finish catch-up. | Tests use deterministic fixtures, not a live authenticated multiplayer session. |
| Destroyed/positive HP operation and safe tower movement | Snapshot tests retain one positive HP unit and current-instance restores; the new replay-to-sim test covers firing, later damage and movement beside a restored obstacle. | Full egress under every layout and all six structure kinds remains part of T60 integration verification. |
| Late join, reconnect, finish and offline lifecycle | Controller tests cover terminal catch-up and replay transport tests cover interrupted page retries; backend lifecycle evidence is recorded by T55/T60. | This T57 follow-up did not run an authenticated two-browser protocol-2 scenario or independently verify canonical expiry/offline settlement. |

Focused verification run on this branch: `cd frontend && npx vitest run --maxWorkers=1 tests/pirates/recovery-tower-replay.test.js tests/pirates/recovery-controller.test.js tests/pirates/wave-replay.test.js tests/pirates/recovery-snapshot.test.js tests/pirates/wall-recovery.test.js tests/pirates/tower-health.test.js tests/pirates/recovery-balance-diagnostic.test.js` — **7 files, 58 tests passed**. After tightening the final egress assertion to keep checking that boarder after its first exit, the changed test was rerun alone and passed **1/1**. These are targeted client checks, not a full frontend suite or protocol-2 two-browser coverage. Canonical server state and paid-event ordering do not make client-reported combat hits a full server-verified combat record.

T57 remains in progress for integrated human review: T60 owns the authenticated multiplayer/browser and broader lifecycle matrix; T56 owns paid transaction/quota coverage; T58 owns Captain/Tech policy; T59 owns health cards and visual feedback. No flag, migration, deployment or live data changed.
