# D1 Invalid-input sweep

> **What this is:** missing boundary and wrong-type cases for the current demo's server routes.
>
> **Who uses it:** Johannes, the reviewer and anyone rehearsing the repository walkthrough.

- **Status:** implementation verified; explain-back and human review pending
- **Branch:** `test/d1-invalid-inputs`
- **Issue and pull request:** [#4](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/4), [#5](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/5)

## Why

Existing route tests cover normal requests, many refusals and repeats. Some input fields lack
empty, null, oversized or wrong-type cases. Rejected requests must keep the house error shape
and must not admit a guest, build anything, start a wave or award coins.

## What

Extend the existing parameter lists in `backend/server/tests/test_demo_join.py`,
`test_lock_routes.py`, `test_duels_routes.py`, `test_island_routes.py` and `test_wave_routes.py`.
Reuse their clients, fake services and `assert_error`; add no new helper layer.
Record the coverage matrix and limits in the PR and update the roadmap, to-dos and status.

## Out of scope

UI changes, new dependencies/services, migrations, real-account testing and changes to retry rules.
Email OTP goes directly to Supabase; audit its existing browser tests separately. A repeated
valid request need not be rejected: preserve each route's existing repeat contract.
The duel's optional `opponentName` explicitly accepts null for an open challenge; preserve and
check that documented success case rather than treating every null as invalid.

## Done when (acceptance checks)

- [x] New cases reject bad input with the expected status, code and nonempty message.
- [x] Invalid requests cause no relevant database writes; lock/search cases also check no provider call.
- [x] Existing valid-boundary and repeat tests still pass.
- [x] A temporary local validation mistake makes a new case fail; restore it before committing.
- [x] `cd backend && uv run pytest -q` and `uv run ruff check .` have recorded results and skips.
- [x] The PR maps each workflow to tests, and distinguishes fake services from live evidence.
- [ ] A different human reviews and approves the current change.

## Tests to write first

| Existing test file | Cases to add |
|---|---|
| `test_demo_join.py` | Missing/null/non-string code and missing/invalid action id |
| `test_lock_routes.py` | Empty/null/oversized answers and action ids; search length boundaries |
| `test_duels_routes.py` | Empty/null/wrong-type challenge fields |
| `test_island_routes.py` | Empty/null/oversized/wrong-type build fields; oversized visit code |
| `test_wave_routes.py` | Empty/null/oversized/wrong-type start, join, finish and current inputs |

## Contracts touched

None planned. These tests preserve the route models, house errors and documented repeat behavior.

## Owner and reviewer

- **Responsible teammate:** Johannes Franz Lang (@frcola).
- **Coding agent:** Codex drafts and runs checks; Johannes explains and remains responsible.
- **Suggested reviewer:** Nils (@Nilsnova), familiar with the server routes; human approval pending.
- **Last updated:** 2026-11-11.
