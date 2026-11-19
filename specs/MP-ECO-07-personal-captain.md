# MP-ECO-07 Personal Captain progression and Engineer commitments

> **What this is:** isolated personal progression and generation-specific Engineer persistence for the shared island economy.
>
> **Who uses it:** shared-mode profile adapters, construction transactions and canonical wave completion.

- **Status:** isolated foundation and unregistered personal API implemented and locally verified; application/session/legacy-guard integration remains incomplete. No admission or live conversion.
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`).
- **Branch:** `feat/mp-eco-07-captain`.
- **Issue:** [MP-ECO-07 #508](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/508), under [epic #492](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/492).

## Scope

New personal profiles preserve purchased levels, exact acquired skills, role and genuine earned/unspent points. Legacy points use personal `won_wave_best`; owned-island records never grant points. The current catalogue supplies level thresholds, skill costs/branches and role unlocks. A general XP system and new balance values are outside this change. First initialization preserves purchased level; later valid personal wins apply the configured automatic milestones without lowering that level.

Profiles initialize only through an explicit checked shared-account context. They do not modify legacy island rows or wallets. Profile reallocation is free and uses the player's global assignment, so a spectator may configure their Captain while the viewed island fights. New routes and legacy endpoint guards remain integration prerequisites.

Personal version one remains authoritative on every visited island, including islands with legacy money. `personal_captain_context(player)` reads this global personal mode without importing anything. The private `personal_captain_legacy_guard_locked(player)` lets old Captain/session wrappers atomically refuse managed profiles before locking legacy island state; a preflight-only check is insufficient. Existing unadopted profiles keep legacy behavior. No live admission is allowed until old role/skill/respec/level/wave paths and late valid legacy progress claims are adapted or explicitly refused without losing earned progress.

The 10% Engineer reduction remains limited to eligible construction/building-level upgrades with existing integer rounding. A successful discounted transaction creates or reuses one personal generation. Pending generations survive island changes/reset. Multiple pre-wave purchases require one wave, not one wave per purchase. Failed transactions and retries create no obligation. Free skill respec retains Engineer while bound; selecting another role is refused.

Once a generation has been frozen in a wave, a later successful discounted purchase while personally idle creates a fresh successor generation, even if the earlier wave is unfinished after withdrawal. This carries one pending obligation forward; it does not stack required waves. Further purchases before the successor is frozen reuse it. Without a new purchase, subsequent compatible reservations may freeze the same generation. Any recorded matching normal completion can satisfy that generation, regardless of its latest display attachment; it cannot clear a successor or a different current assignment.

## Persistence and seams

- `personal_captain_profiles`: one personal state/lock anchor per player, pinned catalogue configuration, acquired progression, global assignment, pending Engineer ID and revision.
- `personal_engineer_commitments`: generation identity and its one qualifying completion.
- `personal_captain_wave_snapshots`: immutable personal stats, played wave and frozen Engineer generation for a wave.
- `personal_captain_operations` and `personal_captain_completion_effects`: immutable request/effect identity for free edits and canonical completion.

The additive migration is `20261118050300_personal_captain_progress.sql`. It depends on the MP-ECO-02 scope/context primitives for explicit initialization. Other helpers are private and are not standalone browser or service-role mutation capabilities.

The public `profiles` anchor uses `FOR NO KEY UPDATE`, preserving serialization against personal mutations/deletion while permitting legacy ledger foreign-key `KEY SHARE`. The dedicated `personal_captain_profiles` row still uses `FOR UPDATE`. Using a stronger public-profile lock creates a real cycle with legacy finish holding island/wallet locks before inserting its ledger row.

| SQL seam | Contract |
|---|---|
| `personal_captain_lock_state_locked(player)` | Lock the existing profile anchor/state before island/domain locks; refuse missing initialization. Never import data during construction/bell/finish. |
| `personal_captain_bind_engineer_locked(player)` | Require Engineer and global idle; return/reuse one pending UUID. Raise on failure so enclosing debit/structure changes roll back. |
| `personal_captain_attach_wave_locked(player, wave, played_wave)` | Freeze the personal profile and matching generation, then claim the one global assignment; identical attachment is repeat-safe. |
| `personal_captain_release_assignment_locked(player, wave)` | Release only that assignment; never satisfy a pending Engineer obligation. |
| `personal_captain_complete_locked(player, wave, played_wave, outcome, confirmed_participation, frozen_commitment)` | Consume trusted canonical completion once. Confirmed wins advance personal milestones; confirmed normal wins/losses can satisfy only the frozen generation. Abort/expiry/abandonment or countdown-only presence cannot. |

MP-ECO-03 stores the immutable canonical completion receipt and invokes completion in the same transaction. It must acquire sorted personal locks after scope/accounts and before island/wave locks. MP-ECO-04 combines treasury debit, structure/payment and Engineer binding in one transaction with the same order. MP-ECO-11 uses attachment/release for accepted bell, withdrawal and cleanup; no browser flag authorizes these helpers. Missing profile/hook fails closed rather than skipping an effect.

Completion checks the stored wave snapshot and `(player,wave)` effect fingerprint. A delayed W1/C1 event cannot clear a later C2. Frozen snapshots are not rewritten by late progress. Detailed participation truth belongs to canonical wave/session authority; this module does not verify combat hits.

## Personal read projection

The new-mode domain projection is `captain` plus `skills`; the unregistered personal router uses this same projection. `captain` contains `progressionVersion:1`, `level`, `personalBestWave`, `role`, decimal-string `revision`, `assignmentWaveId`, `engineerCommitment` (`null` or `{id,state:'pending'|'attached',waveId}`), `canRespec`, `respecBlockedReason` (`captain_assigned` or null) and `roleLockedReason` (`captain_assigned`, `engineer_bound` or null). `skills` contains `points`, `earned`, `spent`, `known` and `role`.

Every future adapter authenticates the personal owner and uses stored state. A bound idle Engineer can respec skills but keeps Engineer; binding alone does not disable all skill changes. Viewing an island's reservation does not block a spectator. A personal assignment anywhere does. No price or coin debit is part of personal progression.

An attached commitment may refer to a historical wave after withdrawal while `assignmentWaveId` is null. Commitment state describes generation history, not permission to control that wave. Reconnect/control authority must check the current assignment/session, never an immutable attachment replay alone.

### Personal HTTP contract

`backend/server/routes/captain_progression.py` provides GET `/api/captain` and POST `/api/captain/role`, `/skill`, `/respec` as an unregistered router. Application registration is a separate integration step. GET never initializes/imports; an uninitialized personal profile returns `409 captain_not_initialized`. Every route uses authenticated `PlayerDep`; no island, payer or client-selected profile owner is accepted.

POST requires strict `progressionVersion:1`, canonical decimal-string `expectedRevision`, `actionUid`, and the role/skill for that action. Missing personal version/adoption returns `409 captain_context_required`; a new request with a stale revision returns `409 captain_revision_mismatch`. Malformed/extra fields return the standard validation error. Successful answers are `{captain,skills}` with private no-store caching. There is no coin-based level purchase endpoint.

`20261118050310_personal_captain_revisions.sql` locks global personal state, matches replay identity including original expected revision before phase checks, and compares the revision before a new change. The old unversioned edit capability is revoked from `service_role`; only the private implementation remains callable by its versioned wrapper. A retry returns its immutable original effect with current personal state and cannot repeat an old respec after later changes.

### Global free and paid operation identity

The additive `20261118050320_personal_captain_operations.sql` depends on the [MP-ECO-02 operation registry](MP-ECO-02-operation-identities.md). The versioned free-edit wrapper claims `(authenticated actor, actionUid)` with null account/epoch and server-selected `captain:role`, `captain:learn` or `captain:respec` before taking personal profile locks. The canonical fingerprint includes the action, normalized value and original expected revision. `personal_captain_operations.operation_id` links the complete original domain result to that exact global root.

One UID cannot execute a personal edit and a paid/free island action in either order or concurrently. Exact personal replay returns its immutable original receipt plus fresh personal state before checking mutable revision or assignment. A business refusal runs through a SQL savepoint rollback, removing any newly inserted claim together with its effects. An unexpected receipt/storage failure propagates and rolls back the whole action. No personal action creates a treasury effect.

The personal adapter rejects reserved `fx_`/`sys_` financial namespaces before database access. Registry identity conflicts use the shared public `409 idempotency_conflict`; malformed root identity uses `422 invalid_transaction`. Unregistered prior personal receipt history is preserved with a null operation link and requires an explicit reviewed mapping before replay; this migration invents no historical roots or compensation. Missing personal adoption never leaves a claim. The old four-argument private edit helper remains unavailable to browser and standalone service callers.

## Retirement and conversion boundaries

Initialization preserves known skill IDs and their genuine point costs; it grants no compensation or fabricated wins. Already retired recovery skills remain acquired history, cannot be newly learned and are filtered from active frozen combat skills by the existing recovery policy. Explicit replacement/point conversion remains MP-ECO-13/17 work; no replacement effect is invented. Ordinary free respec reallocates the same earned points, retaining a bound Engineer role.

Acquired personal data may be deleted with that player's account; shared canonical receipt retention/de-identification follows the separate deletion policy. Shared island reset must not call legacy Captain-reset routines. All legacy respec/session paths must be adapted or explicitly refused before a bound Captain can use them; no existing route is wired by this contribution.

## Shared construction quotes after a personal role change

The integrated client refreshes authoritative shared-island offers after successful role selection or respec. The Engineer price depends on the buyer's personal role: updating the personal card alone leaves the selected island's previous construction intent behind. Both cached shared home and visited snapshots are marked stale, and older reads are fenced before the personal profile is applied. Authenticated-actor guards protect the subsequent reads. Failed reads keep the offers unavailable; the client never invents a discounted quote.

`frontend/tests/island/engineer-role-quotes-dom.test.js` covers the first construction request after selecting Engineer or leaving Engineer through respec, for both home and visited islands, plus failed quote refreshes. These use the actual island assembly and Chromium DOM with synthetic authoritative transport responses. Actual authenticated-provider first-click verification is a separate acceptance boundary.

## Acceptance and verification

- Preserve legacy levels/known skills/role and points without charging any wallet or using owned-island best.
- Repeat initialization never imports later legacy changes or resets the new personal profile.
- Confirmed win grants configured milestones once; confirmed defeat only releases matching Engineer; false participation, abort/expiry/abandonment and changed replay fingerprints cannot grant/satisfy.
- Test C1 completion after C2 exists, multiple discounted buys, transactional failure rollback, global assignment/respec races and spectator reallocation.
- Database grants exclude anonymous/authenticated writes and direct service execution of private hooks. Test full-chain apply/reapply and rollback on a disposable PostgreSQL server.
- Run focused Python tests, applicable legacy regressions, Ruff and SQL parse checks. Record exact results before handover; no live checks are implied.

## Changed files and remaining integration

Feature additions are the personal domain/store modules, new unregistered route module, this spec, additive migrations and focused tests. No existing island service, route, application registration, frontend or INTERFACES is modified. MP-ECO-02 account/context, 03 canonical completion, 04 construction, 08 authority and 11 assignment integrations must be combined and independently reviewed before admission. MP-ECO-13/17 conversion policies remain separate. A different human reviewer is still required.

### Foundation checks

- Focused personal/route/legacy Python checks: `uv run pytest -q server/tests/test_personal_captain.py server/tests/test_captain_progression_routes.py server/tests/test_captain_tree_routes.py server/tests/test_captain_skills_routes.py` — **68 passed**.
- Disposable full-chain SQL checks: `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_personal_captain_sql.py server/tests/island_sql/test_island_treasury_sql.py server/tests/island_sql/test_captain_tree_sql.py server/tests/island_sql/test_respec_and_wave_guards_sql.py` — **53 passed**, including 22 personal-domain checks, a real legacy-finish/profile-freeze regression and apply/reapply.
- Ruff passed for the new Python modules/tests. The new migration parses with PostgreSQL's parser; no live database, authentication flow, deployment or physical-client behavior was tested.

### Operation registry follow-up checks

After merging main `f0c64442` and adding the operation registry dependency:

- Personal/domain/route/treasury Python checks: `uv run --no-sync pytest -q server/tests/test_personal_captain.py server/tests/test_captain_progression_routes.py server/tests/test_economy_operations.py server/tests/test_island_treasury.py server/tests/test_island_treasury_store.py` — **108 passed**.
- Disposable full-chain PostgreSQL checks: `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_personal_captain_operations_sql.py server/tests/island_sql/test_personal_captain_sql.py server/tests/island_sql/test_economy_operations_sql.py server/tests/island_sql/test_island_treasury_sql.py` — **78 passed**, including 15 personal-operation cases.
- The documented pglast parser check parsed **70 migrations**.

The new SQL regressions first reproduced sequential and concurrent cross-domain duplicate execution. They cover refusal rollback, historical mapping refusal, reserved namespaces, exact replay linkage, missing adoption and an injected failure after profile mutation while writing its receipt. Existing Engineer-generation, global assignment and legacy-finish/profile-freeze tests remain in the same SQL run. No router registration, live conversion, production migration or authenticated end-to-end activation is claimed.

The corrected registry cutover (`8a35a58e`) is integrated. Rerunning the four PostgreSQL suites above together with `server/tests/island_sql/test_economy_operations_cutover_sql.py` passed **91 tests**, including populated first-apply/reapply writer-drain races. The same **108 Python tests**, full Ruff and **70-migration** parser check passed again. This proves local dependency compatibility, not migration-tool behavior or live cutover.

The absent-profile GET error matches the canonical MP-ECO-01 contract: `409 captain_not_initialized`. POST context failures remain `captain_context_required`; no router registration or legacy-route wiring is added by this correction.

For that GET correction, `uv run --no-sync pytest -q server/tests/test_captain_progression_routes.py server/tests/test_personal_captain.py` passed **46 tests**; full Ruff and whitespace checks passed. The absent-GET regression failed against the old error code before the correction. Existing POST context/version guards remain covered.

Current main refresh: `77a9e34d` and the subsequent repair-option fixes at `03e660fe` are merged. The catalogue/recovery/admin intersections were checked with the same five Python suites above: **108 passed**; full Ruff and diff checks passed. No personal route is registered and no legacy mutation guard is activated by this merge. The earlier full-chain PostgreSQL results remain scoped to their recorded revisions; this refresh did not rerun that suite.

Committed race-fixture isolation: the two new personal Captain SQL test modules explicitly import the existing session scratch-server fixture per module. Before that change, running both modules followed by `test_islands_and_waves_sql.py` produced **61 passed, 2 failed**: legacy global-count assertions saw committed race rows (8 wallets and 6 islands instead of their two fixture records). The identical mixed-order command then passed **63 tests**. No legacy assertion or global fixture was changed.

The branch now includes the actual published treasury dependency `feca459f` and its unique schema migration `20261118050050_island_treasury.sql` (`764a1e25`). Duplicate foundation files use that published source; the review diff against it contains only the 11 personal Captain files. After dependency alignment, nine affected PostgreSQL suites (treasury, global operations/cutover, both personal modules, Captain tree, respec/wave guards, island fresh start and legacy islands/waves) passed **150 tests**. The exact three-module mixed-order regression passed **63 tests** again after import formatting. The five focused Python suites plus migration-version validation passed **109 tests**; full Ruff passed, and **71 migrations with 71 unique versions** parsed. No global fixture or assertion changed. Parser/full-file scratch execution remains separate from a migration-tool/live-history proof.
