# T59 Repair cards and health bars

> **What this is:** the implementation scope for explaining structure health, free recovery and paid repair in the game UI.
>
> **Who uses it:** Ianno, the T59 agent and the recovery API/simulation implementers.

- **Status:** core cards/bars merged through PR #203 and follow-up #267. Current work [#457](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/457) removes obsolete recovery ETA/choices for the 18 Nov full wave-end rule. Saved-policy error handling is separately tracked in [#344](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/344). Existing captures describe their original revisions; new UI evidence must match the revised rule.
- **Current branch:** `fix/wave-end-repair-ui`.
- **Issue:** [#125](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/125)

## Why

Players need to distinguish full free restoration at wave end from spending a shared paid repair during the reservation, and see actual damage. Implement the [T54 presentation contract](T54-recovery-implementation-plan.md) using the existing pixel design. Ianno authorized this assignment after [PR #135](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/135) merged.

## What

- Start isolated pure presentation models and tests against T54's agreed API shape: exact HP, fixed server-quoted price, full restoration at wave end and shared reservation quota.
- Add proportional health-bar helpers/components for damaged supported structures: hide full HP, preserve tiny positive HP, empty bar and small `!` on destroyed ruins.
- Place a small damaged-structure indicator above every supported world structure between waves and during preparation; the wave renderer owns the equivalent replay-state indicator during combat.
- Show the priced paid action and shared remaining uses during the reservation. Keep the card free of countdowns and wave-end explanatory sentences. Do not show a gradual-repair ETA, wait button or healing-speed promise. At full HP omit repair offers; normal between-wave state is intact.
- Under recovery v1 remove Carpenter hiring, Workshop role selection, Quick Mend and Mason Drill offers. Bastion keeps its +50% maximum HP copy. Preserve legacy choices and unrelated functionality; the server owns authoritative refusal in #456.
- Consume the canonical T55 structure view and the T56 repair route through the authenticated island API. Reject stale island/reset/instance responses, read the current wallet after refusals, and never fabricate a paid heal locally.
- During a reserved wave, use T57's replayed HP only for matching island epoch, wave UUID and structure instance; never patch active-wave HP from a Repair HTTP response. Outside the reservation use canonical server HP, without an elapsed-time projection or ETA.
- Discover persisted recovery policy from the canonical structure view independent of the new-admission flag, so saved v1 islands keep their cards and paid-repair path when admission is off. Island-wave requests advertise protocol-2 client capability; the server returns the frozen legacy or v1 policy. Pirate Point remains protocol 1.
- Before a combat paid repair, await T57's accepted replay-health checkpoint. If it fails, do not call the T56 paid-repair route.

**Files likely to change:** recovery models, indicators, structure cards, island API/controller and focused tests/captures. T58 owns Captain skill UI; T57 owns simulation/controller and combat renderer; T55 owns backend policy and contract index.

## Out of scope

No backend transaction or simulation edits, Captain skill redesign or live activation. Do not claim future behavior is shipped or rewrite player guides before working integration exists.

## Done when (acceptance checks)

- [ ] Focused tests cover full/partial/zero/tiny-positive HP, all six supported kinds, between-wave and reserved-wave display, server-supplied price and absence of wave-end explanatory copy, refusal and stale/retried request feedback, and shared-quota display. See the T59 evidence README for exact checks; fixture results do not prove server behavior.
- [ ] Integrated signed-shape adapter coverage exercises card refresh, stale island/instance responses, the checkpoint-before-repair guard and the rule that a combat HTTP response does not patch replay HP. Canonical closure/payment races, current wallet versus old receipts, late join and reconnect still need the T60 service/two-client evidence path.
- [ ] Focused frontend checks and a build pass; desktop/phone captures show production UI with offline fixture data. Live service and two-client checks are not claimed. Player docs/tutorials must match the reviewed release before activation.
- [ ] Complete diff is reviewed, remaining integration limits explicit, no secrets/unrelated files included and a different human approves before merge.

## Tests to write first

Pure display-state/phase/rounding and health-bar visibility; then loading/error/stale-response and integrated paid-action cases from issue #125. Do not represent fixture-only tests as live multiplayer evidence.

## Contracts touched

Consume T54's server-owned state and paid-action API shapes, versions, epochs, instance IDs and repair sequences. Coordinate shape changes with T55/T56 before wiring. UI displays server authority; it does not invent HP, prices or quota.

## Owner and reviewer

- **Responsible teammate:** Ianno (@Iannomh123456).
- **Coding agent:** `gpt-6-luna`, high reasoning.
- **Human reviewer:** Franz (@frcola), after Ianno's manual review and publication confirmation.
- **Last updated:** 2026-11-18.
