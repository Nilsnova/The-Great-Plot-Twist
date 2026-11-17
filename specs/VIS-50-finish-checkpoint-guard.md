# VIS50: first recovery finish checkpoint guard

Issue: [#415](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/415).

## Goal

A malformed first protocol-2 recovery finish must be refused without closing the wave, changing health/progression, or paying loot. Preserve the valid older/equivalent accepted-checkpoint fallback introduced on current main.

Responsible teammate: Johannes Franz Lang (`frcola`). Parent: VIS-31 #236; independently found while composing the reference-village work with current main `ee5677ff`.

## Observed regression

A disposable PostgreSQL run applied the complete migration chain twice, built a real paid wall and started a recovery wave with a 15-second minimum. At a declared 20-second test clock, seal399/head0, no accepted checkpoint and one frozen structure, the direct empty-vector health report correctly refused `checkpoint_divergence`. The same first finish returned `done`, paid15 coins (90→105), closed initial full HP and kept `checkpointUid:null`. Replacing only the finish function with the previous version inside a rollbackable transaction refused the same arguments without changes. No live database, credentials, `.env` or migration application was involved.

The November18 finish implementation tolerates all `checkpoint_divergence` refusals. That reason also covers missing/extra instance keys, fractional HP and healing, not only disagreement with an existing accepted checkpoint.

## Scope and likely files

- A forward migration after `20261118030000_recovery_away.sql`; do not edit an already shipped migration.
- Focused disposable-PostgreSQL regression tests for malformed first vectors, valid first finishes, accepted-checkpoint fallback and idempotent payouts.
- A short spec and exact red/green evidence.

No frontend/runtime dependency, service, public signature, flag, production setting or live migration changes.

## Acceptance

- A first incomplete, extra-key, fractional or healing vector is refused with zero loot/progression/close/health side effects.
- A valid first vector still closes and pays once; retry remains idempotent.
- An already accepted canonical checkpoint can still support the intended older/divergent-prefix finish fallback.
- Current main's authoritative close, teammate outcome, expiry/away handling and grants remain intact.
- Existing perimeter start capability, immutable old-template bridge and selected128-ID bounds remain compatible.
- Run only ephemeral Unix-socket PostgreSQL through the existing scratch fixture. Record exact results; keep Draft for human review and explain-back.
