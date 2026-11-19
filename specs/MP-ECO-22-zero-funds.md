# MP-ECO-22: zero funds and owner-only recovery

> **What this is:** a concrete acceptance matrix for empty shared treasuries, existing income paths and the agreed owner-reset recovery rule.
>
> **Who uses it:** economy, lifecycle, gameplay, UI and release reviewers preparing integrated multiplayer acceptance.

- **Status:** combined domain/API recovery and desktop/phone component checks implemented; authenticated recovery acceptance remains pending.
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.
- **Branch:** `test/mp-eco-zero-funds-recovery`.
- **Issue:** [#514](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/514), under [epic #492](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/492).
- **Rules:** [agreed shared economy](../docs/DECISIONS.md#shared-island-economy-and-personal-captain-progression) and [MP-ECO task acceptance](../docs/OPEN-TODOS.md#12-shared-island-economy-and-multiplayer-rules).
- **Dependencies:** MP-ECO-01/02 account contract, 03 canonical income, 07 personal progress, 08 permissions, 10/11 inventory/session lifecycle, 12 repairs/revival, 14 wagers, 15 ship rewards and [16 reset](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/511). Coordinate measurements with [19 balance](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/512), authenticated evidence with MP-ECO-20 and release gates with [21 runbook](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/513).

## Settled behavior

A crew may demolish its defenses and lose the full available treasury on a valid wager. All ordinary invited-member spending, research-switching, demolition and betting rights remain unchanged. The same available funds cannot be spent twice, but this package adds no separate betting budget, stake/day/open-count limit, vote or owner approval for an ordinary purchase.

Ordinary already-permitted wave attempts remain free. A separately played successful repeat attempt can earn that attempt's normal loot again. A legitimate pending original-account payout or still-eligible ship reward may also pay for rebuilding. There is no new easy recovery wave or wave selector, bailout, personal-wallet transfer or member reset privilege. If none of the existing income paths enables rebuilding and the owner is absent, waiting for the owner is the intended outcome. This is not an instruction to promise that every zero-defense crew can win a wave.

Only the owner may reset the island, subject to the ordinary lifecycle prerequisites. Open island wagers do not block reset; their cash, holds and later payouts stay solely in the retired originating account. Reset is not restricted to zero-funds islands and does not require exhausting all income paths first. It creates a fresh run with its configured starting capital once, preserving every Captain's personal progress and any Engineer obligation. Leadership succession never transfers reset ownership. No special recovery mode, currency or runtime API is introduced here.

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
| Z11: same state; owner present; no unsealed reservation; ordinary reset prerequisites met | Owner confirms reset; network retry, reconnect and concurrent duplicate requests follow. | One new account/epoch, one configured run-start grant, accepted initial island state. No old balance carries over. Membership and every personal Captain entitlement/Engineer generation survive. A historical reset retry never resets a later run or installs its old account as current. |
| Z12: member/session leader at zero; owner absent | Forge owner/account/epoch, invoke old reset path or use another tab. | Refuse before any grant, retirement, asset change or Captain reset. Ordinary refusal leaves no new claim, charge or quota use. Leadership or anonymous/registered account status creates no owner privilege. |
| Z13: accepted countdown, active/rescue-pending wave, or expired but unsealed reservation | Owner requests reset. | Ordinary reset is blocked until canonical closure and required HP/session/copy settlement commit. Wall-clock expiry alone is insufficient. Valid closure/receipts cannot be discarded to make reset possible. |
| Z14: zero available but a valid reserved-wave action remains | Teammate revival, reconnect or a paid repair attempt. | Normal free revival remains free and repeat-safe, with eligibility/time guards. Reconnect never heals/revives or resets cooldowns. A paid repair still requires available funds, the fixed quote and shared repair allowance; zero funds cannot waive the cost or consume a successful-use slot on refusal. |
| Z15: player changes islands or configures a globally idle Captain | Visit a funded island, return or respec; the owner resets the original island while the player is elsewhere. | Treasuries stay separate; no cash or shared arsenal copy is exported. Personal configuration remains free only under global assignment/Engineer guards. Reset cannot erase an obligation; a late old completion cannot clear C2 or change frozen W2 stats. |
| Z16: persisted offers pause, data outage or unsupported product | Try recovery actions; a legitimate already-authorized payout completes. | Follow MP-ECO-21's actual pause/recovery controls. New discretionary offers may be unavailable; saved-origin closure/settlement remains preserved. Zero funds grants no bypass, private fallback or permission to unpause. Show unavailable data separately from an exact zero. |

For Z10, measure actual permitted attempts and combat outcomes in MP-ECO-19; do not implement an “unwinnable” detector that silently changes prices, enemies, wave selection or permissions. If the owner returns, reset follows Z11 without a requirement to prove that every ordinary attempt is impossible.

## Reset, original obligations and account deletion

The selected MP-ECO-16 policy permits owner reset with open island wagers. Positive committed principal is not a reset blocker. Old remaining cash, held principal and every legitimate later payout/refund remain solely in the retired original account; none transfers to or funds the replacement run. The reset confirmation explains this boundary. Only the configured new-run grant funds the replacement once.

| Original state | Reset treatment | Subsequent effect |
|---|---|---|
| Unspent old cash | Retain the exact amount in the retired bank. | No new spending, cash-out or transfer into the replacement. |
| Open original wager/position, held principal and supported fees | Preserve source identity and terms; allow owner reset. | Close, liquidate, void or refund once against that retired original account only. |
| Valid late canonical reward/refund/ship entitlement | Preserve its original eligibility and economic origin. | Pay only the original account; reset creates no new eligibility or claim. |
| Original private bet or valid legacy private claim | Keep its private origin and receipt unchanged. | Remain private; neither shared account receives its funds. |

An unsealed reservation still blocks reset until canonical closure, even after wall-clock expiry. Every supported origin requires a durable settlement executor before admission; an unsupported or unclassified origin remains an implementation/admission gate, not another policy choice or an extra stake limit. Complete reset still requires MP-ECO-10/11 asset, copy, session and closure hooks; the private treasury foundation alone is not a playable reset.

An explicitly confirmed owner-account deletion deletes that owner's island. It selects no successor or transfer recipient and creates no replacement run or starting grant. Preserve every other Captain's personal progress and earned personal completion evidence. Copies and valid settlement obligations on continuing islands follow their normal original-origin/return rules. Historical identity detachment, privacy/de-identification, canonical participant/copy disposition and guest-cleanup authorization remain implementation gates; a raw cascade or session-leader promotion cannot substitute for them. Account deletion is a separate destructive action, not a zero-funds recovery reset.

Owner resets can legitimately create repeated new-run grants under the selected rules. Reset/start-grant wagering and ordinary repeat-wave farming therefore belong in MP-ECO-19's explicit measurements. MP-ECO-22 neither adds a hidden cooldown/reset count nor declares those loops balanced.

## Transaction and response assertions

- Reconcile exact money after each boundary: `available = balance - committed >= 0`; balance/holds match their ledger and unresolved source identities. New actions recheck current membership/phase/account/epoch under the same transaction; original completion uses saved authorization.
- Race the last available funds between a purchase and a whole-available-budget wager. Exactly one compatible serial result wins; a loser leaves no asset, root claim, charge or repair use. Race settlement with reset with the selected retired-origin settlement policy; no old payout reaches the replacement account.
- Race reset with bell, demolition/refund, ship claim and another reset. Each action is wholly before/after the boundary or refused. A timeout keeps the original UID/payload/origin; neither retry nor account selection multiplies income.
- Preserve independent personal revision and frozen Engineer IDs. Full-treasury loss, island departure, reset and a late receipt do not reset personal progress or release a different live assignment.
- UI shows exact available/committed money and ordinary action eligibility. A late reply from an old island/run cannot replace current funds, and an island-only reply cannot erase personal v1. A receipt's historical balance is not today's budget. No paid personal Captain upgrade/respec fallback appears on a legacy-money visit after personal adoption.

## Evidence boundaries and delivery tasks

The main-source baseline above was inspected. The separate MP-ECO-02/03/04/07/08/18 foundations supply account/hold arithmetic, original-attempt receipts, actual-cost refunds, personal binding, permission policy and strict display primitives. Their isolated helpers, scratch tests and synthetic DOM fixtures are prerequisites; they do not prove that authenticated users can execute Z01–Z16 through a deployed shared-mode game. Existing legacy boat/wave routes and fake multiplayer tests are not substituted for that missing integration.

| Task | Concrete deliverable | Gate |
|---|---|---|
| 22.1 Pin fixtures and source | Record actual integrated commit/catalogue/policy digests and synthetic states for zero cash, fully held funds, retained assets, both ship eligibilities and retired-origin obligations through reset. | MP-ECO-01/03/14–16 contracts present; no guessed route/DTO. |
| 22.2 Verify canonical transactions | Add meaningful zero-funds/last-funds/late-replay tests to the implemented domain SQL/API suites. Reconcile ledger, holds, assets, exact operation identities and personal generations, including injected failure. | Actual domain and canonical lifecycle implementations available. |
| 22.3 Verify ordinary play and UI | Exercise free permitted attempts, zero-cost revival, normal failures, ship deltas, owner-absent help and owner reset with desktop/phone cards and delayed replies. Record screenshots with fixture/authentication boundaries. | MP-ECO-10–16/18 integrated; fixed difficulty and normal next-wave rules preserved. |
| 22.4 Measure playability | Run solo/2/4/10 early/mid/late and mixed/veteran cases; record attempts, wins, time/funds to rebuild, remaining assets, failed paths and owner-wait duration. Separate assumed wins from observed wins. | MP-ECO-19; no claim that arithmetic guarantees a win. |
| 22.5 Prove authenticated acceptance | Run Z01–Z16 and boundary races with real authenticated clients, owner absent/present, departure/reconnect, stale clients, retired-origin reset obligations and server-only closure with all browsers gone. | MP-ECO-20; approved scratch environment and exact implemented commands. |
| 22.6 Review release readiness | Attach exact commands/results/skips, identity/conservation counts and remaining limits to the candidate. Feed owner-only zero-funds and pause/recovery evidence into the runbook. | MP-ECO-21; independent human review and separate release authorization. |

## Earlier preparation verification

The 18 November contribution changed only this specification. Relative links/anchors, matrix coverage against the settled rules, current catalogue arithmetic and `git diff --check` were its checks. It changed no game code, test harness, API, migration, feature flag or balance value and exercised no account, provider, deployment or shared admission.

Preparation checks passed on 18 Nov 2026: all seven relative links and anchors resolve, all 16 scenario IDs are present, current catalogue examples reproduce 200 starting coins, 35/45 wave income and 36/78 ship caps, and whitespace checks pass. This is documentation/source verification only.

At that preparation checkpoint, integrated SQL/API/browser tests, authenticated multiplayer evidence, MP-ECO-19 gameplay measurements and complete MP-ECO-16 reset/deletion integration remained open. The later bounded checks below supersede only the stated missing layers; they do not turn an unobserved gameplay outcome into a pass.

- **Independent human reviewer:** pending.
- **Last updated:** 2026-11-19.

Selected-policy follow-up: owner reset with open wagers retains all old cash/holds/returns solely in the retired bank; confirmed owner-account deletion removes the owned island without a successor or new grant and preserves other Captains. The scenario/task matrix uses those choices. Runtime integration, historical retention/disposition and authenticated acceptance are still pending; no application behavior is claimed by this documentation update.

## Combined recovery checkpoint — 19 November 2026

The new checks use the integrated application at main `3bdd8eda16470795fdedd68c42fffab54e5f2ced` without changing product code, prices, migrations, admission policy or ordinary wave selection. Source inputs are pinned by SHA-256:

| Input | SHA-256 |
|---|---|
| `backend/content/islands.json` | `cf18f3f6df388f23058591d76a48169ef5fb8d22be26f81409b966ef4a541a95` |
| `backend/content/campaign.json` | `7cfd3e5517d101ae8a25f1a1fefa9eac847d5ed958d4413a6d65a86c6719b0a6` |
| `backend/content/boat.json` | `6e1d402e1417749a1a0a722bb8c99a38fdda31c527053af2dd0ee80b11822311` |

[The combined PostgreSQL cases](../backend/server/tests/island_sql/test_zero_funds_recovery_sql.py) and [registered HTTP journey](../backend/server/tests/island_sql/test_zero_funds_recovery_http_pg.py) share [explicit disposable setup](../backend/server/tests/zero_funds_recovery.py). Real canonical authority, controller, personal, construction, wager, ship and reset functions execute. The actual authority RPC is never replaced. The complete migration chain is installed twice on a disposable Unix-socket server.

The advanced saved island, initial 100-coin test grant, retained recovery template, market readings and due timestamps are explicit fixture setup. The retained template is generated by the production coherent snapshot/catalogue builder. New reset capital comes from the actual configured 200-coin starting amount; no test changes that policy. Scripted defeat, market outcome and ship stars are transaction inputs, not proof of natural gameplay or independently achieved scores.

The combined sequence builds a wall for 10 and a cannon for 30, demolishes both through the ordinary actual-cost refund path, stakes the full remaining 80 and settles a legitimate fixture loss. Both paid defenses are absent, exact cash/holds/available are zero, personal wallets are unchanged, and a replay with a winning price cannot rewrite the loss. An invited session leader can still ring the ordinary wave 31 with the actual minimum time and full normal rule set. The configured defeat restarts at best record 30 minus two, wave 28; no recovery-wave selector or easier policy is introduced. A late victory acknowledgment retains that loss and zero loot.

Owner-absent cohorts have 1, 2, 4 and 9 active invited Captains. The existing ten-seat limit counts the offline owner, so nine is the legal owner-absent maximum. A separate ten-active-Captain case includes the owner. New joins at zero add no island money. In every case, the member leader cannot reset; the owner cannot bypass an unsealed reservation, and an allowed idle owner reset creates one replacement account/grant while preserving all personal profiles and wallets. Exact reset replay does not create another grant. No test promises that a zero-defense crew will win or that waiting itself creates money.

Separate combined branches preserve legitimate ordinary income:

- A previously authorized 10-coin stake may leave all funds committed after the other all-in is lost. Its correct saved-origin win returns 20 once and can fund an ordinary new wall. If the owner resets first, the same 20 stays only in the retired account; the replacement keeps exactly its configured grant.
- An unlocked repaired ship starts at zero cost. The selected one-star result pays 12, which can fund a wall; a later three-star improvement pays 24 more. Another Captain's same three-star result pays zero. Zero funds never waive a locked ship or unfinished wreck.
- The actual HTTP visitor read reports zero available funds and no buildings. The member's reset is forbidden, their proof-qualified normal bell succeeds without a debit, an active owner reset is refused, and the later ordinary owner reset/replay creates one new run. Authentication responses and the trusted terminal outcome in this HTTP check remain explicit fixtures.

[Four Chromium component cases](../frontend/tests/island/zero-funds-recovery-dom.test.js) cover 1280 × 800 and 375 × 812. They render the actual island assembly with a zero-budget member controller: paid crew controls stay disabled, the normal wave-31 bell stays available and Settings grants no member reset. A separate actual owner Settings section can confirm the typed island code at zero, discloses personal preservation and old-run funds, and sends no request in that display-only case. Private wallet updates cannot replace the shared zero. [Captured evidence](../docs/evidence/MP-ECO-22/README.md) retains the synthetic transport qualification.

Run from `backend/`:

```sh
CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast python -m pytest -q --tb=short server/tests/island_sql/test_zero_funds_recovery_sql.py server/tests/island_sql/test_zero_funds_recovery_http_pg.py
uv run ruff check .
```

Run from `frontend/`:

```sh
MP_ECO_EVIDENCE_DIR=../docs/evidence/MP-ECO-22 npm test -- --maxWorkers=1 tests/island/zero-funds-recovery-dom.test.js
```

The final combined SQL/HTTP selection passed 11 cases in 66.09 seconds. The four captured Chromium cases passed in 5.31 seconds. Whole-backend Ruff and scoped whitespace checks passed. These are domain/HTTP/component results. The complete authenticated Z01–Z16 matrix, natural feed/time observations and solo/2/4/10 gameplay playability measurements retain their separate status; none is inferred from scripted accepted outcomes. No hosted database, deployment or production activation is touched.
