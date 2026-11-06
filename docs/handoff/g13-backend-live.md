# G13 live backend integration

Implemented for Nils on `feat/festival-live`, based on the current NPC/follow-up release.
The original configuration and pure timer/claim/FIFO modules retain Nils' authored commit;
this slice imports no old frontend or shared case/world/duel implementation.

The canonical spots are `festival_lamp_01` through `festival_lamp_12`. Lamp `lit` follows its
index in the existing solve-owned `extraLights` counter. Reserving a lamp changes no world
light, solves, coins or wallet reason. A captain can reserve different lamps; each spot has
one owner. Visible reservations end at the exact festival boundary, while action receipts remain.
The live configuration requires 172800 seconds, measured from the original shared `relit_at`.

## API contract agreed with the frontend

Mount `server.routes.festival.router` under `/api` and add
`server.festival.cache.FestivalCacheControl` to `create_app`. No new app state is required.
The service uses the existing admin/verifier, settings and injected clock. `festival` defaults
off and gates every route. `arena` additionally gates new ring joins.

`GET /api/festival` needs no sign-in. An optional Bearer header is verified before own fields
are included. Every normal or handled error response is private/no-store. Query parameters
are refused; the browser rehearsal query never changes a server flag.

```json
{"phase":"active","startsAt":"2026-11-06T12:00:00Z","endsAt":"2026-11-08T12:00:00Z",
 "remainingSeconds":169200,"lamps":[{"id":"festival_lamp_01","label":"Festival lamp 1",
 "lit":true,"claimed":true,"claimedByMe":false}],
 "ring":{"available":true,"queued":false,"duelId":null},"serverTime":"2026-11-06T13:00:00Z"}
```

The response always lists all twelve lamps. Anonymous reads show no own reservation or queue.
No response contains another player's ID or any queued signals.

| Intent | Body |
|---|---|
| `POST /api/festival/claim` | `{lampId, actionUid}` |
| `POST /api/festival/ring/join` | `{signals: [three A7 glyphs], actionUid}` |
| `POST /api/festival/ring/leave` | `{actionUid}` |

All writes require verified login; body extras, player IDs, prices, stakes and results are refused.
Replies contain `accepted`, `reason`, `repeat`, `status`, optional paired `duelId`, and a fresh
`festival` view. Accepted status is `claimed`, `already_claimed`, `queued`, `paired` or `left`.
Game refusals are 200 with `festival_waiting`, `festival_ended`, `lamp_occupied`, `already_queued`,
`in_duel` or `not_queued`. Unknown lamps give 404 `no_such_lamp` after receipt lookup. Disabled
features give 404 `feature_off`; two consecutive queue races give 409 `festival_busy`. Standard
422 validation errors and A7 `not_enough_oil` apply. Transport/database failures preserve the
client's original action UID for retry.

Receipts are unique per verified player/action UID across festival intents and are answered
before changed targets, oil rules or festival expiry. A queued receipt stays queued on replay;
the fresh view can already point to the completed duel. The frontend uses the fresh view.

The ring uses the approved minimum: three rounds, friendly zero stake. Waiting signals stay
in the private queue. The second captain's request is resolved by existing A7 Python rules;
the transaction rechecks FIFO identity and invokes unchanged `duel_create` and `duel_answer`.
No intermediate open challenge escapes the transaction. The resulting duel is read through
normal authenticated `/api/duels/{id}`, including its existing participant/secrecy checks.

## Database and checks

New migration: `20261106160000_festival.sql`.
MD5: `e5df5d833e6b2d733736a6a8e8585858`.

It adds four server-only RLS tables (`festival_control`, `festival_actions`, `festival_claims`,
`festival_queue`) and seven invoker functions with empty search paths and service-only execution.
There are no new player policies, sequences, triggers or wallet reasons. Expected totals after
160000 on the reviewed 130000/140000 baseline: 35 public tables, 1 view, 50 project functions,
17 reasons, 8 sequences, 16 public policies, 5 realtime policies and 6 public triggers.

The independent migration reviewer and release coordinator own live preflight/application,
exact stored-text hash proof, normalized history version and the security-advisor check.
This task performed no live writes, deployment changes, pushes or workflow runs.

Verified locally:

- 110 pure, route, strict-row, flag and config checks passed.
- 108 case/festival SQL and static-contract checks passed on disposable PostgreSQL.
- One real TestClient-to-SQL proof passed: optional/own reads, exclusive claims, multiple spots,
  exact changed-target replay, atomic FIFO pairing through actual A7 functions, participant-only
  duel access, six sealed move rows, no ledger changes, unchanged world-light count and expiry.
- Backend Ruff and diff checks pass. The final combined release gate belongs to root integration.

The local API proof temporarily extends its explicit development allowlists in the test only.
To expose festival routes in the reusable local harness, root can add the three festival read
tables and four API-facing RPC names to `tools/local_admin.py`; no private helper is needed.

The source assigns free lantern colours, driftline materials and other world extras to their
existing owners. This slice adds no colour, salvage, title, price or reward rules.
