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
