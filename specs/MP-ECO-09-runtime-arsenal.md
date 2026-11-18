# MP-ECO-09 Versioned arsenal API and cards

> **What this is:** connects the real arsenal routes and client to shared copy transactions.
>
> **Who uses it:** island members buying, taking, swapping and returning shared weapons.

- Status: implementation; canonical session/deletion integration follows the agreed source.
- Branch: `feat/shared-arsenal-runtime`.
- Issues: [#499](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/499) and [#500](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/500).
- Responsible teammate: Ianno Hollensteiner (`Iannomh123456`); Codex assistance.

## Bounded scope

Dispatch existing arsenal URLs by successfully resolved persisted economy before
legacy open/grant/conversion/sweep. A shared initial read requires the common
capability header. Strict shared mutation bodies carry the common owner/run
envelope, root UID and exact copy/holder generation for take/return. Neither
account, actor, payer nor authoritative price is accepted from the client.
Shared mutations reject the legacy navigation `code` field: the common envelope
is their only target, so historical own replay never requires a current code lookup.

Shared reads return the canonical `economy` envelope plus arsenal domain fields:
`arsenalVersion:1`, decimal `arsenalRevision`, total/stored counts, island unlock,
copies with decimal `holderGeneration`, pending wave/disconnect deadline, and
decimal catalogue prices. They never expose a personal `coins` fallback.
The actor's original operation receipt is resolved before mutable membership or
catalogue preflight. Original scope must still match the submitted envelope;
departed actors receive their immutable receipt without fresh island state.

Add migration `20261118180900_arsenal_runtime.sql` for the checked shared view,
an arsenal domain revision independent of treasury revision, and atomic legacy
entry guards. Reads create no money, copies, conversion or revision rows. Paid,
free and lifecycle copy changes advance the same domain revision. Existing
deferred version-aware capacity rules remain authoritative.

The arsenal API/controller/cards consume `getEconomy()`, authenticated
`getActorId()` and `onEconomy(economy, expectedOrigin)`. They retain exact scoped pending requests
across reload, reject stale account/run/revision replies, use decimal shared
available funds, show total capacity, allow full-inventory returns and display
pending-return/grace state. Legacy/fake behavior remains explicitly legacy.

## Shared boundaries

The common capability checker/transport header is supplied by the existing
economy integration. Shared index/API/card/HUD/game files receive thin delegation
snippets separately; this package edits no common global store. Canonical bell
must supply the frozen weapon/copy/tenure from the real session snapshot.
Membership leave, account deletion, controller revocation and autonomous expiry
will call the existing private lifecycle helpers inside their canonical common
transaction, once the actual persisted session source is available. No fixture
authority, invented assignment API or browser-dependent settlement is activated.

## Tests first and completion checks

- Shared read/write HTTP shape, capability/epoch/tenure guards, forged identities,
  missing-authority failure, receipt-only historical replay and exact legacy paths.
- Real PostgreSQL read privacy, copy/revision state, legacy mutation/admission
  serialization and no private grant/sweep on shared paths.
- Client decimal values, total capacity/grandfathered returns, pending status,
  durable original payload retry and stale reset/free-mutation replies.
- Relevant arsenal Python/frontend suites, disposable SQL, full Ruff, migration
  parse, production frontend build and actual desktop/phone card interactions.
- Authenticated integrated wave/leave/delete/worker acceptance remains required;
  fixture/API/browser-emulation evidence is labeled separately from those runs.

## Verification and activation gates

The production frontend build and spoiler guard pass. The relevant arsenal,
retry, scope, filter, comparison and Chromium component suites pass: 61 tests
across ten files. Desktop 1280×720 and phone 375×812 fixture-based card checks
exercise keyboard return, disabled full-inventory purchases and viewport fit.
These captures do not claim an authenticated shared-island session.

Disposable PostgreSQL checks pass across the runtime arsenal, shared arsenal,
legacy arsenal and treasury suites: 89 tests. They use a marked test-only
six-field authority fixture. The runtime suite also tests removal of that fixture
to prove a closed failure and concurrent conversion/admission to verify that the
batch freezes candidates before acquiring scope guards. The Python
route/store/rule/lifecycle suites pass 90 tests. Full backend Ruff and parsing of
all 76 migration files pass. No test-only provider is production
authority, and no test proves the missing canonical lifecycle integration.

Runtime activation still requires the persisted authority provider and explicit
inventory conversion at admission, frozen copy/tenure at canonical bell, trusted
60-second disconnect handling, control revocation, autonomous canonical closure
and leave/deletion settlement. The existing holder foreign key deletes copies
when a profile is physically deleted; `wave_runs.started_by` also cascades profile
deletion to a run. Both require a coordinated canonical deletion transaction
before activation. Merely nulling a holder would expose a reserved copy early.
This migration guards legacy arsenal mutations and sweeps; it does not replace
the canonical member/account/session transactions or those foreign keys.

No live migration, feature activation, publication or deployment is included.
