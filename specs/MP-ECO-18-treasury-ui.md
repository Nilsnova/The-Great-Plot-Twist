# MP ECO 18 Island treasury display and ordinary purchase cards

> **What this is:** a bounded frontend projection for the persisted shared-island economy, with exact treasury values and ordinary build, research and crew cards.
>
> **Who uses it:** the island UI, HUD and later economy integrations. Backend rules and settlement remain authoritative.

- **Status:** bounded frontend implementation; backend integration pending.
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`).
- **Branch:** `feat/mp-eco-18-treasury-ui`.
- **Issue:** [MP-ECO-18 #498](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/498), under [epic #492](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/492).
- **Coding assistance:** Codex; the responsible teammate reviews and explains the change.
- **Reviewer:** another human teammate, not yet assigned.

## Why

The existing HUD and purchase cards use the caller's numeric wallet, including while visiting another island. A shared island needs to display its own available treasury, keep committed stakes separate, and compare exact values without JavaScript number rounding. A delayed receipt or response from another island/run must not replace the treasury on screen.

## Scope and contracts

Use the MP-ECO-01 economy envelope:

```js
economy: {
  mode: 'island_shared', version: 1,
  islandOwner: '<uuid>', accountId: '<uuid>', runEpoch: '<uuid>',
  revision: '<nonnegative decimal integer string>',
  treasury: {
    balanceCoins: '<nonnegative decimal integer string>',
    committedCoins: '<nonnegative decimal integer string>',
    availableCoins: '<nonnegative decimal integer string>'
  }
}
```

`balanceCoins` includes held principal; `availableCoins = balanceCoins - committedCoins`. Money and revision remain exact strings; `Number` is not used for their arithmetic or ordering. A monetary scope is the complete owner/account/epoch tuple. Revision orders money snapshots in that scope only; equal treasury revisions do not order building, crew or personal progression state.

For a mutation response, consume its refreshed `currentEconomy` envelope. The immutable receipt's original balances are historical and cannot drive the HUD. A new mutation asserts only `{mode, version, islandOwner, runEpoch}` plus its action UID; client-supplied payer/account is never authoritative. Unsupported shared paths fail closed and retain shared mode rather than reverting to personal coins.

Deliver strict envelope validation, an exact-money projection and scoped revision guard; an accessible treasury HUD; ordinary building, crew and research affordability and funding labels; and a gated island/API integration. Without a persisted shared envelope, legacy treasury display and economic request bodies remain unchanged. Personal Captain cards independently use version 1 points/progression when the authenticated personal profile has adopted that version, including on legacy-economy islands.

## Files

- New `frontend/src/island/economy-view.js` and focused tests: exact values, scope and monetary snapshots.
- New `frontend/src/island/economy-funding.js` and `economy-captain.js`: pinned funding scope and independent personal progression display.
- `frontend/src/island/api.js`: additive shared-context handling and validation for ordinary island responses/actions.
- `frontend/src/island/index.js`: select the defended island as funding source and pass the shared display projection.
- `frontend/src/island/card-model.js`: ordinary build, research, crew and personal Captain display.
- `frontend/src/ui/hud.js`, `frontend/src/ui/hud.css`, `frontend/src/game.js`: accessible treasury display behind the new persisted mode.
- `frontend/src/online/api.js`: the supported read capability header, preserving session authentication and token renewal.
- New real-DOM fixture checks and local visual evidence if Chromium is available.

## Out of scope and integration dependencies

No backend, migration, live activation or save conversion changes. Arsenal, Harbor, Boat, lobby and wave controller integration are outside this bounded change. Their adapters and financial paths require their own tasks. MP-ECO-02 provides the treasury foundation; HTTP route adoption is a separate dependency. Fixtures prove this display slice, not the complete shared economy.

Captain milestone assignment, respec authorization and pending Engineer commitment are server-owned [MP-ECO-07 #508](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/508) contracts. The display consumes `captain.progressionVersion: 1`, `personalBestWave`, personal `revision`, `role`, `assignmentWaveId`, `engineerCommitment`, `canRespec`, `respecBlockedReason` and `roleLockedReason`, with personal `skills` points/choices. A pending Engineer may reset skill choices while retaining Engineer; an active personal assignment blocks reassignment. A viewed island's combat alone does not block an idle spectator's personal controls. A withdrawn Engineer may still have an attached, unsatisfied commitment with no active assignment; `assignmentWaveId` decides whether the Captain is actively assigned.

Personal version 1 is independent of the visited island's economy mode. Once declared, a missing/stale personal snapshot cannot restore legacy coin upgrade/respec display. The personal revision guards Captain/skill snapshots independently of monetary revision. `GET /api/captain` reads without initializing a profile. V1 role, skill and respec use `POST /api/captain/role|skill|respec` with only `progressionVersion: 1`, `expectedRevision`, `actionUid` and the role/skill choice where applicable. Uncertain retries preserve the original expected revision and UID. No island, payer or treasury context is sent; there is no v1 coin level-purchase endpoint. These projections do not prove server enforcement or activate the new profile.

Ordinary island-domain mutation replies preserve the independently versioned personal Captain/skill snapshot. Only an explicit failed or unreadable personal-profile read marks adopted personal controls unavailable; a legacy Captain field in an island reply is not a personal read. Owned-island reads also read the authenticated personal profile, so adoption is detected on legacy-economy islands. The canonical `409 captain_not_initialized` GET response or a missing old route may retain an unadopted legacy profile before any valid personal v1 snapshot is pinned. POST-style `captain_context_required` does not establish that GET absence. An unavailable or previously adopted profile fails closed. The authoritative `captain.role` is projected into the compatible skills view for existing loadout consumers, rather than trusting a conflicting legacy role field.

New island reads negotiate `X-Island-Economy-Version: 1`; this is a client capability, not authentication or economic admission. The authenticated transport preserves its session Authorization header. Default legacy API reads remain unchanged when negotiation is not requested. Backend route adoption and deployment must precede shared-island activation.

Only an accepted authoritative island GET may replace its active owner/account/epoch scope. The existing read generation rejects delayed reads; retired scopes cannot be restored by later old responses. Mutation replies capture the selected island, economy mode and run at dispatch and are ignored after travel or a run change. Money revision alone cannot decide that an epoch UUID is newer. Carpenter purchases are unavailable in shared mode. Existing counts remain visible even when the current island record is below the original hiring unlock; that does not enable another hire. This change grants no replacement bonus or automatic refund, and legacy Carpenter hiring is unchanged.

## Acceptance and verification

- [x] Values above `Number.MAX_SAFE_INTEGER` remain exact in validation, formatting, affordability and revision comparison.
- [x] Committed principal is subtracted once; malformed/inconsistent shared envelopes disable shared affordability and never use a personal-wallet fallback.
- [x] Older monetary revisions, another owner/account/epoch and historical receipt balances cannot overwrite the active projection.
- [x] Equal monetary revision does not suppress unrelated domain refreshes.
- [x] HUD and ordinary cards show available and committed island funds; visiting crew/funding use the defended island.
- [x] Legacy UI/request behavior remains covered when no shared mode is persisted.
- [x] Focused Vitest and browser checks pass; `npm run build` passes. Record exact results below.
- [x] Actual authenticated backend/shared mode integration is reported separately from fixtures.
- [ ] A different human teammate reviews the current change.

## Verification record

Run from `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/island/economy-view.test.js tests/island/economy-cards.test.js tests/island/economy-api.test.js tests/island/economy-http.test.js tests/island/card-model.test.js tests/island/api.test.js tests/island/tower-tree.test.js tests/online-api.test.js
# 8 files, 141 tests passed.
MP_ECO_EVIDENCE_DIR=../docs/evidence/MP-ECO-18 npm test -- --maxWorkers=1 tests/island/economy-dom.test.js tests/island/economy-captain-dom.test.js tests/ui/hud.test.js tests/island/captain-card.test.js
# 4 files, 19 tests passed in Chromium.
npm run build
# Passed; spoiler guard: 250 text files, 12 protected lines, no suspect elimination data.
```

The focused checks cover exact money, committed principal, scope/revision rejection, pinned mode, frozen retry identities, authenticated header negotiation and renewal, independent personal Captain version 1, withdrawn Engineer commitments, and legacy card/API behavior. The real-DOM checks include the defended island's crew, phone wrapping, visit-chip separation, private-wallet rejection and free Engineer skill respec. An additional personal API integration case verifies legacy-island adoption detection, actor-only respec, partial-profile merging and refusal to downgrade after a later missing profile. [Visual evidence](../docs/evidence/MP-ECO-18/README.md) uses public synthetic fixtures.

Adjacent legacy island regression checks (`tests/pirates/poses.test.js`, `tests/island/first-read-retry.test.js`, `tests/island/visit-and-mode.test.js`, `tests/island/fresh-start-dom.test.js`, `tests/island/demolish-dom.test.js`) passed: 5 files, 29 tests.

Historical result before the current-main pose fixes: the earlier legacy `npm run test:mp` did not pass: it reached the four-player musket-pose assertion and observed no owner pose at its two requested sizes. A clean `a0edb550` run also failed, earlier at ship-shot synchronization. An isolated comparison then reused the original musket-pose observer and shot function in a running wave 4 with four captains and the same 1280 × 720 / 375 × 812 sizes: the baseline observed 0/2 owner poses and the candidate 1/2. Each used its own ephemeral Vite server and browser context, with served source verified; neither reported browser errors. This reproduced the isolated assertion failure on that older baseline/candidate. The later current-main refresh below supersedes that historical broad result. The existing pose/render unit tests passed 15/15 on each source tree. No authenticated live shared-island execution or complete multiplayer activation is claimed.

A response-ordering follow-up adds pure regression checks and real-DOM journeys for an ordinary legacy build preserving an adopted Captain, a remote reset on both owned and visited islands, delayed old GET/POST responses, and late crew/research replies after sailing home. The original code failed the new regressions before the fix. Preserved owned crew below current island unlocks stays visible while hiring remains disabled.

Final response-ordering verification after merging main `f0c64442`:

- The eight pure/API test files listed above, all three economy DOM files plus `economy-ordering-dom.test.js`, the four legacy island DOM/read suites (`first-read-retry`, `visit-and-mode`, `fresh-start-dom`, `demolish-dom`), and the `core-rejoin-load`, `arsenal-context`, `arsenal-dom`, `arsenal`, `captain-card`, `weapon-comparison-dom` and HUD suites passed together: **22 files, 225 tests**.
- `npm run build` passed with the spoiler guard (250 text files, 12 protected lines).
- Main's removed legacy weapon shop, stable island rejoin identity and arsenal coin freshness handling are retained.
- `git diff --check origin/main...HEAD` passed. At that revision, the previously failed broad multiplayer pose check was not rerun; the later current-main result below supersedes that historical outcome. No authenticated shared-backend execution is claimed.

## Integration limits

Shared API/event rollout and the remaining card groups are dependencies before activation. Keep personal and island account sources explicit; this bounded projection does not complete all MP-ECO-18 behavior or the economy epic.

The absent-personal-profile contract correction has targeted DOM coverage for initial `captain_not_initialized` legacy fallback, refusal to treat a GET `captain_context_required` as legacy, and a pinned personal v1 profile becoming unavailable after later `captain_not_initialized` without showing paid legacy controls. No new route is registered by this frontend change.

For that correction, `npm test -- --maxWorkers=1 tests/island/economy-captain-dom.test.js tests/island/economy-ordering-dom.test.js tests/island/economy-api.test.js tests/island/economy-http.test.js tests/island/economy-cards.test.js tests/island/first-read-retry.test.js tests/island/visit-and-mode.test.js tests/island/core-rejoin-load.test.js` passed **8 files, 57 tests**. The two new initial-GET DOM cases failed against the previous fallback condition before the fix. `npm run build` and its spoiler guard passed; whitespace checks passed. Those focused checks alone did not rerun broad multiplayer; the current-main result below records its later outcome. Authenticated shared-economy integration remains unverified.

### Current-main refresh

Main's pose/gated-defense changes at `77a9e34d` and subsequent repair-option fixes at `03e660fe` are merged. The checked implementation revision is `c93f8f71`. The UI conflict resolution retains the reservation guard and the current health-loading message; main's render-frame attack feedback and recovery-policy handling remain intact.

- The earlier 22-file economy/UI/rejoin/arsenal/API set, together with `tests/pirates/poses.test.js`, `render.test.js`, `live-attack-feedback.test.js`, `scattershot-latency.test.js`, `tests/redesign-movement.test.js`, `tests/island/structure-recovery-policy.test.js` and `selection-dock.test.js`, passed: **29 files, 324 tests**.
- `npm run build` passed; spoiler guard checked 250 text files and 12 protected lines.
- `npm run test:mp` passed: **four pages**, installed Chromium, `TEST_URL` unset, an owned ephemeral Vite server and temporary captures. The owner body and teammate figure both showed the musket pose at 1280 × 720 and 375 × 812. Co-op edits, revival, pause/resume, break upgrades, four-player sampled synchronization and the boss finisher completed. This successful current run supersedes the earlier pose failure above.
- Diff/whitespace checks passed. No multiplayer harness or pose implementation was changed by this feature refresh.

The broad journey uses the existing local fake server and legacy-money behavior, including its existing mid-wave join rules and paid revival. It does not prove the new frozen shared roster, free-v1 revival, original-account settlement or authenticated shared-mode backend integration. Those remain explicit integration/acceptance gates.
