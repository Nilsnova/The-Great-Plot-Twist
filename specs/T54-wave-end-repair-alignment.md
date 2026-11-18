# T54 Wave-end repair rule alignment

> **What this is:** the 18 Nov consistency update after full wave-end restoration replaced gradual repair.
>
> **Who uses it:** Ianno and contributors implementing/reviewing the current T54–T60 follow-ups.

- **Responsible teammate:** Ianno (@Iannomh123456).
- **Task:** [T54 #120](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/120), coordinated with [T58 #456](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/456) and [T59 #457](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/457).
- **Branch:** `docs/wave-end-repair-rules`, based on main `48aee0e7`.
- **Status:** rule cleanup authorized; documentation and code follow-ups await review. No PR or release is claimed.

## Problem and outcome

Main changed automatic recovery to full health at every canonical wave end, while active specs/task rows still promised gradual repair, healing-speed purchases and wait-time estimates. The current [D059](../docs/DECISIONS.md#d059--shared-gradual-hp-recovery-and-paid-instant-repair--2026-11-16) and [T54 plan](T54-recovery-implementation-plan.md) now define one consistent rule. Preserve the three shared paid repairs from bell acceptance, fixed current-level incremental prices, paid-action atomicity, retries and frozen history. Remove useless new-v1 offers without inventing replacement roles or a compensation subsystem.

## Scope and ownership

This branch updates current decisions, T33/T54–T60 specs, interface overview, task board, delivery gates, roadmap and policy-specific player guidance. Older source audits/captures are marked historical instead of being represented as current proof. Existing D059/task anchors remain valid. STATUS only receives a new appended `Ianno /` entry; no committed log line is removed or rewritten.

Backend code/refusal/concurrency belongs to `fix/wave-end-repair-options` (#456). Frontend choices/cards/captures belong to `fix/wave-end-repair-ui` (#457). Saved policy errors (#344) and existing gated defenses (#121) remain distinct bug branches, with their own review state. No instruction/setup files are edited.

## Verification and limits

Review changed links and current rule wording, retain old anchors and compare STATUS against the exact base prefix. Check the complete diff for unrelated files and private data. Documentation checks do not prove backend behavior, browser synchronization, a migration application or a release; exact code evidence belongs to the paired implementation tasks. Historical browser captures remain valid evidence only for their stated source/fixture.

## Review

Ianno manually reviews the result and confirms publication. Franz (@frcola) reviews the current revision before a human merges. No agent merge, auto-merge, deployment or live migration application.
