# MP-ECO-21: shared economy release and recovery runbook

> **What this is:** a reviewable sequence for releasing and pausing the shared island economy while preserving saved modes, original financial obligations and personal progress.
>
> **Who uses it:** the responsible release operator, reviewers and maintainers investigating a failed rollout.

- **Status:** specification and runbook preparation only; all operational steps below are pending.
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.
- **Issue:** [#513](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/513), under [epic #492](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/492).
- **Branch:** `docs/mp-eco-21-release`.
- **Prerequisites:** MP-ECO-20 integrated acceptance, its MP-ECO-01–19/22 dependencies and the separately authorized release action. Source inspection and isolated foundation tests are not that acceptance.
- **Related procedures:** [release checklist](../docs/RELEASE-CHECKLIST.md), [reliability runbook](../docs/RUNBOOK.md), [database procedure](../supabase/README.md#apply-before-you-merge), [engineering checks](../docs/ENGINEERING.md#3-commands) and [agreed economy rules](../docs/DECISIONS.md#shared-island-economy-2026-11-18).

This package grants no permission to publish a branch, deploy, apply a live migration, change live configuration, collect player data or admit an island. Existing release-document standing authorization does not extend this preparation task. A different human reviewer must approve the exact candidate, and the actual operation requires its own authorization.

## Release record and hard stop conditions

Before any operational step, record one immutable candidate: source/merge SHA; backend and frontend artifact identities; ordered migration filenames, content hashes and expected live history; catalogue and conversion-policy digests; supported island/recovery/personal versions; exact admission/pause controls; accepted test evidence; protected backup and restore-rehearsal references; responsible human and independent reviewer. Keep credentials, player IDs, invite codes, raw snapshots and authenticated response bodies out of Git, public evidence and logs. Record safe counts, digests and statuses instead.

The record is incomplete until it names real, implemented controls and commands. Do not substitute a proposed environment variable, an undocumented SQL update or an unregistered router for a tested operational path. Every checkpoint records UTC time, exact revision/command, outcome and evidence boundary. “Not run”, skipped and fixture-only checks remain distinguishable from passing integrated or authenticated checks.

Stop before admission if any of these is unresolved:

- Registry first-apply/reapply cutover, concurrent admission/writes and DDL/runtime lock order lack an independently reviewed, tested stable revision. The current registry correction remains pending; no live application or successful cutover rehearsal is claimed here.
- Any reachable read/mutation, older client, background worker, automatic guest cleanup or deletion path can bypass persisted mode/epoch or personal progression version.
- Canonical bell/session/finish/expiry, retained-slot input, background copy return or account-deleted participant disposition is missing. An open browser must not be the only settlement executor.
- Conversion lacks an approved opening grant, actual-cost/refund mapping, original-obligation classification, personal entitlement mapping or deletion/retention policy. Unsealed waves/recovery journals cannot be reinterpreted during admission.
- Reset's outstanding-obligation policy, owner deletion/transfer, privacy changes, or a supported wager/ship-reward origin is undecided or unimplemented.
- MP-ECO-19 balance and MP-ECO-20 authenticated multiplayer/compatibility evidence is absent. An exact ledger is not evidence of playable balance.

No exception introduces a wager cap, member spending restriction, private-wallet import, bailout, easy recovery wave or non-owner reset. Whole-treasury betting, equal member research reversal/demolition, personal Captain progression and the chosen owner-reset recovery rule remain the accepted product behavior.

## Dependency order: schema is separate from activation

Freeze an exact integration manifest from the candidate, not from this provisional list. Apply prerequisite migrations in repository timestamp order, one reviewed file per operation, checking the live history before each file. Do not skip an older file because a later function creates successfully: PL/pgSQL can defer missing-helper failures until first use.

| Ordered schema group | Known candidate files or required deliverable | Required before use |
|---|---|---|
| Existing baseline | All candidate predecessors through `20261118040000_playtest.sql`, including the complete structure-recovery chain. | Existing live schema/history and function definitions match the candidate's expectations. Repository presence does not prove live application. |
| Treasury identity and primitives | `20261118050000_island_treasury.sql`, then `20261118050100_island_treasury_functions.sql`. | Accounts, exact money constraints, scope locks, immutable ledger and restrictive privileges exist. No island is admitted by schema installation. |
| Global operation identities | Reviewed corrected `20261118050150_island_economy_operations.sql` and any approved follow-up in the exact manifest. | Complete raw-history mapping, child proof, reserved prefixes and online/offline cutover protocol pass first-apply/reapply/concurrency checks. Do not apply the known-unresolved revision. |
| Canonical wave accounting | `20261118050200_wave_treasury_settlement.sql`. | Its table/function creation may precede personal helpers by timestamp; invocation waits for the complete personal and canonical lifecycle implementations. |
| Global personal progression | `20261118050300_personal_captain_progress.sql`, `20261118050310_personal_captain_revisions.sql` and candidate follow-ups. | Explicit initialization/mapping, root operation linkage, revision guards and atomic legacy Captain/session guards exist. GET initializes nothing. |
| Shared permanent purchases | `20261118050400_island_economy_construction.sql`, `20261118050401_island_economy_construction_legacy_guards.sql`, `20261118050500_island_economy_progression.sql`, `20261118050501_island_progression_legacy_guards.sql`, `20261118050600_island_economy_crew.sql`, `20261118050601_island_economy_crew_legacy_guard.sql`. | Phase, membership, actual-cost/refund and legacy guards are verified together with their helpers. |
| Remaining integrated schema | Exact reviewed files from arsenal/holder lifecycle, session authority and closure, recovery/paid repairs, wagers, ship rewards, reset/deletion and executable conversion. | Filenames/timestamps and dependency revisions must be supplied by the completed implementations. This runbook reserves none and cannot activate a partially present group. |

Migration order is chronological; runtime readiness follows the dependency graph. MP-ECO-02/root identities precede domain invocation. MP-ECO-07 personal state must exist before bell/Engineer/finish hooks run. MP-ECO-08's Python policy needs the actual server-persisted authority provider and atomic mutation checks. MP-ECO-03 closure needs MP-ECO-11 outcome/session authority and MP-ECO-07 effects in one transaction. MP-ECO-10/11/12 must cover offline departure, expiry, copy return and both wave protocols. MP-ECO-14/15/16 must agree on original accounts and reset boundaries before executable MP-ECO-17 conversion. MP-ECO-18 UI readiness precedes admission; MP-ECO-19/20 evidence precedes release approval.

For every migration, verify actual function definitions/ownership, RLS, table and function grants, history/version and expected object counts; do not rely only on a schema-name check. Private helper execution and direct table writes remain denied as specified. Repeat installation creates no balance, grant, receipt duplication or private-to-shared mapping. Failure stops the sequence; resume from proven migration history rather than blindly rerunning a mixed batch.

Migrations that replace a reachable legacy function or install a ledger trigger need a reviewed compatibility/cutover procedure even before shared admission. Prove writer quiescence or the complete safe online lock protocol, including first admission of an owner not in an earlier account scan. Tests with no concurrent writers do not prove this. Backup/migration relation locks must not invert runtime scope/account/profile locks. The registry's specific protocol remains blocked until its correction passes independent review.

## Backup and conversion rehearsal

An authorized operator first verifies a consistent, restorable backup and its retention/access policy. Record coverage of schema, migration history, required account/asset/payment/operation/obligation rows and relevant identity relationships. A wallet balance export or a list of row counts is not a conversion backup. Never copy credentials, live auth tokens or unrestricted private snapshots into a development repository or public artifact.

Restore the backup into an isolated, access-restricted environment using an approved redaction/identity mapping that preserves the relationships under test. Disable external provider effects and outbound settlement jobs there. Do not point a rehearsal at the production Supabase URL; previews can share that database. Record the actual backup/restore mechanism and command once selected; this spec has not exercised a provider restore.

Run MP-ECO-17's versioned offline audit against a consistent supplied snapshot and approved policy manifest. A collector must be genuinely read-only; `island_open`, arsenal conversion-on-read and grants are not snapshot tools. Bind the report to source schema/revision, catalogue/policy digests, source fingerprints, exact write-set digest and the one admission identity. Classify every old personal wager/position, closed-but-unclaimed wave, fee, refund and ship reward. An inactive feature is not proof of no outstanding obligations.

Rehearse the complete admission transaction, failure injections and identical/altered retries on the restored data. Revalidate source and permissions under the actual ordered locks immediately before committing; if assets, personal state, claims, membership or an unmapped obligation changed, abort and regenerate the preview. A preview made before guest deletion or another refund cannot silently authorize a later snapshot.

Reconcile before/after by exact identity sets and integer values:

| Family | Required invariant |
|---|---|
| Private wallets/obligations | No conversion pooling, wiping, duplicated grant or reassignment. Legitimate independent late private settlements remain private and are distinguished by their own receipts. |
| Shared account | `balance = sum(balance_delta)`; `committed = sum(committed_delta) = sum(unclosed reserved principal)`; `available = balance - committed >= 0`; financial revision matches committed ledger history. New-run capital has one approved origin receipt. |
| Operations/history | Every converted root has one matching immutable domain result; financial children match actor/account/epoch. No orphan root, altered replay, deleted receipt or duplicated raw-history identity exists. |
| Assets/refunds | Preserve acquired building/copy identities, eligible actual paid amounts and already-refunded state. Stored plus carried copies count toward the selected total capacity of 20; grandfather excess and prevent new purchases, while returns remain possible. |
| Personal progress | Preserve acquired levels, actual known skills, genuine points from personal wins and covered milestones. Never derive unearned personal wins from an owned island record. Preserve Engineer generation/assignment and its frozen receipt linkage. |
| Wave/product origins | One canonical attempt payout, separate durable personal completion facts, original mode/account/epoch for every wager/ship/legacy claim and no reinterpretation of a terminal loss/expiry. |

Run the same report/manifest twice; the second application must return its original conversion result, with no new account, assets, grant or milestones. Inject failure after account/grant/mapping writes and prove zero partial publication. Rehearse pause and recovery after a committed later purchase/settlement; restoring the preconversion snapshot over those effects is forbidden.

## Compatible server and client sequence

1. Complete scratch/integration acceptance and human review; select exact artifacts and operational controls. Keep new admission disabled and initialize no live personal profiles.
2. Under separate authorization, install and verify the complete reviewed schema/cutover prerequisites. Do not deploy server code that unconditionally reads absent new objects. Preserve a compatible known-good build.
3. Deploy the compatible server with admission and new offers closed. Verify actual backend deployment identity and persisted-mode, personal-version and legacy-path guards across the serving deployment. A static homepage/build stamp or process-only `/api/health` does not prove the backend schema or a shared transaction.
4. Deliver the compatible client, with actual startup/adapter wiring for context negotiation, strict scoped money strings, unknown-outcome retries, global personal v1 and historical-versus-current reply handling. Logical server readiness must precede client use. If the platform deploys both services together, stage a compatible dormant build first; do not assume an arbitrary separate backend deploy operation exists.
5. Prove the authenticated compatibility matrix and the selected pilot's read-only conversion preview. Only after explicit activation authorization admit the named pilot through the reviewed transaction. Reconcile immediately, then exercise the approved pilot acceptance plan. Expand admission only after reviewing that evidence.

Do not roll out through an old serving backend/client merely because a global flag is off. SQL guards must reject stale legacy writers atomically when admission races their request. New context errors never fall back to a private wallet. The old client must be refused before it receives a shared island snapshot and presents ambiguous personal purchase controls.

The readiness inventory names every reachable mutation/read path, its mode resolver, atomic guard, stored origin and pause behavior. Include direct and old-alias RPC access, both wave protocols, legacy participant claims, personal Captain endpoints, island open/reset, construction/refunds, crew/research, arsenal, ship games, market calls/leveraged positions/fees, sports, predictions, duels, class Harbor/Pirate Point, and automatic expiry/guest cleanup. Explicitly classify unsupported products as unavailable in shared mode; do not rely on a hidden UI or an inactive feature to prevent a direct call. Class and private accounting remain separate, without importing island cash or rerouting old private claims.

### Read capability, HTTP and caches

Shared initial/related reads require `X-Island-Economy-Version: 1`; the first authorized read can omit the epoch. Missing capability returns `409 economy_context_required`, unsupported declared versions return `409 economy_version_mismatch`, with no shared snapshot. Authentication and current membership remain required. Legacy-island reads keep their legacy contract with or without that header. Shared mutations require the explicit owner/version/epoch envelope, with actor/account/price derived server-side.

The current source uses same-origin Vercel `/api` rewrites and Vite `/api` proxies; it declares no backend CORS middleware. Verify that each deployed/proxied same-origin transport actually forwards the capability header. Do not add permissive CORS to solve an unrelated error. If a cross-origin API is deliberately supported, document its exact allowed origins/methods/request headers and test real browser preflight for `Authorization`, `Content-Type` and the capability header, plus standard JSON/no-store errors. Header-name case normalization is normal; stripping the header is not. Missing/failed preflight must not provoke a legacy retry. No blanket wildcard credential policy is implied.

Authenticated snapshots/receipts and context errors stay private/no-store; no CDN/browser cache may serve another account/epoch or capability-incompatible snapshot. Test a stale tab, delayed old-island response, reset during an in-flight read, unknown version and a money/revision value above JavaScript's exact integer range. Refresh current projections only for their authorized matching scope/revision; never install an immutable historical effect as today's treasury.

Personal `progressionVersion: 1` is global, independent of the visited island's economy. The compatible client uses personal v1 even on a legacy island, and old level/role/skill/respec/session RPCs refuse or correctly adapt an initialized profile under locks. GET `/api/captain` creates nothing. Missing profile, stale revision, active global assignment and pending Engineer obligation have their explicit domain responses. A zero-shared-island count is therefore not sufficient evidence that a pre-personal-v1 server is safe to restore.

## Pause an admitted economy safely

The release record must supply a tested operator control for each step; none is an implemented command in this spec.

1. Stop **new admission** first, without deleting admitted state. Stop new personal conversion/init work as part of that boundary. A global switch selects offers/admission, never a player's saved economic version.
2. Persist `admission_state = paused` for the affected admitted islands through the reviewed ordered transaction. Preserve account IDs, epochs, balances, holds, operation receipts and the current shared pointer. Verify every newly initiated shared mutation checks this state atomically, including free changes and bells. Hiding a button or changing config on one process is insufficient.
3. Keep compatible receipt/context reads, existing authorized combat/withdrawal lifecycle, canonical outcome/HP closure, pending copy returns and saved-origin financial settlement available. Block new discretionary spending, bets, purchases, paid repairs and shared reward-game starts; do not consume their UID/quota on refusal. Required original settlement/personal completion is not a newly authorized purchase and cannot require the initiator to rejoin.
4. Preserve global personal version/Engineer rules and legacy origin boundaries. Do not switch market/sports/islands off as a substitute until their exact flag behavior is proven to preserve required old settlement and closure execution. Safe personal configuration still follows its own assignment/binding guards, not an unrelated spectated island's pause.
5. Reconcile affected origins and inspect safe error/latency/count aggregates. If a particular executor is itself corrupt, isolate that executor and retain its durable pending obligations for a reviewed fix; never guess outcomes, silently drop holds or reroute them. Record the unresolved backlog and recovery step explicitly.

Pause can stop new rounds and paid combat repair, so prove that already accepted rounds reach their canonical terminal state without those optional actions, including when every browser is gone. The 60-second retained-session grace and deterministic succession follow the accepted session contract; pausing offers must not reset grace or duplicate an assignment. A completed payout continues to appear once in its original account, including a retired account under the selected reset policy.

## Failure handling and rollback boundaries

| Observed failure | Safe response | Required proof before resume |
|---|---|---|
| Schema/cutover fails before admission | Stop; inspect actual transaction/history/object state. Retain successful additive predecessors and fix forward. Do not blindly mark a migration applied. | Exact stored definitions/checksums/privileges and reviewed repeat/cutover behavior. |
| Admission or reset rejects before commit | The encompassing SQL transaction leaves the original run intact. Query the original operation using the same identity if outcome is unknown. | No orphan claim/account, partial assets, duplicate starting grant or changed pointer. |
| HTTP timeout after a possible commit | Retain the original action UID/payload/origin and retrieve/retry that operation. Do not generate another UID, refund speculatively or repeat admission with another manifest. | Original immutable result and separately authorized fresh state reconcile with the ledger/assets. |
| Fault after an island/profile was converted | Pause new admission/offers and retain a compatible server/client. Repair with reviewed code or an explicit corrective transaction referencing the original receipts. | Exact money/assets/entitlement reconciliation and idempotent retry/settlement evidence. |
| Bad frontend/API deploy | Restore only a known-good deployment that supports every persisted economic, personal and recovery version and required original settlements. If none exists, keep the compatible guarded service paused and fix forward. | Backend/frontend deployment identities, origin/context reads, unchanged grants/holds and authenticated compatibility checks. |
| Late settlement while reset/pause occurs | Execute exactly once against saved original account/mode/epoch, or keep it durably pending if its executor is unavailable. | Replacement account/private wallet unchanged; source hold closes once with returned principal/fees accounted once. |

Database changes are forward-only for this release. Do not drop new tables/guards, delete ledger/operation/participation rows, remove shared pointers, change admitted islands back to legacy, clear personal Engineer generations, copy balances to private wallets or run legacy fresh-start as rollback. Do not overwrite a committed run with an old snapshot after later actions. A backup restore is rehearsed recovery into an isolated target; replacing a live database requires a separately reviewed plan covering every concurrent account and post-backup effect, rather than an island-level undo shortcut.

Resume by correcting the fault, rerunning the affected negative/concurrency and compatibility checks, reconciling the pending backlog and clearing only the persisted pause through the approved control. New admission remains closed until its separate gate is reviewed. Re-enabling offers never replays initialization, legacy payouts, starting capital or personal milestones.

## Verification to perform and evidence to retain

This preparation changes documentation only. Link/content/whitespace checks apply now; no application test, migration execution, backup/restore, live read, provider call, deployment or activation has been performed for this task.

Preparation checks on 18 Nov 2026: all five relative documentation links and anchors resolve; code fences and content checks pass; the complete specification was read against the current release, transport, feature and economy contracts; whitespace checks pass. The two GitHub issue links are supplied references, not remotely fetched evidence.

For the final candidate, record actual results from the documented gates, from the indicated directories:

```sh
# backend/
uv run ruff check .
uv run pytest -q
CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q --tb=no
# frontend/
npm test
npm run build
CHROME_PATH=/usr/bin/chromium npm run test:mp
CHROME_PATH=/usr/bin/chromium npm run test:arsenal
CHROME_PATH=/usr/bin/chromium npm run test:recovery:component
```

Inspect skips and real command availability in the frozen candidate. Those existing local browser scripts are fixture evidence unless their actual implementation proves authenticated shared mode; they do not replace MP-ECO-20's real multi-client journey or physical-device checks. Record the exact additional route/session/conversion/pause/cutover commands from their completed implementations before release. A pglast parse and empty-database apply/reapply cannot replace populated cutover races or restored-data rehearsal.

The authenticated pilot acceptance must include one canonical payout with concurrent participant retries; simultaneous purchase/whole-treasury bet; visitor crew/weapon purchase; two tabs/reconnect and frozen roster; old-client/header refusal; cross-island/global personal v1; demolition with actual-cost refund; zero-funds owner-only recovery; reset with selected old-obligation handling; member/guest/owner deletion disposition; late old/private claims; and a full pause/recovery with no browser remaining. Reconcile all identities and funds after each relevant boundary. Product terms, provider clocks/eligibility and unrestricted stake sizes are unchanged by the test.

Use the existing signed-out smoke only after a separately authorized deployment and against its actual commit. It proves public responses/build identity, not account balances, database readiness or canonical multiplayer. No money-changing live action, production load test or provider settlement is an availability probe. Preserve existing CSP, provider settings and the no-Vercel-crons rule.

## Remaining delivery

Finalize the exact migration/artifact/control manifest after integrated dependencies and decisions are complete; obtain the reviewed registry correction; implement and rehearse conversion/deletion/pause controls; complete MP-ECO-19/20 evidence and the protected restore rehearsal. Then update the canonical release/reliability documents, INTERFACES, policy matrix, TEST-MAP, WALKTHROUGH and shipped player/privacy guidance with verified results. This spec does not mark MP-ECO-21 release acceptance complete.

Last updated: 2026-11-18.
