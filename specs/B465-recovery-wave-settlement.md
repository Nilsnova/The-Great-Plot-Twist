# B465 Recovery wave settlement

> **What this is:** Preserve unfinished recovery-wave payments across wave changes and show the server's saved outcome.
>
> **Who uses it:** Ianno, the wave maintainers and the human reviewer of issue #465.

- **Status:** implemented; human review pending
- **Branch:** `fix/recovery-wave-settlement`
- **Publication branch:** `fix/coop-wave-consistency-review` (the development branch is retained).
- **Issue:** [#465](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/465)

## Why

A recovery finish already in flight is skipped by the handoff when the next wave starts. A temporary refusal then loses its retry because only the current wave is updated. Separately, the database returns the first close's saved `survived` value, but the HTTP response drops it and the browser reports its local provisional result instead.

## What

- Keep an old wave's finish request and retry it independently of the wave on screen, preserving its checkpoint UID and the existing refusal delays.
- Return the database's boolean `survived` on protocol-2 finishes; preserve the legacy response shape.
- Announce recovery victory or defeat only after a valid canonical receipt. Use that result for the banner, sound, cutscene and quest event.
- Keep the defense report neutral until confirmation, then use the saved outcome while retaining its local damage observations. Late old results cannot end the current battle's narration.

**Files likely to change:** `frontend/src/pirates/controller.js`, the defense-report model/view and game wiring, `frontend/src/narrator/index.js`, `backend/server/routes/waves.py`, their focused tests, `docs/INTERFACES.md`, `frontend/GRAPHICS.md` and this spec.

## Out of scope

No pricing, wallet, simulation, database, deployment or feature-flag changes. Durable retry across a full browser restart is separate from this wave-change fix. Legacy wave settlement remains unchanged.

## Done when (acceptance checks)

- [x] A transient failure of an in-flight old finish retries the same request after the next wave starts; its receipt is announced once and never changes the new wave's loot chip.
- [x] A saved win overrides a local loss, and a saved loss overrides a local win, without a provisional victory/defeat announcement or quest event.
- [x] A missing or non-boolean protocol-2 outcome is rejected and cannot be guessed from loot or local state.
- [x] Combined frontend tests, build/spoiler guard and focused browser regressions pass; root integration records the separate baseline multiplayer failure and unverified later phases.
- [x] No secrets, private data or generated caches are in the diff.
- [ ] A different human teammate has reviewed and approved the current change.

## Tests to write first

| Test file | Test name | What it proves |
|---|---|---|
| `frontend/tests/pirates/recovery-wave-end.test.js` | An in-flight old finish retries after the next wave starts | Failed old settlement is retained with the same checkpoint and announced once |
| `frontend/tests/pirates/recovery-wave-end.test.js` | Recovery outcomes wait for the canonical answer | UI and quest consumers see the saved result, including a handoff before local completion |
| `backend/server/tests/test_wave_recovery_routes.py` | A protocol-2 finish returns the database's outcome | The HTTP response preserves either boolean and refuses malformed outcomes |

## Contracts touched

- API: protocol-2 `POST /api/waves/finish` adds mandatory boolean `survived`; legacy answers omit it.
- Browser events: recovery `wave_finished` and `wave_finish_answered` carry the confirmed `survived` value. A detached receipt keeps its original wave ID.
- `wave_controller_started` carries `recovery: true` for protocol 2 so a local defense report can await confirmation.
- Database, shared lists, content: none. Existing SQL already returns the canonical result.
- Decisions: bug correction under the existing first-close settlement contract; no new product decision.

## Owner and reviewer

- **Responsible teammate:** Ianno.
- **Coding agent:** Codex; Ianno remains responsible for the output.
- **Reviewer:** a different human teammate, pending.
- **Last updated:** 2026-11-18.

## Verification and limits

Regression tests failed before the fixes: four controller/consumer cases, two HTTP outcome cases, the old-result narration case, the refresh/finalizer race and the defense-report cases. Focused final frontend checks cover settlement, the recovery controller, its read/write budgets, playtest regressions, legacy settlement, narration and reports. `UV_CACHE_DIR=/tmp/codex-uv-cache uv run pytest -q --ignore=server/tests/correctness/test_settings_contract.py` passed **12,488 tests, 299 skipped**; the unchanged 524,322-case settings contract was excluded explicitly. Focused backend route/transport checks passed **130 tests**. `uv run ruff check .`, changed-file Ruff formatting and `git diff --check` passed. The recovery-load suite retains about 2.13 event reads/second/player and no traffic after its confirmed close.

Full frontend/build/browser verification belongs to the combined integration branch. No migration, live database, hosted multiplayer, feature activation, deployment, push or human approval is claimed. Pending retries live only as long as the controller: disposal cancels timers and ignores later replies; recovery after a complete browser restart is outside this fix.

Combined checks and browser evidence are recorded in the [integration handover](../docs/handoff/coop-wave-consistency-2026-11-18.md).
