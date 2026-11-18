# MP-ECO-22: zero funds and owner-only recovery

> **What this is:** a concrete acceptance matrix for empty shared treasuries, existing income paths and the agreed owner-reset recovery rule.
>
> **Who uses it:** economy, lifecycle, gameplay, UI and release reviewers preparing integrated multiplayer acceptance.

- **Status:** specification and test planning only; shared-mode runtime acceptance remains open.
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.
- **Branch:** `docs/mp-eco-22-zero-funds`.
- **Issue:** [#514](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/514), under [epic #492](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/492).
- **Rules:** [agreed shared economy](../docs/DECISIONS.md#shared-island-economy-and-personal-captain-progression) and [MP-ECO task acceptance](../docs/OPEN-TODOS.md#12-shared-island-economy-and-multiplayer-rules).
- **Dependencies:** MP-ECO-01/02 account contract, 03 canonical income, 07 personal progress, 08 permissions, 10/11 inventory/session lifecycle, 12 repairs/revival, 14 wagers, 15 ship rewards and [16 reset](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/511). Coordinate measurements with [19 balance](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/512), authenticated evidence with MP-ECO-20 and release gates with [21 runbook](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/513).

## Settled behavior

A crew may demolish its defenses and lose the full available treasury on a valid wager. All ordinary invited-member spending, research-switching, demolition and betting rights remain unchanged. The same available funds cannot be spent twice, but this package adds no separate betting budget, stake/day/open-count limit, vote or owner approval for an ordinary purchase.

Ordinary already-permitted wave attempts remain free. A separately played successful repeat attempt can earn that attempt's normal loot again. A legitimate pending original-account payout or still-eligible ship reward may also pay for rebuilding. There is no new easy recovery wave or wave selector, bailout, personal-wallet transfer or member reset privilege. If none of the existing income paths enables rebuilding and the owner is absent, waiting for the owner is the intended outcome. This is not an instruction to promise that every zero-defense crew can win a wave.

Only the owner may reset the island, subject to the ordinary lifecycle prerequisites. Reset is not restricted to zero-funds islands and does not require exhausting all income paths first. It creates a fresh run with its configured starting capital once, preserving every Captain's personal progress and any Engineer obligation. Leadership succession never transfers reset ownership. No special recovery mode, currency or runtime API is introduced here.

## Inputs and inspected source baseline

Record the actual candidate's island/account/epoch, exact `balanceCoins`, `committedCoins`, `availableCoins`, island best/next wave, existing assets/crew, personal profiles, reservation state and original financial obligations. Use synthetic identities in public evidence. These states differ:

| State | Meaning | Required response |
|---|---|---|
| Balance 0, committed 0, available 0 | No island cash or held principal. | Paid actions cannot charge; normal free actions keep their existing phase/permission checks. |
| Balance 200, committed 200, available 0 | Principal is held by an unresolved commitment. | No double spend; await its legitimate settlement. Do not count the same principal again as additional cash. |
| Missing, stale or malformed shared context | Money is unavailable, not proven zero. | Fail closed and explain the unavailable state; never substitute personal coins or grant recovery money. |

Source inspection at main `f0c64442` establishes the following baseline, not a new balance selection:

- [Island catalogue](../backend/content/islands.json): current starting capital is 200; wall level one costs 10 and cannon level one 30. Eligible Engineer construction uses the existing 10% discount, so those examples cost 9 and 27 when the buyer qualifies and is atomically bound. MP-ECO-19 may propose reviewed catalogue changes; acceptance reads the chosen configuration rather than hard-coding these amounts.
- [Existing loot rules](../backend/server/island/rules.py): without houses or event bonuses, an ordinary won wave 1 yields 35 and wave 2 yields 45 under the current catalogue. Boss/house/event and late-wave rates must use the actual played wave's frozen rules. These amounts do not prove an available wave selection, a win or a playable zero-defense strategy.
- [Existing wave finish inputs](../backend/server/island/waves.py) use the configured normal defeat/restart and rescue rules. `restartBack` currently equals 2; preserve the actual canonical outcome and permitted next attempt, rather than adding an arbitrary low-wave recovery button.
- [Boat catalogue](../backend/content/boat.json) and [legacy boat implementation](../backend/server/island/boat.py): two games, 0–3 stars, ship unlock at island wave 30 and repaired wreck required. Current three-star formula is `3 * (6 + floor(min(record,100) / 5))`: 36 at record 30, 78 at 100. The legacy implementation pays personal wallets per player; it is not the shared reward implementation.

The selected shared ship rule pays only positive best-star improvements per island/game/new island record, capped by that formula. For an eligible wave-30 record, 0→1 star pays 12 and 1→3 pays 24 more; another player or a repeated/lower score cannot multiply the total of 36 for that game/record. This is target acceptance for MP-ECO-15; the inspected main source does not implement these shared identities. MP-ECO-15 must implement and prove them before this path is usable in shared mode.

Demolition proceeds are an ordinary existing refund source while eligible buildings remain. Full demolition cannot produce another refund from the same destroyed instance. Refund eligibility uses the actual amount paid, including discounts, and existing refund history. No periodic house payment, repeat login grant, new-member grant or personal deposit is an assumed income source.

## Scenario matrix

Every row describes target acceptance on an integrated candidate. None is marked passed by this document. Run relevant gameplay rows with solo, 2, 4 and 10 active Captains and include mixed/veteran personal profiles; income remains one payment per island attempt, not one per Captain.

| ID and starting state | Ordinary action or event | Required result |
|---|---|---|
| Z01: no buildings; balance/available 0; no reservation | Authorized session leader starts the normally permitted next attempt. | Zero coins alone does not impose an entry fee or a new refusal. Freeze normal roster/difficulty/loadouts. Every Captain retains the basic free weapon; other retained assets contribute only under their ordinary rules. No easier wave or free structures appear. |
| Z02: Z01 attempt is actually won | Canonical completion, concurrent participant acknowledgments and an exact retry. | One normal frozen attempt reward reaches its original account. Personal rewards require confirmed combat participation; an offline owner gains no personal win. Retries add no money or points. A separately played permitted repeat attempt can pay once again without refreshing already-earned personal milestones or ship records. |
| Z03: Z01 ends in normal defeat, abandonment or expiry | Canonical closure, then delayed/repeated client win reports. | No loot or reversal to victory. A confirmed normal defeat may satisfy only its frozen Engineer generation; abandonment/expiry/countdown-only presence cannot. Any existing structures receive normal wave-end restoration; demolished buildings are not recreated. |
| Z04: balance 200, committed 200, available 0 under valid fee-free terms | Opening wager resolves with authoritative loss, cancellation/refund or win. | Loss may leave 0/0/0; a legitimate returned principal/profit follows the product's saved terms exactly once. Principal is not paid twice. Products with fees reserve/debit the actual principal plus applicable fee within available funds; no artificial stake cap is added. |
| Z05: Z04 actor leaves or owner goes offline | Original authorized settlement completes. | No rejoin/online-owner requirement. Credit the saved original account/epoch; joining another island cannot redirect funds. An old private wager stays private and does not refill this island. |
| Z06: wave-30 ship unlocked, wreck already repaired, zero available, eligible record/game | Finish a valid ship round, then improve the best score. | Normal phase/member checks remain. Positive star deltas pay once to the shared island up to the configured per-game/record cap. The illustrative 12 then 24 pays at most 36; no per-player multiplication. Zero treasury is not an entry charge. |
| Z07: ship reward already at cap, same/lower score, or only a repeated lower wave was won | Replay rounds or old reward claims; another member tries. | No additional ship reward or renewed record entitlement. A fresh eligible island record follows MP-ECO-15; no fabricated win or reset of the old reward counter. |
| Z08: ship locked or wreck incomplete at zero available | Attempt to play/claim, including a direct unsupported shared request. | Keep the normal unlock/repair/phase refusal. No free unlock, waived wreck contribution, personal-wallet fallback or new reward session is created. |
| Z09: some paid building remains; available 0 | Between-reservation authorized demolition and retry. | Credit the ordinary eligible actual-cost refund once to this island. All-in wagering and demolition stay permitted; an already demolished/refunded instance cannot pay again or target a replacement instance. |
| Z10: all defenses demolished; all-in wager lost; no eligible payout/ship source; ordinary attempts cannot fund rebuilding; owner absent | Members or session leader request help/reset; reconnect/new member joins. | Members may use permitted free actions or wait; only the owner can reset. No joining grant, promotion to owner, hidden recovery mode, rescue money or private transfer. Display the owner requirement without promising that waiting generates coins. |
| Z11: same state; owner present; no unsealed reservation; selected reset prerequisites met | Owner confirms reset; network retry, reconnect and concurrent duplicate requests follow. | One new account/epoch, one configured run-start grant, accepted initial island state. No old balance carries over. Membership and every personal Captain entitlement/Engineer generation survive. A historical reset retry never resets a later run or installs its old account as current. |
| Z12: member/session leader at zero; owner absent | Forge owner/account/epoch, invoke old reset path or use another tab. | Refuse before any grant, retirement, asset change or Captain reset. Ordinary refusal leaves no new claim, charge or quota use. Leadership or anonymous/registered account status creates no owner privilege. |
| Z13: accepted countdown, active/rescue-pending wave, or expired but unsealed reservation | Owner requests reset. | Ordinary reset is blocked until canonical closure and required HP/session/copy settlement commit. Wall-clock expiry alone is insufficient. Valid closure/receipts cannot be discarded to make reset possible. |
| Z14: zero available but a valid reserved-wave action remains | Teammate revival, reconnect or a paid repair attempt. | Normal free revival remains free and repeat-safe, with eligibility/time guards. Reconnect never heals/revives or resets cooldowns. A paid repair still requires available funds, the fixed quote and shared repair allowance; zero funds cannot waive the cost or consume a successful-use slot on refusal. |
| Z15: player changes islands or configures a globally idle Captain | Visit a funded island, return, respec or reset another island. | Treasuries stay separate; no cash or shared arsenal copy is exported. Personal configuration remains free only under global assignment/Engineer guards. Reset cannot erase an obligation; a late old completion cannot clear C2 or change frozen W2 stats. |
| Z16: persisted offers pause, data outage or unsupported product | Try recovery actions; a legitimate already-authorized payout completes. | Follow MP-ECO-21's actual pause/recovery controls. New discretionary offers may be unavailable; saved-origin closure/settlement remains preserved. Zero funds grants no bypass, private fallback or permission to unpause. Show unavailable data separately from an exact zero. |

For Z10, measure actual permitted attempts and combat outcomes in MP-ECO-19; do not implement an “unwinnable” detector that silently changes prices, enemies, wave selection or permissions. If the owner returns, reset follows Z11 without a requirement to prove that every ordinary attempt is impossible.

## Reset and old-obligation branches

MP-ECO-16 still requires the product-wide outstanding-obligation policy before runtime reset/admission. This package does not select one or reopen the settled owner-only recovery rule. Parameterize the same matrix for both allowed designs:

| Selected lifecycle policy | Owner requests reset while an original bet remains open | Subsequent original settlement |
|---|---|---|
| Refuse reset with obligations | Keep the old run intact until classified blockers resolve; explain that blocker rather than issuing an extra grant. | Settle once against the existing origin; owner can retry reset after prerequisites hold. |
| Retire with durable obligations | Reset only with complete supported saved-origin disposition; retire old run and grant the replacement once. | Settle solely into the retired old account. Its payout cannot fund the replacement or be copied through a retry. |

Neither branch imposes a stake/count limit or silently discards holds. Both preserve private legacy obligations as private. An unclassified obligation, missing canonical closure or missing supported settlement executor fails closed. Owner account deletion/guest cleanup follows MP-ECO-16/17's separate disposition and retention gate; it is not a recovery reset or an automatic transfer to a member.

Owner resets can legitimately create repeated new-run grants under the selected rules. Reset/start-grant wagering and ordinary repeat-wave farming therefore belong in MP-ECO-19's explicit measurements. MP-ECO-22 neither adds a hidden cooldown/reset count nor declares those loops balanced.

## Transaction and response assertions

- Reconcile exact money after each boundary: `available = balance - committed >= 0`; balance/holds match their ledger and unresolved source identities. New actions recheck current membership/phase/account/epoch under the same transaction; original completion uses saved authorization.
- Race the last available funds between a purchase and a whole-available-budget wager. Exactly one compatible serial result wins; a loser leaves no asset, root claim, charge or repair use. Race settlement with reset under the selected obligation policy; no old payout reaches the replacement account.
- Race reset with bell, demolition/refund, ship claim and another reset. Each action is wholly before/after the boundary or refused. A timeout keeps the original UID/payload/origin; neither retry nor account selection multiplies income.
- Preserve independent personal revision and frozen Engineer IDs. Full-treasury loss, island departure, reset and a late receipt do not reset personal progress or release a different live assignment.
- UI shows exact available/committed money and ordinary action eligibility. A late reply from an old island/run cannot replace current funds, and an island-only reply cannot erase personal v1. A receipt's historical balance is not today's budget. No paid personal Captain upgrade/respec fallback appears on a legacy-money visit after personal adoption.

## Evidence boundaries and delivery tasks

The main-source baseline above was inspected. The separate MP-ECO-02/03/04/07/08/18 foundations supply account/hold arithmetic, original-attempt receipts, actual-cost refunds, personal binding, permission policy and strict display primitives. Their isolated helpers, scratch tests and synthetic DOM fixtures are prerequisites; they do not prove that authenticated users can execute Z01–Z16 through a deployed shared-mode game. Existing legacy boat/wave routes and fake multiplayer tests are not substituted for that missing integration.

| Task | Concrete deliverable | Gate |
|---|---|---|
| 22.1 Pin fixtures and source | Record actual integrated commit/catalogue/policy digests and synthetic states for zero cash, fully held funds, retained assets, both ship eligibilities and each reset-obligation branch. | MP-ECO-01/03/14–16 contracts present; no guessed route/DTO. |
| 22.2 Verify canonical transactions | Add meaningful zero-funds/last-funds/late-replay tests to the implemented domain SQL/API suites. Reconcile ledger, holds, assets, exact operation identities and personal generations, including injected failure. | Actual domain and canonical lifecycle implementations available. |
| 22.3 Verify ordinary play and UI | Exercise free permitted attempts, zero-cost revival, normal failures, ship deltas, owner-absent help and owner reset with desktop/phone cards and delayed replies. Record screenshots with fixture/authentication boundaries. | MP-ECO-10–16/18 integrated; fixed difficulty and normal next-wave rules preserved. |
| 22.4 Measure playability | Run solo/2/4/10 early/mid/late and mixed/veteran cases; record attempts, wins, time/funds to rebuild, remaining assets, failed paths and owner-wait duration. Separate assumed wins from observed wins. | MP-ECO-19; no claim that arithmetic guarantees a win. |
| 22.5 Prove authenticated acceptance | Run Z01–Z16 and boundary races with real authenticated clients, owner absent/present, departure/reconnect, stale clients, selected reset obligations and server-only closure with all browsers gone. | MP-ECO-20; approved scratch environment and exact implemented commands. |
| 22.6 Review release readiness | Attach exact commands/results/skips, identity/conservation counts and remaining limits to the candidate. Feed owner-only zero-funds and pause/recovery evidence into the runbook. | MP-ECO-21; independent human review and separate release authorization. |

## Verification and remaining work

This contribution changes only this specification. Check relative links/anchors, matrix coverage against the settled rules, current catalogue arithmetic and `git diff --check`. No game code, test harness, API, migration, feature flag or balance value changes. No live account, provider, deployment or shared admission is exercised.

Preparation checks passed on 18 Nov 2026: all seven relative links and anchors resolve, all 16 scenario IDs are present, current catalogue examples reproduce 200 starting coins, 35/45 wave income and 36/78 ship caps, and whitespace checks pass. This is documentation/source verification only.

Integrated SQL/API/browser tests, authenticated multiplayer evidence, MP-ECO-19 gameplay measurements and the selected MP-ECO-16 obligation/deletion policy remain open. Their absence is reported as pending acceptance, never as a passing zero-funds journey. Record actual executable commands from the integrated implementations before marking any matrix row passed.

- **Independent human reviewer:** pending.
- **Last updated:** 2026-11-18.
