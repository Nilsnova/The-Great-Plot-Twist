# G10 checkpoint 4: stream C browser metadata and member-read checks

- Intended branch: `chore/server-followups`, after R1/R3; prepared from case Phase 1 `2a2fccd`.
- Source commit: `6ce0c0dc75215732518e51448f0f127ec415aa93`.
- R7: actual authenticated RLS permits crew members to read their crew's player ids.
- R7: outside crews and unseated callers see no rows; authenticated seat writes remain refused.
- R10: GET /api/me adds rerollsLeft and isHost without any write or naming side effect.
- R10: the fifth read is scoped to the verified player's captain_name_rerolls row.
- R10: server host settings, not request data or another profile, decide isHost.
- R12: weather credits documentation now says Settings, then Credits, with all licence links.
- Backend gate: `3453 passed, 25 skipped in 42.96s`.
- New R7 SQL checks on disposable Unix-socket PostgreSQL: `3 passed in 2.24s`.
- Focused account compatibility and isolation: `78 passed in 4.22s`.
- Ruff: `All checks passed!`; formatting: `4 files already formatted`.
- Nonempty diff, diff check and required secret scan passed.
- No migration is added or changed; no opaque-id endpoint is needed.
- No STATUS, dependency, secret-content or vercel.json change.
- No live database access, main push, Actions trigger or flag activation.
- Integrate after R1/R3 and rerun the combined stream C gates before its review push.
