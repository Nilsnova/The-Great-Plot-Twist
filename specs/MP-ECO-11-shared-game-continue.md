# Continue an admitted host game

Responsible teammate: Ianno Hollensteiner. Scope: the existing game creation
service used by the front door's host Continue action. No route, response,
authority, assignment or storage contract changes.

Before opening a host game, resolve its persisted economy through the existing
context RPC. An admitted shared island is read by the authenticated owner's ID,
validated using the existing island row model, and reused with `created: false`.
The existing canonical `game_join` wrapper still stamps host membership. This
path must never call the legacy island opener or grant personal starting funds.

Only an explicit legacy context or an explicit missing own island may enter the
existing atomic legacy opener. Unknown, malformed or unavailable context, and a
missing or contradictory shared island row, fail closed without opening an island.
The database's existing legacy guard remains responsible for concurrent admission.
If admission or Captain adoption wins after discovery, the opener's known control
refusals are translated before validating a successful open row. They return 409;
there is no automatic retry, grant or change of payer. Unknown replies remain 502.

Test first: authenticated HTTP host resume, repeat, legacy creation, malformed and
missing source refusal, and provider failure without fallback. Disposable PostgreSQL
composition must exercise actual admitted mode discovery, owner metadata, canonical
host join, unchanged wallets/treasury and retained native bell replay. This is local
verification; it does not claim a rendered or hosted acceptance result.

Verification: the new shared-host HTTP and real-provider cases reproduced the
original unreadable `OpenRow` before the change. Three known-refusal HTTP cases
and the actual committed admission race also failed before refusal translation.
The final selection passes 98 HTTP/unit tests and 19 disposable PostgreSQL tests,
including the existing native session adapter and game-room suites. The complete
migration chain is applied twice; adapter RPCs commit. Backend Ruff and the full
diff check pass. The full backend suite and rendered Continue flow were not run
as part of this bounded fix.
