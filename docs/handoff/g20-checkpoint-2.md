# G20 checkpoint 2 — C2

Owner: Nils; branch `test/g20-frontend`; `origin/main` fetched/merged (already current).
Scope remains new frontend/tests files plus checkpoint notes; production files unchanged.
C2 adds 40 passing tests and two skipped bug regressions beyond C1:
- Keyboard editing/scroll prevention, pointer deltas/cancellation, virtual inputs and blur/disposal.
- Touch pointer drag, unrelated moves, matching cancellation, keyboard stick, buttons and overlays.
- Standard pad stick/D-pad, rising A/Y/Menu, reconnection, menu focus/select/range/events/bounds.
- Local engine saves, corrupt schemas, reload/new-game behavior, separate journal and storage denial.
- Shared preferences: subscriptions, immutable snapshots, system-motion overrides and denied storage.
- Presenter exact query gate, controls/progress and panel cleanup on real DOM.
- Nine-step tour orchestration, early stop, Space repeat/cancellation, disposal and snapshot restoration.
- UI kit native button/tabs/modal behavior; real game startup weather/event/credit wiring.
Tour adapter/screens/story boundaries are mocked; no G9 implementation tests or source edits.
Tour tests assert no fetch or local-storage calls. Browser harness blocks API/external HTTP except fixtures.
Browser prerequisites: installed Chromium (`CHROME_PATH`, default `/usr/bin/chromium`); no download.
Python parity prerequisite: `python3` (`G20_PYTHON` override), read-only with bytecode disabled.
Gate: `cd frontend && npm test && npm run build`: 382 passed, 3 skipped, 45 files; spoiler guard passed.
G20-T1: unrelated touch pointer-up resets the active stick; skipped in `g20-input.test.js`.
G20-S1: non-string saved flag entries are accepted; skipped in `g20-storage.test.js`.
G20-W1 remains skipped from C1; no source fixes within this task.
Next: verify the skipped assertions as failing probes and publish C3's before/after test map.
