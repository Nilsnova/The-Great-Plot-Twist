# MP-ECO-05 Shared research, tower upgrades and wreck funding

> **What this is:** Atomic island-funded progression with explicit stale-intent protection.
>
> **Who uses it:** The island API integration and reviewers of shared economy purchases.

- **Status:** implementation complete; route integration and human review pending
- **Branch:** `feat/mp-eco-05-research`
- **Issue:** #509, part of #492

## Why

Research, tower skills and wreck repair change the defended island. Every invited member
must fund those changes from the same treasury. A repeated request or an obsolete choice
must not spend again, and a rejected payment must leave the island unchanged.

## What

- Isolated Python intent models and catalogue-derived rules, plus a service-only SQL
  transaction for research, paid tower skills, free house roles, tower trees and wreck gifts.
- Research and building progression revisions, immutable domain receipts and the common
  operation claim protect both free and paid actions against changed intent and ABA races.
- Research choices may be switched by any current invited member at the tier's current
  price. Changing a capstone clears the superseded capstone on affected towers. Research
  tiers, tower prerequisites and unlocks use the target island's progress.
- Wreck gifts use the existing catalogue amounts; the final gift is capped to the exact
  remaining repair cost. A concurrent gift may reduce the charge, never increase a quote.
- All prices are server catalogue prices, without an Engineer discount. Personal wallets,
  Captain levels and Engineer commitments are not involved.
- Tower gates combine the direct spot unlock and campaign spot unlock; tree purchases also
  include the selected tree tier's unlock. The locked target island record supplies progress.
- The historical research total becomes a finite positive integral numeric value, preserving
  existing values while allowing repeated switches beyond the old lifetime total ceiling.
  Research totals and all new progression revisions are decimal strings in JSON.
- Legacy research, tower and wreck RPCs fail closed for every admitted island before
  touching a personal wallet. Unadmitted islands retain their existing behavior.
- Under the target island's saved recovery version 1, D059 retires new Workshop, Quick Mend
  and Mason Drill selections. The SQL transaction reads that saved version under the common
  idle guard. A caller's rule metadata cannot downgrade it. Rejection costs nothing and
  retains no operation claim. Version 0 keeps its existing catalogue behavior.
- Existing retired identifiers and research tiers remain readable. Committed receipts still
  replay; an unchanged stored tower/house selection keeps its ordinary free no-op behavior.
  A stored Mason Drill choice permits later research tiers and unrelated purchases. Tavern,
  Barracks and Bastion's maximum-HP benefit remain available. There are no automatic
  replacements or refunds.

**Files:** `backend/server/island/economy_progression*.py`, focused Python and PostgreSQL
tests, and additive migrations `20261118050500_*` and `20261118050501_*`.

## Transaction contract

The trusted service supplies actor/account/epoch, an action UID, a strictly checked user
intent and the current catalogue rules. The user intent includes an accepted decimal-string
price. Research also pins the previous tier, choices and revision; tower actions pin the
building instance, kind, level, skill, tree tiers and revision. Catalogue rules are excluded
from retry identity so a successful old request remains replayable after a catalogue change.

The lock order is the common island scope guard, account, island, admission/recovery and
domain rows. This domain needs no personal Captain locks. A mutation requires an active
current account and current island membership. The shared idle helper rejects every
unfinished wave or accepted recovery reservation, including one with an expired timestamp;
no financial or phase reservation is automatically expired here.

A shared immutable actor/action-UID claim precedes any free or paid mutation. Financial
effects use deterministic child UIDs; domain receipts hold the complete original outcome.
Exact retries return that receipt separately from a fresh originating-account treasury
projection. A departed member can receive their own receipt without current island assets
or balances. Retired accounts cannot accept new purchases. All asset changes, financial
effects, claims and receipts commit together or roll back together.

A paid action verifies the committed financial child itself: actor, account, epoch, child
UID, spend kind, reason, reference, exact debit and zero committed delta must all match.
The helper's receipt must equal the immutable stored receipt. A successful-looking helper
reply with another same-account receipt or different fields refuses as `action_conflict`
and rolls back the root claim, debit and progression together.

Dependencies are the MP-ECO-02 treasury and operation-claim primitives, the MP-ECO-04
`island_economy_require_idle_locked` helper, and existing structure-recovery refresh hooks.
Missing prerequisites fail closed. No live economy admission or route activation is added.

`island_economy_progression_state(actor, account, epoch)` supplies a coherent current-member
snapshot under the scope/account/island locks. Its Python `read_state` adapter returns the
common `economy` envelope, `bestWave`, `wreckPaid`, bounded `research` and `buildings` arrays.
Each research row includes branch, tier, both choices, exact revision and cumulative
`coinsPaid`; each building includes spot, immutable instance, kind, base level, skill, both
tree tiers and exact revision. The snapshot is readable during a wave. It contains no
historical personal payer identities. Mutations independently require the idle phase.

`island_economy_progression(actor, account, epoch, actionUid, intent, rule)` returns
`{status: 'done', repeat, currentEconomy, receipt}`. The immutable receipt has `receiptId`,
`actorId`, `actionUid`, `action`, `origin` and `result`. Its result contains decimal-string
`chargedCoins`, optional `treasuryReceiptId`, and the original research/building/wreck
outcome. `currentEconomy` is null after the original actor leaves the island or the origin
stops being the current active admitted account/epoch. A downstream
refusal rolls back the early operation claim as well as every financial or asset effect.

## Out of scope

Route/client activation, session authority, wave settlement, personal skill progression,
construction refunds, save conversion, reset/delete and live database changes belong to
their corresponding economy tasks. Research and skill payments are not a construction
refund basis.

## Tests to write first

| Test | Evidence |
|---|---|
| Catalogue quote/model tests | Strict expected state, current prices and island unlock rules; no Captain discount |
| Member progression and choices | Invited members advance and reverse research; old capstones are removed atomically |
| Stale and ABA research/tower requests | One valid change; obsolete parallel choice never charges again |
| Wreck completion race | Contributions never exceed the exact goal and retries do not charge twice |
| Insufficient funds, committed funds, stale epoch and active reservation | No assets, claims or receipts survive rejection |
| Changed UID intent and cross-domain free/paid collision | Global immutable intent binding prevents a second effect |
| Legacy guards and grants | Shared islands cannot spend private money; aliases remain private after double migration application |

## Verification and remaining integration

The initial implementation was verified on the treasury operation, personal Captain and
shared construction dependencies:

- `cd backend && uv run ruff check .`: passed.
- `uv run pytest -q --ignore=server/tests/correctness/test_settings_contract.py`:
  **12,655 passed, 309 skipped** in 172.44 seconds. This is the documented quicker backend
  suite; the exhaustive settings matrix was not rerun for this domain-only change.
- Focused progression, historical wrapper and real PostgreSQL tests: **72 passed** in
  7.56 seconds, including 35 progression database cases and 23 Python domain/service cases.
- Real PostgreSQL economy dependency group: **127 passed** in 10.60 seconds.
- Real PostgreSQL existing island behavior plus progression group: **423 passed** in
  26.13 seconds. The 35 progression cases occur in both database groups.
- All **73 migrations** parsed with `pglast` and applied **twice** in each scratch database.
  The new concurrency cases use separate disposable clusters and preserve other fixtures.

After merging the updated main and implementing D059's saved-version retirement, the
affected checks passed again: **89 passed** in 9.43 seconds, including **49 real PostgreSQL**
cases, **26 domain/service Python** cases and **14 historical wrapper** checks. Full backend
Ruff passed. These checks add retirement refusal with no effects, all three pre-v1 receipt
replays after v1 admission, non-v1 preservation, saved-policy downgrade resistance, and a
real health refresh that retains Bastion's 90 HP on a base-60-HP wall. Actual retirement,
pointer replacement and admission pause checks retain the immutable own receipt while
withholding the fresh projection. Updated direct spot unlocks reject new skill/tree charges
without invalidating successful original receipts. The broad suites above
precede this narrow policy follow-up; they are not claimed as fresh post-follow-up runs.

Those earlier database groups were collected in separate fresh processes because dependency
race fixtures committed records into a shared test database. The dependencies now isolate
those fixtures; the combined final integration run below passes without changing legacy
count assertions. Inline numeric checks preserve legacy invoker permissions, covered by an
explicit invoker-build regression test. Historical SQL text checks explicitly verify the
shared wrapper and its preserved original body.

Database checks are opt-in and use `CASE_PG_SCRATCH=1 uv run --with pgserver
--with 'psycopg[binary]' pytest -q ...`. The dependency group names
`test_island_treasury_sql.py`, `test_economy_operations_sql.py`,
`test_personal_captain_sql.py`, `test_shared_construction_sql.py` and
`test_economy_progression_sql.py` in `server/tests/island_sql/`. The existing-behavior
group collects that directory while ignoring the first four files. Each process uses
only a newly created local Unix-socket database, without configured URLs or credentials.

Route integration must resolve authenticated economy authority and supply the current
catalogue. An unavailable current offer still reaches SQL so an original receipt can replay;
a new unavailable offer is refused with no retained claim. Browser flows and live database
behavior are not verified here. No route, economy admission or feature flag is activated.

## Owner and reviewer

- **Responsible teammate:** Ianno Hollensteiner
- **Coding agent:** Codex; the responsible teammate reviews its output.
- **Human reviewer:** pending
- **Last updated:** 2026-11-18


## Saved existing defenses with offers disabled

Skill and tree intents for an existing structure may quote its known gated kind and spot
after offer flags are disabled. The adapter uses the existing-structure catalogue helper
for that exact expected kind and spot; PostgreSQL still proves the actual stored instance,
kind, level and revision before spending. This grants no construction/rebuild availability
and does not expand research or wreck offers. Removed offers continue through the existing
unavailable-rule path so immutable authorized receipts can replay.


## Final dependency and main integration checks

The branch includes actual shared construction `9191a698` with personal Captain `4005fb53`
and treasury `feca459f`, plus main `64d59506`. Incoming main changes retain saved-defense,
recovery-option, wave-reward and revival fixes. Duplicate foundation additions use the
reviewed dependency source; progression SQL is unchanged by the merges. Review the nine
progression paths separately from incoming dependency and main files.

The progression, two construction, personal-operation and legacy islands/waves suites
passed **156 PostgreSQL tests** in 17.34 seconds in one process, applying the full migration
chain twice. This includes **58 progression cases** and nine new adapter-to-SQL saved-defense
checks. Saved v1 extra-slot skills and tree upgrades, including culverins, charge the exact
current island price once and replay the original receipt. Missing structures and false
instance/kind/level/revision expectations leave the coherent current snapshot, personal
wallet and operation registry unchanged. Treasury ledger totals reconcile in every new case.

Progression, both historical SQL-contract, construction and migration-version Python
checks passed **81 tests** in 0.58 seconds. Full backend Ruff passed, and all **78 migration
versions** were unique and parsed. Earlier broad backend results remain scoped to their
recorded revisions. No browser flow, registered shared HTTP route, live migration or
feature activation is claimed by this integration check.

## Financial child receipt verification

A successful helper response previously checked only its status, repeat marker and receipt
identifier. Five disposable PostgreSQL regressions demonstrated that an unrelated real
same-account receipt, a real debit with the wrong amount/reason/reference, or an altered
returned receipt could still complete research. The transaction now proves the exact
committed child debit and its complete immutable receipt before changing progression.
Any mismatch returns `action_conflict` and rolls back the root claim and all new effects.

The five regressions failed before the correction and passed afterward. The complete
progression module then passed **63 PostgreSQL cases in 12.39 seconds**; the focused
progression/model, historical contract and migration-version selection passed **41 Python
checks in 0.49 seconds**, and backend-wide Ruff passed. The full migration chain applies
twice on a disposable database. The substituted helper bodies are confined to rollback-only
test transactions; no browser or service role gains permission to replace production SQL.
These checks do not establish live admission, route integration or deployment.

With main `f606412f` and reviewed construction `58a66646` integrated, the five-suite
PostgreSQL selection recorded above passed **169 tests in 21.67 seconds**: progression,
both construction modules, personal operations and legacy islands/waves. This includes the
five progression child-proof regressions and eight construction debit/refund regressions.
The corresponding six-module Python command above passed **81 tests in 0.51 seconds**.
All nine component paths remain isolated in the comparison against construction; only the
charge-proof migration, its tests and this specification change from the published
progression component. Prices, public signatures, free selections and admission remain
unchanged.
