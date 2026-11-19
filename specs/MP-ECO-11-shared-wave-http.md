# Shared wave HTTP compatibility

Defines the transport boundary for canonical sessions. Used by wave routes and
integration tests for #501 and #505. Responsible teammate: Ianno Hollensteiner.

Existing unadopted legacy contexts retain their declared protocol. Native shared
waves require protocol two and the common capability header. A shared request
contains the existing wave intent plus the exact common economy intent and
`sessionId`/canonical decimal-string `connectionGeneration`. The actor and account
are server-selected. Unknown accounting state cannot select a legacy writer.

Start, join and finish use the canonical session adapter and the existing
`wave_runs`, recovery journal and global Captain assignment. No separate wave,
assignment or payment record is introduced by the HTTP boundary. Shared responses
retain their explicit economy and controller/spectator metadata instead of being
filtered through the legacy response serializer.

New bell preparation derives both static simulation inputs and `expectedSource`
from the same coherent member snapshot. The latter contains raw wave counters,
crew, exact building/research/layout identities and policy versions, with sorted
arrays and explicit nullable fields. SQL compares those facts under canonical
locks before any refresh/freeze. Treasury revision is not a world revision.
Health retains its independent revision fence. Server catalogue, played wave,
actual house levels and seed produce the frozen reward basis. No personal wallet
or legacy Captain projection is read to prepare a shared attempt.

Header, origin and controller assertions do not replace the locked SQL checks.
Protocol-one shared requests refuse before reaching any legacy mutation. Personal
saved obligations keep their original legacy settlement path; a retained receipt
cannot authorize a new wave or expose a fresh unauthorized projection.

Write body-validation and old-client refusal tests first, then exercise actual
canonical routes with the persisted session implementation. Fixture transport
tests are separate from real authenticated acceptance. No deployment or feature
activation is authorized by this specification.

The existing `/api/waves/start`, `/join` and `/finish` paths accept strict shared
bodies alongside their original legacy bodies. Native finish requires the saved
structure checkpoint. Shared dictionaries retain their full economy/session
metadata; legacy responses explicitly omit nullable fields as before. Current
reads resolve mode without creating the caller's own island and accept optional
paired `sessionId`/`connectionGeneration` assertions. A managed personal Captain
cannot initialize new legacy control through these routes.

Native input and structure-health posts add the same proof to their original
protocol-two body. Journal GET uses paired `islandOwner`/`runEpoch` query fields,
with an optional complete session proof; a current member may spectate without a
controller lease. Every valid journal request checks deleted-actor status after
its budget, while malformed queries/bodies and incompatible native clients reach
no domain transaction. The native adapter still checks origin, membership,
controller generation and sealed journal state atomically.

The HTTP bell probes its authenticated original root before looking up today's
navigation code or weather feed. An immutable replay uses its saved weather and
returns no current controller or treasury projection. A new bell's non-`own`
compatibility code must resolve to its captured island owner before preparation;
the adapter probes again after that network work to handle a concurrent replay.
