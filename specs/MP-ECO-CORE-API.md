# Shared island core HTTP integration

> **What this is:** coherent shared island reads, exact quoted HTTP intents and immutable domain receipt responses.
>
> **Who uses it:** the island routes, authenticated client adapters and core integration tests.

- **Status:** local implementation; no shared admission, conversion or lifecycle activation.
- **Branch:** `feat/mp-eco-core-api`.
- **Issue:** [#518](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/518).
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.
- **Reviewer:** a different human teammate, not yet assigned.

## Problem and scope

Legacy island views combine personal wallets and crew with target structures, and existing route models omit shared instance/CAS/quote fields. They cannot represent one shared island truth or an immutable purchase receipt. An old-epoch retry also cannot be rejected solely because its actor departed or its origin is no longer the current run.

Keep existing route URLs and truly legacy request/response behavior. Resolve persisted mode read-only before dispatch, never from a feature flag or the presence of an envelope alone. Add one coherent member snapshot boundary in `20261118050700_island_economy_snapshot.sql`, strict shared request/response modules and bounded dispatch in `routes/island.py`. Register the existing global personal Captain router only with the required atomic legacy guards.

Reuse the treasury/operation, construction, progression, crew, Captain and permission foundations. New shared mutations require the actual persisted authority provider plus their existing atomic domain checks. Missing canonical authority returns `economy_path_unavailable`; this package creates no synthetic authority/session provider. Read-only member snapshots authorize within their own transaction without inventing leadership.

## Shared read contract

GET `/api/island` and `/api/island/visit/{code}` require `X-Island-Economy-Version: 1` for shared mode. Initial reads need no epoch. Missing/unsupported capability refuses before exposing shared state. Legacy reads keep their existing contract. No read imports a Captain, opens/grants an adopted island, expires a wave or converts legacy arsenal data.

The shared response has `snapshotVersion: 1`, authenticated `actorId`, `code`, `ownerName`, the standard exact-string `economy`, `admissionState`, `waveBest`, positive `nextWave`, nonnegative integer `flags`, `crew`, `crewOffers`, `personalCaptain`, `spots`, `research`, `wreck`, `layout`, `quotes`, `recoveryVersion`, `waveProtocol`, `serverNow` and `capabilities`. There is no top-level personal `coins` or fabricated arsenal/session state.

- `personalCaptain` is the existing `{captain, skills}` projection, or null only after a locked lookup proves no managed profile. Transport/schema/parse failure is never unadopted mode.
- `spots` contain `id`, `kind`, `kinds`, `built`, `level`, `instanceId`, `spec`, `treeA`, `treeB`, decimal-string `revision`, numeric `x`/`z`, nullable integer `hpUnits` and nullable numeric `maxHP`. Empty spots have level zero, null instance/spec and zero tree/CAS state. Shared prices come only from authoritative quotes.
- `research` rows contain `branch`, `tier`, `choice2`, `choice3`, decimal-string `revision` and `coinsPaid`. Missing branches have tier zero, null choices and zero revision/payment.
- `wreck` contains exact-string `paidCoins` and `goalCoins`. Gift selectors come from the quote collection; their bounded integer `amount` retains the existing progression intent contract.
- `layout` contains `version`, numeric `grid` and `movable: false`; current stored coordinates remain visible. Shared movement is outside this increment.
- `crewOffers` retain the existing authoritative crew/count/`priceCoins`/maximum/unlock/availability contract. Stored Carpenter counts survive; new Carpenter purchases remain unavailable.
- `capabilities` explicitly marks `arsenal`, `session`, `move`, `repair`, `reset`, `market` and `match` unavailable with `economy_path_unavailable`. An omitted implementation never means empty stock or an invented live roster. No new stake limit is introduced.

Take scope/account locks, then the actor/owner public profile anchors in UUID order with `FOR NO KEY UPDATE` and the actor's existing managed state, then target island/admission/asset rows. The owner anchor keeps the displayed name coherent. Recheck current account/epoch and membership under those locks. Read target economy, crew, progress, buildings, research, layout and health at one boundary; capture one server time for projections. Paused member snapshots remain readable. Active or unfinished reservations are not expired by reading; their health remains explicitly unavailable rather than guessed from an unrelated live journal.

Treasury revision orders money only. Clients use read-request generations for whole-snapshot replacement and the personal revision for Captain projections. Free island choices retain their own domain CAS revisions; no global world revision is invented.

## Exact quotes and shared mutation bodies

`quotes` has `build`, `upgrade`, `demolish`, `research`, `towerSkill`, `towerTree` and `wreck` arrays. Every row has `target`, `intent`, `available` and nullable `reason`. `target` is always present, even when `intent` is null:

| Group | Target selector | Exact intent fields |
|---|---|---|
| build | `spot`, `kind` | `spot`, `kind`, `instanceId: null`, `expectedLevel: 0`, `quotedCoins` |
| upgrade/demolish | `spot` | `spot`, `kind`, `instanceId`, `expectedLevel`, `quotedCoins` |
| research | `branch`, `tier`, `choice`, `change` | same selector, `expected: {tier, choice2, choice3, revision}`, `quotedCoins` |
| towerSkill | `spot`, `spec` | same selector, `expected: {instanceId, kind, level, spec, treeA, treeB, revision}`, `quotedCoins` |
| towerTree | `spot`, `path`, `tier` | same selector, the complete expected building state above, `quotedCoins` |
| wreck | `amount` | `amount`, `quotedCoins` |

The client copies the complete prepared intent and adds one root `actionUid`, optional `code` and exactly `economy: {mode: 'island_shared', version: 1, islandOwner, runEpoch}`. The endpoint fixes the domain action. No body may choose an actor, payer, account, authority, catalogue or dispatch action. All shared models reject extra fields, boolean/float integer coercion and noncanonical decimal strings. Shared hire needs only `crew`, root identity, envelope and optional code; its server-owned price/count are not client assertions.

Unavailable offers retain exact intent when its price/target is known. Missing personal pricing state, missing actual refund lineage or an inapplicable target produces no invented intent. Paused admission and other domain restrictions keep offers unavailable. Never infer an actual refund or eligible price from bundled client data. GET `/api/island/demolish` returns `{quoteVersion: 1, actorId, economy, quote}` for shared mode; missing eligible basis remains `construction_basis_missing`.

## Historical replay and receipt responses

Before current epoch/membership/phase preflight, resolve an existing authenticated actor/root UID read-only to its immutable original account/epoch/domain. Opaque financial identities, changed origin or another domain conflict. The lookup inserts no claim and grants no mutation authority. Existing domain RPCs still validate the complete exact intent/fingerprint and original receipt. New roots resolve current state and require the actual authority provider.

Shared POST success returns the existing domain `{status, repeat, receipt, currentEconomy}` shape unchanged; crew additionally retains its current crew/progress fields. Nullable historical projections are valid. Follow with an independently coherent GET; refresh failure or departure never turns a committed receipt into failure or creates a new UID. Unknown outcomes retain the original full intent/root identity. Do not append a late personal snapshot after a domain transaction has already taken island locks.

## Boundaries and acceptance

No admission/create/conversion, generic public money mutation, guessed session/arsenal API, reset implementation, paid repair or frontend code is added here. The included legacy guard dependency fences own-islet/open, global Captain edits and old reset entry points. Canonical session/lifecycle mappings and their remaining legacy compatibility fences are separate release dependencies; no missing authority is inferred from the read model.

- [x] Targeted HTTP tests prove own/visited shared reads, capability/auth/feature/budget ordering, paused reads and explicit legacy mode selection without fallback on unknown database state.
- [x] Disposable PostgreSQL proves coherent scope/account/personal/island snapshots, actual refund lineage, no read grants/imports, strict grants and relevant snapshot/mutation races.
- [x] Exact shared bodies reach the existing domain RPCs; old-shaped shared requests refuse, and old-origin/departed retries return only authorized history after exact intent validation.
- [x] Personal v1 registration uses atomic legacy edit/build/open/reset guards; reads never initialize, and the independent global personal GET stays authoritative on legacy-money visits.
- [ ] Existing legacy route/domain tests, focused SQL, Ruff, migration parse and documentation checks pass with exact results recorded.
- [x] No live deployment, provider, admission, authenticated multi-client or missing authority implementation is implied by fixture tests.
- [ ] A different human teammate reviews the eventual change before merge.

## Verification

- Focused Python: **93 passed** across `test_core_economy_routes.py`, `test_economy_http.py`, `test_economy_http_models.py`, `test_shared_snapshot.py` and `test_captain_progression_routes.py`.
- Disposable PostgreSQL: **50 passed**, comprising 16 new snapshot/HTTP cases and 34 existing core legacy-guard cases, with the complete migration chain applied twice. Tests cover real lock waits, atomic purchase/pointer-rotation reads, preserved stale reservations, actual quote execution, missing real authority with no financial claim, and original construction/crew replay after departure without current economy/count projections.
- Full backend: **537186 passed, 321 skipped, 2 failed**. Both failures are exact legacy respec definition assumptions in `test_respec_wave_guards_match_migration.py` after adding the guarded wrapper. Historical pricing assertions and current wrapper delegation must both remain covered; the narrow test-only compatibility correction is pending.
- Full Ruff passed. All **82** SQL migrations parsed, with **82** unique Supabase versions. Whitespace and relative documentation links are checked before the local commit.
- The serialized synthetic server-prepared snapshot was accepted unchanged by the strict client parser through Vite SSR: 22 spots, seven quote groups and seven explicit unsupported capabilities. This verifies wire compatibility, not authenticated live gameplay.

The configured/live database, deployment, admission/conversion, persisted session authority and authenticated multi-client gameplay were not exercised. New shared HTTP actions intentionally refuse without the actual authority provider. Pointer-rotation fixtures demonstrate coherent reads, not a public reset implementation. Human review and publication approval remain required.
