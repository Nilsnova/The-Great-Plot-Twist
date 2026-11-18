# T55 Recovery wave transactions

**18 Nov rule update:** this subslice records its original implementation/evidence. Current [T54](T54-recovery-implementation-plan.md) and [D059](../docs/DECISIONS.md#d059--shared-gradual-hp-recovery-and-paid-instant-repair--2026-11-16) replace gradual repair/rate-change expectations with full current-health restoration at canonical wave end. Keep immutable closed combat HP and frozen history. Obsolete new-v1 purchase retirement is tracked by [#456](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/456); earlier test results below do not verify that later revision.

> **What this is:** the SQL lifecycle and journal slice of approved T55 recovery work.
>
> **Who uses it:** Ianno and the server/client implementers and reviewers.

- **Status:** in progress; Python adapters remain in [T55 #136](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/136).
- **Branch:** `feat/t55-recovery-wave-rpcs`
- **Issue:** [#121](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/121)

## Goal and scope

Implement the database side of the approved [T54 contract](T54-recovery-implementation-plan.md): versioned start/join/current, immutable initial snapshots, authenticated ordered inputs/events, canonical health checkpoints and atomic finish/health/loot. The separate branch lets Python API work proceed in parallel without two writers editing the same migration.

Own `20261117040000_structure_recovery_api.sql` and focused disposable PostgreSQL tests. Reuse T55's existing state/settlement helpers and T56's paid transaction. Preserve exact HTTP/RPC contracts agreed with the Python implementer; actual account data, prices, health bounds and Captain metadata come from server state.

## Acceptance checks and tests first

- [ ] Fresh v1 reservation settles inactive HP, freezes complete inputs and pauses automatic repair at the accepted bell; preparation and combat share one three-repair allowance.
- [ ] Membership, protocol and persisted-policy checks reject unauthorized/mixed clients without side effects; saved v1 operations survive disabled new admission.
- [ ] Inputs are idempotent, server-attributed and bounded; event pages seal one fixed head; private account deletion preserves token-based replay.
- [ ] Complete HP checkpoints enforce epoch/prefix/per-instance repair fences, reject divergence and preserve damage after paid restore.
- [ ] First finish commits accepted HP, closes the reservation and pays loot atomically; retries and later participant payouts cannot rewrite closed HP. Expiry uses the canonical deadline and includes later committed repair events.
- [ ] Real SQL apply/reapply, grants, normal/failure/concurrency cases pass with exact evidence; no timing/assertion weakening. Relevant Supabase contracts are updated by coordinated handoff.

## Boundaries

No Python/frontend edits, existing six-body legacy SQL rewrite, paid-RPC rewrite, new gameplay, dependency changes, live migration, activation or deployment. All changes remain behind approved policy/version handling. Historical STATUS entries remain unchanged; new entries begin `Ianno /`.

## Owner and review

Responsible teammate: Ianno (@Iannomh123456). Coding agent: `gpt-6-luna`, high reasoning. Ianno reviews the complete result; Franz (@frcola) approves the current revision before a human merge. Keep the PR draft until the human review workflow is complete; agents never merge or enable auto-merge.
