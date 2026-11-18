# Native session HTTP adapters

Responsible teammate: Ianno Hollensteiner. This #501 transport change binds the
existing canonical session SQL to authenticated HTTP without another authority,
assignment, wave store or financial writer. It adds new owned Python adapter,
strict model, router and test files; existing wave dispatch and application router
registration remain with their current owners.

Every session endpoint requires the island capability header, authenticated
nondeleted actor, island feature gate, existing per-actor request budget and
private no-store response. Request models forbid actor/account/current-balance
fields and unknown keys. The common four-field intent asserts owner/run epoch;
connection proofs use a UUID session and exact positive decimal generation,
except initial attachment may assert generation zero. SQL verifies persisted
membership, current source, sole global assignment and generation atomically.

Metadata reads never adopt a Captain. Explicit attachment may initialize the
actual personal Captain only after SQL requests that prerequisite and actual
shared context has been resolved. Historical attach receipts remain historical;
clients must obtain a fresh read before applying authority or treasury state.
Leave/settings retain common receipt identity and independently authorized,
nullable current projections. Session UUIDs/generations are absent for spectators.

Accepted bell replay is checked before current mode, lease, health, catalogue
preparation or initialization. Immutable five-field snapshot origin is validated
separately from any fresh full economy envelope. Source owner, epoch, wave and
controller proof are checked on replies; malformed or unknown replies fail
closed. No absent RPC selects a legacy path.

Native input validation accepts the bounded existing simulation vocabulary with
server-supplied Captain stats, plus exact revival hold start/cancel commands.
Raw revival commands are refused. Original actor counters and input UIDs are
retained. Journal, health, Captain and closure DTOs preserve the actual SQL
contracts; no caller-supplied money, HP healing allowance, fall identity or clock
is treated as authority.

Tests first cover actor/source substitution, invalid generation/context,
historical replay before preparation, strict unknown replies and native hold
validation. Route tests cover capability/authentication/deletion/feature/budget
checks and spectator reads. Fixture HTTP tests verify transport only; actual SQL
composition and authenticated end-to-end acceptance remain separately reported.
No hosted database application, activation or publication is included.

## Adapter checkpoint verification

Nine direct adapter regressions failed before tightening role exclusivity,
immutable origin validation, native revival input bounds, nullable spectator
proofs and replay epoch binding. The first import-ready HTTP checkpoint passes
**72 fixture-based adapter/router/proof/preparation tests in 7.31s**. These cover
all session deletion gates, existing rate budget, authenticated actor selection,
no private fallback, own immutable start/finish replay and foreign-source reply
refusal. Full backend Ruff and `git diff --check` pass.

This checkpoint does not claim real PostgreSQL composition of the new Python
adapter, completed Captain checkpoint routing, or the not-yet-integrated native
SQL current/join/report/closure functions. Their actual contracts remain required;
an absent RPC fails closed. Native runtime capability remains disabled until the
combined handlers, client and persisted lifecycle pass integration checks.
