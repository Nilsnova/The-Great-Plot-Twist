# Shared economy core client

> **What this is:** The browser adapter for coherent shared-island snapshots, exact server quotes and immutable mutation receipts.
>
> **Who uses it:** Players building, researching and hiring on shared islands, and reviewers of issue #518.

- **Status:** implemented locally; integration and human review pending
- **Branch:** `feat/shared-client-reconciliation`
- **Issue:** #518

## Why

The shared economy domain returns immutable receipts rather than a replacement island. The browser must preserve an uncertain request exactly, accept a confirmed purchase independently of a later read, and render prices supplied by the defended island.

## What

- Validate `snapshotVersion: 1` reads and mandatory-target quote rows separately from legacy islands.
- Submit quoted build, upgrade, demolition, research, specialisation, tree and wreck intents with their original CAS basis, decimal price, economy assertion and action UID. Crew uses the selected island and server offers.
- Keep an uncertain full intent scoped to its authenticated actor and original account/epoch. Never rebuild that retry from newer prices or state.
- Validate immutable receipts before an independent coherent read. A failed refresh leaves a confirmed operation successful and quotes unavailable until a fresh read.
- Preserve global personal Captain v1 ordering and legacy islands. Unsupported shared capabilities remain unavailable.

**Files:** new pure shared snapshot, quote, intent, receipt, HUD funding and card modules; bounded changes to `frontend/src/island/api.js`, `index.js`, `card-model.js` and focused tests. `frontend/src/online/panel-services.js` forwards GET options, and `frontend/src/game.js` supplies the existing opaque session generation and its change notification.

## Contracts touched

The server route models remain the HTTP contract. Shared reads use `X-Island-Economy-Version: 1`; snapshot money and revisions are canonical decimal strings. Quotes have `{target,intent,available,reason}` and the exact endpoint fields in `intent`. POST adds only `actionUid`, the economy assertion and optional island `code`; authenticated `actorId` is never posted. Mutation responses retain `{status,repeat,receipt,currentEconomy}` with nullable historical projections. Demolition quote reads additionally support `quoteVersion: 1`.

The snapshot carries the fixed `arsenal`, `session`, `move`, `repair`, `reset`, `market` and `match` capabilities as strict boolean/reason pairs. Installed domain clients retain their verified context and transport rules. Available market/match capabilities retain the protected Harbor entries; unavailable paths stay disabled. Ship reward scope is a separate verified boat contract. Ordinary legacy Harbor entry is preserved. This change does not admit islands, adopt Captains, convert saves or activate the shared mode.

Opaque auth generation binds reads and sends to the current session, independently of authenticated `actorId`. An identity change hides the old actor's projections immediately; a fresh authorized shared read is required before sending another shared mutation. Normal token renewal keeps the generation. Previously adopted personal progress cannot revert to paid legacy controls after returning; a different actor's proven unadopted profile may retain legacy controls. Pending shared requests retain the original actor and origin in local storage without storing authentication tokens. If a stored record is malformed, the client refuses to replace its uncertain operation with a new UID.

Only current scoped monetary projections update treasury display. Equal treasury revisions do not order state-only changes: domain state comes from an independently fenced coherent GET. A valid immutable receipt remains a confirmed success when a live projection is absent or malformed, or a later read fails. Wreck receipts may charge less than their frozen quote ceiling when another contribution already reduced the remaining goal.

## Done when

- [x] Focused tests prove exact money/quotes, unchanged full-intent retries, actor isolation, receipt-first success, null historical projections and stale selection protection.
- [x] Existing personal progression, treasury, API and island tests pass.
- [x] `npm run build` passes, including the spoiler guard.
- [x] A browser fixture shows shared prices and treasury without legacy fallback.
- [x] The diff contains no secrets or generated assets.
- [ ] A different human teammate reviews the change.

## Tests to write first

| Test | Evidence |
|---|---|
| Strict shared snapshot and quote validation | Malformed decimal money, absent basis and unknown prices never use bundled prices. |
| Immutable shared retry | New snapshots, changed CAS and reloads retain the original full body and UID for the same actor/origin. |
| Receipt and refresh separation | A committed receipt stays successful after a failed coherent refresh; historical null projections are valid. |
| Shared card and demolition models | Exact prices/refunds and server availability drive buttons; Carpenter is unavailable. |
| Personal reply application after an identity change | Nested promise continuations cannot restore an old actor's profile, emit their success event, clear a new actor's busy state or apply their failure message. |
| Refused legacy Captain upgrade | Insufficient funds produces the ordinary refusal without an undefined target error. |
| HUD mode after an account change | The actual game funding adapter keeps unknown shared funds unavailable, displays a newly authorized legacy balance and switches back to exact shared funds. |

## Verification and limits

The following results describe the imported core client at `bd487b3a`; they are historical evidence, not the verification result for this reconciliation. The reconciliation results are recorded below.

The following command passed **31 files, 349 tests**. It includes real Chromium component journeys using coherent synthetic responses and the complete panel lease/HTTP token-renewal chain with injected network responses.

```sh
cd frontend
npm test -- --maxWorkers=1 \
  tests/island/shared-core.test.js tests/island/shared-core-dom.test.js \
  tests/island/economy-api.test.js tests/island/economy-cards.test.js \
  tests/island/economy-dom.test.js tests/island/economy-ordering-dom.test.js \
  tests/island/economy-captain-dom.test.js tests/island/economy-http.test.js \
  tests/island/economy-view.test.js tests/island/api.test.js tests/island/card-model.test.js \
  tests/island/tower-tree.test.js tests/island/tower-tree-dom.test.js \
  tests/island/first-read-retry.test.js tests/island/visit-and-mode.test.js \
  tests/island/fresh-start-dom.test.js tests/island/demolish-dom.test.js \
  tests/island/core-rejoin-load.test.js tests/island/arsenal-context.test.js \
  tests/island/arsenal-dom.test.js tests/island/arsenal.test.js \
  tests/island/captain-card.test.js tests/island/weapon-comparison-dom.test.js \
  tests/ui/hud.test.js tests/island/wave-flow-races.test.js tests/island/wave-flow.test.js \
  tests/island/structure-recovery-api.test.js tests/island/structure-recovery-card.test.js \
  tests/panel-services.test.js tests/online-api.test.js tests/online-session.test.js
npm run build
```

The game uses `createIslandHudFunding` for its island coin callback. An explicit shared-mode flag is independent of the nullable funding scope key. An auth clear therefore keeps the HUD unavailable until a fresh source is authorized, while a subsequent accepted legacy source clears shared mode even when the previous key was null. Unmarked private coin values cannot perform that transition. The same production adapter is used by the real HUD/island regression, including the return to exact shared funds.

That HUD transition regression failed with the previous callback and passed after the fix. The focused command below passed **5 files, 31 tests**; the build, spoiler guard and whitespace checks passed:

```sh
cd frontend
npm test -- --maxWorkers=1 tests/island/hud-funding-dom.test.js \
  tests/island/economy-dom.test.js tests/ui/hud.test.js \
  tests/island/shared-core-dom.test.js tests/island/captain-auth-race-dom.test.js
npm run build
```

The production build and spoiler guard passed (250 text files, 12 protected lines). Desktop treasury/crew and phone treasury browser fixtures passed and were visually inspected; private balances never replace the shared purse. The auth-change journeys cover a late committed reply, cleared old projections, a new unadopted actor and a returning adopted actor. The shared Harbor journey confirms unavailable market/match entry and retained weather/legacy entry.

After the final identity-change cache cleanup, the affected `shared-core-dom`, `economy-ordering-dom` and `economy-captain-dom` files passed again: **3 files, 13 tests**, using `npm test -- --maxWorkers=1` followed by their full paths under `tests/island/`. The build and whitespace checks were repeated successfully.

Personal handlers also check their dispatch auth generation at the UI continuation, after the API promise resolves. This protects the gap between an API-level check and application of the result. Learn, role, respec and legacy upgrade responses cannot restore an old actor's state or messages, emit their success events or clear a newer actor's busy state. Identity changes reset personal busy/confirmation state; successful standalone personal replies still do not require an island object. Legacy upgrade refusals explicitly target the owned island.

The new `captain-auth-race-dom` regressions failed before these guards, including the nested microtask profile restoration and an undefined legacy refusal target. The final focused command passed **7 files, 35 tests**:

```sh
cd frontend
npm test -- --maxWorkers=1 tests/island/captain-auth-race-dom.test.js \
  tests/island/economy-captain-dom.test.js tests/island/shared-core-dom.test.js \
  tests/island/captain-card.test.js tests/island/first-read-retry.test.js \
  tests/island/visit-and-mode.test.js tests/island/economy-ordering-dom.test.js
npm run build
```

Authenticated shared-backend execution, admission, save conversion, actual session authority and the remaining product families are not verified by these client fixtures. The coherent snapshot/quote server routes and schema must be integrated before activation. The existing broad multiplayer fake journey was verified on the inherited base; it was not rerun for this client increment and does not prove shared economy acceptance.

## Owner and reviewer

- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`)
- **Coding agent:** Codex; the responsible teammate remains accountable.
- **Reviewer:** pending independent human review
- **Last updated:** 2026-11-18

## Reconciliation with installed shared domain clients

Integrate the quoted core client and the current treasury UI into the extracted island modules.
Keep the established authenticated capability transport, authoritative actor getter, wallet
reconciliation, shared Harbor host, original-account boat rounds, guarded repair and arsenal
clients, and their overlay and receipt semantics. Decode the fixed snapshot capability names
as strict boolean/reason pairs instead of requiring every domain to be unavailable. Unknown
paths remain disabled, and paused admission disables new offers through server quotes.

Live initial, malformed and unresolved-visit context remains unavailable. A negotiated legacy
read must establish the server's explicit personal legacy marker before selecting personal
financial controls. Fake and explicitly old API tests retain their existing protocol. Current
funds and domain callbacks use the same accepted island economy projection; no second global
account store is introduced. Treasury updates invalidate stale offers until a coherent read
arrives. Money revision does not order unrelated domain state.

Port current split-module travel binding and pre-reset reply fences, then apply opaque auth
checks to all personal Captain continuations before state, messages or busy indicators change.
A 401 challenge and malformed durable storage cannot replace an uncertain core intent with a
new UID. Write bounded regressions for these cases and unresolved visits before correcting
them. Verify imported quote, treasury and Captain tests with installed domain components,
current selection/crew/coverage checks and the production build. Full unrelated frontend
matrices and authenticated provider acceptance are separate checks.

The reconciled legacy GET marker is the server target owner UUID plus `mode: personal_legacy`,
`version: 0` and explicit null account, run, revision and treasury fields. A negotiated read
without this marker or a coherent shared snapshot fails closed. Read-only arsenal discovery
retains its code and capability header before the initial context is resolved; financial
controls and private balance application wait for the confirmed source. Existing wallet
watermarks still reject a read begun before a recovered balance or newer own-island read.
Opaque identity changes also clear a pending wallet recovery and advance its generation.

Shared reset remains unavailable in this client increment. It does not send the legacy
confirmation-only request for a shared account. The shared session client and its actual
canonical lifecycle are separate integrations; unavailable session capability disables the bell.

Source reconciliation includes core client `bd487b3a`, treasury UI `d960bb63`, travel-binding
correction `3909627a` and pre-reset response fencing `cf39d84e`. The extracted island modules
and installed domain transports remain the assembly structure. Imported screenshots and their
original verification notes are retained with their original scope.

### Reconciliation verification

The meaningful new regressions failed before their corrections: corrupt persisted intent storage
allocated a replacement UID; 401/auth restoration replaced the original personal and shared request;
a negotiated incomplete legacy marker was accepted; stale quote refusal left other offers enabled;
research receipt tiers accepted coerced or out-of-range values; and a new identity reused the
previous identity's joined-game cache. The final behavior preserves the original uncertain request,
refuses malformed replies, invalidates stale offers and rechecks game membership. An old join's
completion cannot remove a newer join still in progress. Identity cleanup clears pending wallet
recovery and room state before any new projection is displayed.

Targeted verification completed with `npm test -- --maxWorkers=1` and explicit related paths:

| Selection | Result |
|---|---|
| Quote, receipt, card/model, protected domain, transport, selection and defense coverage | 26 files, 395 tests passed |
| API negotiation, wallet watermark, structure recovery and shared controls | 6 files, 54 tests passed |
| Read/travel/reset ordering, join/auth races, wall feedback, selection, tree and demolition DOM | 11 files, 68 tests passed |
| Exact receipt retry and research result validation | 2 files, 28 tests passed |
| Current treasury and Captain screenshot journeys | 2 files, 6 tests passed |
| Final boat reward-scope, Captain identity and core receipt checks | 3 files, 37 tests passed |

The original wallet ordering and discovery request assertions remain. Only the two HUD expectations
before any confirmed island context now require unavailable funds, followed by the same verified
legacy balances. This retains read-only discovery while preventing private coin application from
a financial source the browser has not yet established.

The production build and spoiler guard passed (256 text files, 12 protected lines). Whitespace
checks passed. Current screenshots were regenerated and visually inspected in
[the core client evidence](../docs/evidence/MP-ECO-core-client/README.md). The full unrelated frontend
matrix, authenticated canonical session producer, shared reset client and deployed shared economy
acceptance were not run or completed by these component checks. No activation is included.
