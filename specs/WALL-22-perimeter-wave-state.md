# WALL-22: perimeter recovery and frozen-wave compatibility

Responsible human: Johannes Franz Lang (`frcola`). Tracks [WALL-22 #263](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/263). This draft follows the authorized 128-piece perimeter contract; no migration application, activation or merge.

## Scope and plan

1. Read the trusted owner wall policy before starting a wave; require a protocol-2 client and available/persisted structure recovery for perimeter islands.
2. Freeze actual pathing for new perimeter waves, including the trusted `createWave.perimeterWalls` option; never relabel an old wave's rules or snapshot.
3. Build complete current perimeter defense/health configuration only from exact supported identities and positioned built rows.
4. Bound health and repair-sequence vectors for 128 walls plus the eleven possible towers, including finish checkpoints.
5. Prove the first added wall has recovery coordinates before another wave, using persisted layout over an old immutable template rather than invented defaults.
6. Exercise legacy compatibility, unsupported protocol/policy, full selected snapshots, vector bounds and the database bridge; report exact checks and integration limits.

Likely files: `backend/server/island/wave_recovery.py`, `backend/server/routes/waves.py`, focused recovery tests and a small scratch-SQL bridge test. The owner-view/fake integration, catalogue, SQL admission/payment, renderer and combat spawn fix have separate writers. Depend on the trusted layout-read and selected-catalogue handoffs; do not touch their source files.

The larger wall allowance can be enabled and built while recovery is legacy, but starting a perimeter wave requires the supported recovery policy. Every additional wall is built atomically with its authoritative layout row; an unpositioned build route remains refused. Old wave snapshots stay immutable, and their missing new defaults are not filled with `(0,0)`.

## Implemented handoff and compatibility decision

Draft [#297](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/297) is stacked on owner-view [#285](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/285). The earlier claim #286 is closed unmerged with its branch preserved. Starting a perimeter wave requires protocol 2 and enabled or persisted V1 recovery; pathing is selected and frozen. A changed wall policy, unknown/wrong-kind identity, duplicate built identity or missing/non-grid coordinate refuses snapshot assembly.

The internal SQL health manifest and stored snapshot retain **configVersion 1**, recoveryVersion 1 and waveProtocol 2. Public start/join/current responses project a complete trusted perimeter snapshot to **geometry configVersion 2** without mutating the stored snapshot. The updated browser accepts version 2 only with wallRuleVersion 1, capacity 128, `perimeterWalls: true`, real pathing and exact supported identities. Version-1 perimeter markers and incomplete version-2 data are rejected. Older shipped clients already reject configVersion 2, so they cannot silently simulate the earlier geometry rules. No new health formula or protocol 3 is introduced.

Complete health/checkpoint vectors allow **139** current instances: 128 walls and eleven towers. SQL still decides their exact membership against the frozen snapshot; this bound grants no unknown UUID or paid repair. A full server fixture uses actual placement validation to fit all 128 wall pieces and carries all eleven towers. The first-new-wall scratch test isolates stored-coordinate recovery over an older immutable template; it is not paid-construction evidence.

Executed focused checks from `backend/` using the existing installed environment:

```sh
/workspace/The-Great-Plot-Twist/backend/.venv/bin/python -m pytest -q server/tests/test_perimeter_wave_state.py server/tests/test_wave_recovery_transport.py server/tests/test_wave_recovery_routes.py
/workspace/The-Great-Plot-Twist/backend/.venv/bin/ruff check server/island/wave_recovery.py server/island/waves.py server/routes/waves.py server/tests/test_perimeter_wave_state.py server/tests/island_sql/test_perimeter_recovery_bridge_sql.py
```

Results: **43 passed in 4.05s**, Ruff **All checks passed!**. From `frontend/`, `npm test -- --maxWorkers=1 tests/pirates/recovery-snapshot.test.js tests/pirates/recovery-controller.test.js` passed **14 tests / 2 files**. Root text lint reported **0 errors, 8 report-only findings**; `git diff --check` passed.

The scratch SQL bridge is handed to the coordinated disposable-database verification lane; no pass is claimed before its actual run. The separate WALL-32 database start wrapper must fence owner-policy admission races under the owner lock, with capability and immutable-replay checks. This Python preflight is not the sole final authority. Full application/build/browser/perimeter lifecycle acceptance, physical-device and production evidence remain separate. No live migration, activation or merge.
