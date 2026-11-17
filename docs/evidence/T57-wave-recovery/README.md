# T57 recovery gate runtime diagnostic

Reproduce the recorded 18-run matrix with:

```sh
cd frontend
WRITE_RECOVERY_DIAGNOSTIC=1 npx vitest run --maxWorkers=1 tests/pirates/recovery-balance-diagnostic.test.js
```

With `WRITE_RECOVERY_DIAGNOSTIC=1`, the test writes [`report.json`](report.json). Without it, the normal test still runs all simulations and assertions but does not write evidence files. The test uses fixed seeds for wave 2 / early, wave 15 / mid, and wave 35 / late; each is run with the same level-2 wall, cannon, and workshop layout under a solo crew proxy (`gunner: 0, carpenter: 1`) and co-op crew proxy (`gunner: 1, carpenter: 2`). Weather is fixed at ships 1.0 and fog 0. Tower health, boarder pathing, and tower obstacles are on. Walls begin at 600,000/1,000,000 HP units; cannons begin full.

Each crew/seed pair compares legacy behavior with recovery-v1 and zero journal restores, then recovery-v1 with three accepted `structure_repaired` fixture events at effective ticks 0, 100, and 200. The test checks repeatability, enforces that recovery-v1 structure HP never rises during combat without a journal restore, checks each restore reaches frozen full HP, and caps successful fixtures at three. It records duration, survival, ships sunk, island HP, tick count, and final HP for each structure.

## Recorded outcome

| Stage | Crew proxy | Legacy survival / sunk | Recovery-v1, 0 paid | Recovery-v1, 3 paid |
| --- | --- | --- | --- | --- |
| Early, wave 2 | Solo | held / 5 | held / 5 | held / 5 |
| Early, wave 2 | Co-op | held / 5 | held / 5 | held / 5 |
| Mid, wave 15 | Solo | lost / 1 | lost / 1 | lost / 1 |
| Mid, wave 15 | Co-op | lost / 2 | lost / 2 | lost / 2 |
| Late, wave 35 | Solo | lost / 0 | lost / 0 | lost / 0 |
| Late, wave 35 | Co-op | lost / 1 | lost / 1 | lost / 1 |

The early-wave runs show legacy carpenter/workshop free healing raising the four walls from their 60% start, while recovery-v1 leaves unpurchased walls at or below combat HP. Three journal restores raise their named walls to full at their scheduled ticks; later combat damage can reduce them again. The mid/late cases still lose under this fixed crew/layout even with three restores. These are deterministic simulation observations, not a claim about human difficulty or balance.

## Limits

This is a pure `createWave()` combat-simulation harness. The solo/co-op labels are crew-loadout proxies, not separate Captain/player-control simulations. The fixture `chargedPrice` is not a price quote; this diagnostic does not exercise SQL, authorization, shared quota, paid-repair races, transport, persistence, or offline clients. It isolates the changed free-repair gate and replayed full-HP events; it does not validate end-to-end payment correctness or client-reported hit trust. No gameplay tuning was changed.
