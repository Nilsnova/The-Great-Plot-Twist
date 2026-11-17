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
