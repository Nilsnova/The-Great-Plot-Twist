# G10 checkpoint 1: Phase 1 contract published for G9

- Branch: `feat/case-backend`, based on Claude's `ed4b4f3` handoff.
- Slice commits: `68856b4` data, `d46e86f` earned views, `63a1afc` pure decisions, `43568d1` SQL checks.
- Contract: `docs/INTERFACES.md`, section 10, Case Phase 1 contract for G9.
- Executable, replaceable fixtures: `backend/server/tests/case_fixtures.py`.
- Search, accusation, host clock, refusal reasons and stored-outcome repeats are documented.
- A repeated wrong accusation remains a refusal; protected reveal text is earned per crew.
- Integrated backend gate: `3409 passed, 22 skipped in 42.66s`.
- The 22 opt-in SQL checks ran separately: `22 passed in 3.46s`.
- Ruff: `All checks passed!`; changed-file formatting: `22 files already formatted`.
- Parser: `SQL parses: 6 file(s)`; required secret scan: no matches.
- Phase 1 is still being completed: the production-rule card solvability proof and final docs follow.
- This is the early G9 contract checkpoint, not a request to apply the migration yet.
- The complete Phase 1 checkpoint will include its final migration checksum.
- No live database access, main push, Actions trigger, secret-content change or STATUS edit.
- `origin/main` is `c26f303`; migration `20261106070000_home_islet.sql` is absent.

## Server requests added to stream C

- R1: opt-in local golden-path API with fixed test players; next after Phase 1.
- R3: default-off `sign_in` flag; next after Phase 1, activation waits for enforced R2.
- R2/R5: Claude owns live headers and sign-in configuration; G10 does not edit `vercel.json`.
- R4: retire the old exchange/check page together only after in-game sign-in is live.
- R6/R8: open-world flag and crew nudges wait for the relevant group 2 code on main.
- R7: verify own-crew seat reads with RLS tests and document the result.
- R9: optional join preview remains optional.
- R10: add `rerollsLeft` and `isHost` to the account answer.
- R11: this checkpoint publishes the contract and fixture ref for G9.
- R12: update weather credits documentation to Settings, then Credits.
- R13: any secret-content edit must regenerate G9-compatible fingerprints and pass the build.
