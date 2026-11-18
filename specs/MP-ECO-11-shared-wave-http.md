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
