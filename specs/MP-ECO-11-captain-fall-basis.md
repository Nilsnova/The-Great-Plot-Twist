# Captain fall timestamp after revival

Canonical session checkpoint correction, used by the native Captain report SQL.

An accepted report with a nonzero current revival basis must cover the actual
revival event's effective tick. A newly reported fall must also have
`downAtTick >= basisEvent.effectiveTick`. Damage later in the same tick remains
valid. A fresh basis cannot turn an old pre-revival fall timestamp into a new
server fall identity. Existing exact report replay and old fallen-state identity
remain unchanged; no per-hit verifier, new authority or storage is introduced.

Verify against an actual bell, ordered hold, server completion and subsequent
sealed Captain reports: the old timestamp refuses without a new fall/report
receipt, while a same-tick fresh fall succeeds and receives a different nonce.
