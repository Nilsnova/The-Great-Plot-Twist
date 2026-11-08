# R11: serialized case and public-world fixtures

G9 pickup: `feat/g9-real-adapter`, Package4. Last checked published case ref:
`3098c0afb040ab80829b28d39c1195905da3c4ca` on `feat/case-backend`.

The authorized case section of `docs/INTERFACES.md` and
`backend/server/tests/case_fixtures.py` publish request bodies, outer envelopes and snapshot inputs.
They do not publish the complete serialized responses needed to connect the existing case screens.
G9 has not read backend implementation, secret content or another worktree to fill those gaps.

Please publish one redacted wire-fixture file and reference its approved path/ref in the case
contract. Generate it through the actual serializer using isolated fixture inputs. Replace all
identifiers and prose, including reveal names/text, with placeholders; preserve field names,
scalar types, nulls, omitted fields, array/object nesting and state-dependent shapes.

Minimum useful responses:

1. `GET /api/case`: `case:null`, and an active unsolved case with held/unheld cards, incomplete and
   complete deductions, search routes and running/landed jobs. No clearing data on incomplete rows.
2. Partners idle, fetching and on duty: complete orders/targets/satchel/job structures and countdowns.
3. Night before/after parting: every light's chart/readiness/post/lock/action fields and the earned
   target shape. Include null/absent post and lock states and dawn boundaries.
4. Wrong-accusation cooldown and solved response: reveal lines/cites/credits, payout/contribution
   structures, and locked versus relit world results. Use anonymous placeholder reveal content.
5. `GET /api/world`: complete dark and relit responses for all nine published keys. Specify stage
   values; `extraLights`/`solves` types and ranges; non-null `relitAt` format; `line` type/nullability;
   and Wall `name`/`order` types, order base and limits.
6. At least one accepted intent, ordinary game refusal and `repeat:true` refused intent, showing
   their actual outer envelope and fresh nested case view. No real credentials or service data.

G9 can prepare exact published command bodies and verify local unsupported-action boundaries
while waiting. It cannot validate/project populated case or Relighting responses, wire live writes
or prove an online case playthrough without guessing these shapes. Please keep this request open
until the serialized fixtures and type notes are inspectable on the authorized published ref.
