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

`backend/server/routes/captain_progression.py` provides GET `/api/captain` and POST `/api/captain/role`, `/skill`, `/respec` as an unregistered router. Application registration is a separate integration step. GET never initializes/imports. Every route uses authenticated `PlayerDep`; no island, payer or client-selected profile owner is accepted.

POST requires strict `progressionVersion:1`, canonical decimal-string `expectedRevision`, `actionUid`, and the role/skill for that action. Missing personal version/adoption returns `409 captain_context_required`; a new request with a stale revision returns `409 captain_revision_mismatch`. Malformed/extra fields return the standard validation error. Successful answers are `{captain,skills}` with private no-store caching. There is no coin-based level purchase endpoint.

`20261118050310_personal_captain_revisions.sql` locks global personal state, matches replay identity including original expected revision before phase checks, and compares the revision before a new change. The old unversioned edit capability is revoked from `service_role`; only the private implementation remains callable by its versioned wrapper. A retry returns its immutable original effect with current personal state and cannot repeat an old respec after later changes.

## Retirement and conversion boundaries

Initialization preserves known skill IDs and their genuine point costs; it grants no compensation or fabricated wins. Already retired recovery skills remain acquired history, cannot be newly learned and are filtered from active frozen combat skills by the existing recovery policy. Explicit replacement/point conversion remains MP-ECO-13/17 work; no replacement effect is invented. Ordinary free respec reallocates the same earned points, retaining a bound Engineer role.

Acquired personal data may be deleted with that player's account; shared canonical receipt retention/de-identification follows the separate deletion policy. Shared island reset must not call legacy Captain-reset routines. All legacy respec/session paths must be adapted or explicitly refused before a bound Captain can use them; no existing route is wired by this contribution.

## Acceptance and verification

- Preserve legacy levels/known skills/role and points without charging any wallet or using owned-island best.
- Repeat initialization never imports later legacy changes or resets the new personal profile.
- Confirmed win grants configured milestones once; confirmed defeat only releases matching Engineer; false participation, abort/expiry/abandonment and changed replay fingerprints cannot grant/satisfy.
- Test C1 completion after C2 exists, multiple discounted buys, transactional failure rollback, global assignment/respec races and spectator reallocation.
- Database grants exclude anonymous/authenticated writes and direct service execution of private hooks. Test full-chain apply/reapply and rollback on a disposable PostgreSQL server.
- Run focused Python tests, applicable legacy regressions, Ruff and SQL parse checks. Record exact results before handover; no live checks are implied.

## Changed files and remaining integration

Owned additions are the personal domain/store modules, new unregistered route module, this spec, additive migrations and focused tests. No existing island service, route, application registration, frontend or INTERFACES is modified. MP-ECO-02 account/context, 03 canonical completion, 04 construction, 08 authority and 11 assignment integrations must be combined and independently reviewed before admission. MP-ECO-13/17 conversion policies remain separate. A different human reviewer is still required.

### Foundation checks

- Focused personal/route/legacy Python checks: `uv run pytest -q server/tests/test_personal_captain.py server/tests/test_captain_progression_routes.py server/tests/test_captain_tree_routes.py server/tests/test_captain_skills_routes.py` — **68 passed**.
- Disposable full-chain SQL checks: `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_personal_captain_sql.py server/tests/island_sql/test_island_treasury_sql.py server/tests/island_sql/test_captain_tree_sql.py server/tests/island_sql/test_respec_and_wave_guards_sql.py` — **53 passed**, including 22 personal-domain checks, a real legacy-finish/profile-freeze regression and apply/reapply.
- Ruff passed for the new Python modules/tests. The new migration parses with PostgreSQL's parser; no live database, authentication flow, deployment or physical-client behavior was tested.
