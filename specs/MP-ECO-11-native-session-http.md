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

## Captain and strict-reply follow-up

The authenticated `/waves/{waveId}/captains` endpoint now binds the frozen
controller proof to the exact sealed Captain checkpoint and preserves only the
server-produced fall identity. Its response may omit known withdrawn slots still
present in the submitted frozen roster, but cannot add an unrequested token or
alter any returned HP, fall tick, revival basis or journal prefix. It uses the
existing recovery write budget and explicit deleted-account guard.

The strict transport selection now passes **110 fixture tests in 6.86s**, including
5001-digit exact generation increment, paired GET proof refusal before any read,
reserved root namespace refusal before any read, malformed prerequisite refusal
without Captain initialization, strict fresh-envelope fields and native delay
headers. Full backend Ruff and complete diff checks pass. The original 72-case
checkpoint was older adapter source. Captain routing is now implemented; real
SQL/Python composition and authenticated native client acceptance are still
separate outstanding verification gates.

Native grace rendering uses the server-only `captain_withdrawn` journal event,
with the actual opaque outer participant token and exact payload
`{participantToken, reason}`. Reason is one of `leave`, `disconnect_expired`,
`membership_lost`, `account_deleted` or `reset`. The payload cannot supply actor,
input UID or counter; outer and inner tokens must agree. Fixed journal sequence
and effective tick determine replay. The browser cannot submit this event as a
command or synthesize it from presence or a deadline. The 61-case adapter suite
passes in 0.73s after adding seven withdrawal-wire cases; actual SQL emission
and grace rendering remain separately tested by their owning lifecycle/client.

## Persisted adapter composition

Eight new disposable PostgreSQL cases exercise the Python adapters against the
real canonical provider, profile adoption, coherent source preparation, paid
Arsenal copies, frozen loadouts, input journal, structure/Captain checkpoints,
canonical completion and silent expiry worker. Every successful RPC commits
independently, including deferred constraints; accepted-root replay reads
persisted history. A real return-versus-bell race freezes the loadout actually
held under the common locks. Pending copies survive grace and return only when
the original canonical finish or autonomous expiry commits, with treasury ledger
reconciliation and no stock loss.

Generation zero is the SQL unknown/released-lease sentinel. Attachment accepts
its strictly positive server successor with matching session/origin; nonzero
requests still require exact decimal increment. Both a direct case and a real
released generation-one/new-session generation-two case failed before this fix.
The actual case also verifies historical attachment replay followed by fresh
proof fencing. The combined adapter/PostgreSQL selection passes **70 cases in
11.71s**. Legacy progression and shortened trusted test timings are explicit
seeds; authentication and browser behavior are not claimed by this database
composition. The full migration chain is applied twice to Unix-socket PostgreSQL.

The immutable snapshot now requires `captainInitialState` beside its unchanged
two-field participants. Keys exactly match the opaque frozen roster tokens;
each value is exactly `{x:0,z:0,hpUnits:1000000,downAtTick:null,fallId:null,
reviveBasisSeq:0}`. Seven malformed initial-map cases failed before validation.
Native replay can therefore seed the same actual canonical initial facts for
all Captains before applying the journal.

An actual idle-held-copy disconnect/grace case independently failed before the
canonical withdrawal hook fixed idle stock handling. It now passes through the
real worker without a wave, read or new bell. The combined selection passes
**135 cases in 16.94s**, including **nine committed-RPC PostgreSQL cases** and
strict HTTP/model fixtures. Trusted shortened catalogue timings are explicit;
countdown zero is selected through the actual persisted settings API. All **102
unique migrations parse** and the disposable fixture applies the full chain
twice. Full backend Ruff and complete diff checks pass. These are local domain
and transport checks, with no hosted application or authenticated browser claim.
