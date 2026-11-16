# T54 Unified recovery implementation plan

> **What this is:** the concrete implementation proposal for D059, prepared before runtime coding.
>
> **Who uses it:** Ianno, the T55–T60 implementers and Franz when reviewing the plan and later changes.

- **Status:** planning in progress; implementation values and contracts are not approved yet.
- **Responsible teammate:** Ianno (@Iannomh123456).
- **Issue:** [T54 #120](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/120); [draft PR #127](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/127).
- **Branch:** `docs/t54-recovery-implementation-plan`, from main `e180ef53`.
- **Decision:** [D059](../docs/DECISIONS.md#d059--shared-gradual-hp-recovery-and-paid-instant-repair--2026-11-16).
- **Accepted design:** [T33 recovery spec](T33-persistent-tower-damage.md), merged in PR #118.

## Accepted behavior to preserve

- Walls, cannon, mortar, harpoon, culverin and swivel share gradual actual-HP recovery at base rate `maxHP / 600 seconds`, before approved Carpenter/Workshop bonuses.
- A damaging hit reduces current HP and pauses healing for three seconds after the latest hit. Previously regained HP remains real HP; there is no separate recovery-credit bank.
- Healing can run during combat, between waves and offline, and can reach full HP during combat. Wave end alone does not heal a structure.
- Paid Repair now restores one selected structure to full HP instantly during either phase, with one personal-wallet charge per accepted action and idempotent retries. Its fixed price depends on structure kind and level, irrespective of damage; the same kind/level costs the same at 90%, 20% or 0% HP. Exact prices are still unapproved.
- Preserve kind, level and upgrades. Carpenters/Workshops modify the shared rate; retire separate Captain repair actions and repair-only skills with reviewed refunds and compatibility.
- Preserve old frozen waves and unrelated E actions, Captain healing and revives.

## Contracts being prepared

Audit existing health, wave, wallet, skill, research, reset and multiplayer code. Propose exact modifier and price formulas, refunds/legacy mappings, HP precision, trusted time/health reports, ordered in-wave actions, finish reconciliation, zero-HP reactivation/obstacle behavior, APIs, additive storage and staged rollout/rollback.

The final proposal must identify where participant-reported combat data remains unverified, rather than presenting wallet authority as proof of combat correctness. Tests must cover actual HP `50% → 60% → 50%`, quiet-period boundaries, gradual/paid restoration, replay, post-restore damage, retries, refunds, reset and legacy waves.

## Pipeline and next gate

Ianno is claiming T54–T60. T54 is active planning in this orchestration session. T55–T60 are reserved and dependency-blocked; no runtime agent or implementation work has started. Every implementation task receives its own branch and draft PR when its approved prerequisites are available.

Prepare the complete proposal, tests and risks for Ianno's explicit OK before runtime coding. Keep this planning PR draft while the proposal is incomplete. Ianno manually reviews, Franz must approve the current revision before human merge, and agents never merge or enable auto-merge.
