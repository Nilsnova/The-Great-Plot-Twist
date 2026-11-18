# B466 Durable paid captain revival

> **What this is:** Fixes payment without a durable revival in recovery waves.
>
> **Who uses it:** Players, the island API, and reviewers of issue #466.

- **Status:** implemented; human review pending
- **Branch:** `fix/paid-revive-journal`
- **Publication branch:** `fix/coop-wave-consistency-review` (the development branch is retained).
- **Issue:** https://github.com/Nilsnova/The-Great-Plot-Twist/issues/466

## Why

The captain controller pays first, then submits a separate revival input. A reload between
these requests leaves a payment receipt without a replayable revival. A new request is refused
because that fall was already paid for.

## What

- Append the recovery revival and its wallet payment in one database transaction.
- Send the helper's captured position with protocol-2 revival requests. The server attaches
  its participant identity and Captain stats; the browser waits for journal replay.
- Keep protocol-1 revival behavior. An old client cannot charge a protocol-2 wave without
  journaling its effect.

**Files likely to change:** the wave route/service/store, a new migration, island API wiring,
captain controller, recovery replay adapter/simulation, and focused route/SQL/browser-unit tests.

## Out of scope

Other wave completion races, feature activation, live migrations, deployment, and merging.

## Done when

- [x] Disposable PostgreSQL checks prove one payment and one event, repeat safety, two helpers,
  closed-wave refusal, and rollback when event append fails.
- [x] Route checks prove protocol-2 dispatch and request validation.
- [x] Frontend checks prove recovery revival is replayed without a second input and does not
  revive a later fall; legacy checks still pass.
- [x] Relevant formatting, lint, build, and diff checks pass.
- [ ] A different human teammate reviews the current change before merge.

## Tests to write first

| Test | What it proves |
|---|---|
| `island_sql/test_recovery_revive_sql.py` | A payment is inseparable from its journal event; retries do not charge or append again. |
| `test_wave_revive_routes.py` | Recovery intent reaches the atomic RPC with validated coordinates. |
| `pirates/paid-revive.test.js` | Replay survives client recreation and consumes the exact paid fall. |

## Contracts touched

`POST /api/waves/revive` accepts `waveProtocol: 2`, `x`, and `z` for recovery waves and answers
`journaled: true` only after the transaction commits. Its legacy body/answer remain unchanged.
The new service-only `recovery_wave_revive` RPC emits a server-authored `captain_revive` journal
event with the paid fall's `downAt`, helper position, server participant token and Captain stats.
It does not consume a client actor counter. Shared wallet reasons, tables, and flags do not change.
Lock order follows paid repair and finish: payer wallet, sorted islands, recovery state/wave,
then participant. A replayed paid revival matches `downAt` before changing the fallen captain.

## Owner and reviewer

- **Responsible teammate:** Ianno
- **Coding agent:** Codex
- **Reviewer:** a different human teammate, to be assigned
- **Last updated:** 2026-11-18

Exact combined checks and evidence: [integration handover](../docs/handoff/coop-wave-consistency-2026-11-18.md).
