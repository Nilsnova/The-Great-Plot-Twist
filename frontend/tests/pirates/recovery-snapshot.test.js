import { describe, expect, it } from 'vitest';
import { readRecoverySnapshot, recoveryWaveDefenses } from '../../src/pirates/recovery-snapshot.js';
import { createWave } from '../../src/pirates/sim.js';

const makeSnapshot = () => ({ recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId: 'wave-a', islandEpoch: 'epoch-a',
  seed: 4, startsAt: '2026-11-16T12:00:00Z', weather: { kind: 'calm' }, rules: ['structure_recovery'],
  createWave: { defenses: [
    { id: 'wall_1', kind: 'wall', level: 2, x: 0, z: 1 },
    { id: 'house_1', kind: 'house', level: 2, spec: 'workshop', x: 1, z: 1 },
  ], crew: { carpenter: 1 } },
  structures: [
    { spot: 'wall_1', instanceId: 'instance-a', kind: 'wall', level: 2, x: 0, z: 1, hpUnits: 0, maxHP: 120, repairSeq: 0 },
    { spot: 'cannon_8', instanceId: 'instance-b', kind: 'cannon', level: 1, x: -8, z: 12, hpUnits: 500_000, maxHP: 80, repairSeq: 4 },
  ],
});

describe('recovery-v1 immutable wave snapshots', () => {
  it('validates versions and HP identity, then owns a frozen copy', () => {
    const source = makeSnapshot();
    const snapshot = readRecoverySnapshot(source, 'wave-a');
    expect(snapshot?.structures).toHaveLength(2);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.structures[0])).toBe(true);
    source.structures[0].hpUnits = 200;
    expect(snapshot.structures[0].hpUnits).toBe(0);
  });

  it('rejects unsupported versions, missing rule, duplicate identity, and out-of-range health', () => {
    expect(readRecoverySnapshot({ ...makeSnapshot(), waveProtocol: 1 }, 'wave-a')).toBeNull();
    expect(readRecoverySnapshot({ ...makeSnapshot(), rules: [] }, 'wave-a')).toBeNull();
    const duplicate = makeSnapshot(); duplicate.structures[1].spot = 'wall_1';
    expect(readRecoverySnapshot(duplicate, 'wave-a')).toBeNull();
    const invalid = makeSnapshot(); invalid.structures[0].hpUnits = 1_000_001;
    expect(readRecoverySnapshot(invalid, 'wave-a')).toBeNull();
  });

  it('uses frozen instance rows, includes newly unlocked D060 spots, and keeps role buildings', () => {
    const snapshot = readRecoverySnapshot(makeSnapshot(), 'wave-a');
    expect(recoveryWaveDefenses(snapshot)).toEqual([
      { id: 'wall_1', spot: 'wall_1', instanceId: 'instance-a', kind: 'wall', level: 2, x: 0, z: 1, hpUnits: 0, maxHP: 120, repairSeq: 0 },
      { id: 'house_1', kind: 'house', level: 2, spec: 'workshop', x: 1, z: 1 },
      { id: 'cannon_8', spot: 'cannon_8', instanceId: 'instance-b', kind: 'cannon', level: 1, x: -8, z: 12, hpUnits: 500_000, maxHP: 80, repairSeq: 4 },
    ]);
  });

  it('applies only the current instance full-repair event once and rejects stale sequence, instance and tick', () => {
    const snapshot = readRecoverySnapshot(makeSnapshot(), 'wave-a');
    const wave = createWave({ ...snapshot.createWave, defenses: recoveryWaveDefenses(snapshot), towerHealth: true,
      recoveryVersion: 1, waveProtocol: 2 });
    const repair = { serverSeq: 9, effectiveTick: 0, type: 'structure_repaired', payload: {
      spot: 'cannon_8', instanceId: 'instance-b', hpUnits: 1_000_000, maxHP: 80, repairSeq: 5, chargedPrice: 100,
    } };
    expect(wave.state().towers.find(tower => tower.id === 'cannon_8').hp).toBe(40);
    expect(wave.applyRecoveryEvent(repair)).toBe(true);
    expect(wave.state().towers.find(tower => tower.id === 'cannon_8').hp).toBe(80);
    expect(wave.applyRecoveryEvent(repair)).toBe(false);
    expect(wave.applyRecoveryEvent({ ...repair, payload: { ...repair.payload, repairSeq: 4 } })).toBe(false);
    expect(wave.applyRecoveryEvent({ ...repair, payload: { ...repair.payload, instanceId: 'old-instance' } })).toBe(false);
    wave.step(.05);
    expect(wave.applyRecoveryEvent(repair)).toBe(false);
  });

  it('preserves one normalized HP unit as positive wall and tower health in public sim state', () => {
    const snapshotData = makeSnapshot();
    snapshotData.createWave.defenses[0].level = 1;
    snapshotData.structures = [
      { spot: 'wall_1', instanceId: 'wall-tiny', kind: 'wall', level: 1, x: 0, z: 1, hpUnits: 1, maxHP: 60, repairSeq: 0 },
      { spot: 'cannon_1', instanceId: 'tower-tiny', kind: 'cannon', level: 1, x: 2, z: 1, hpUnits: 1, maxHP: 80, repairSeq: 0 },
    ];
    const snapshot = readRecoverySnapshot(snapshotData, 'wave-a');
    const wave = createWave({ ...snapshot.createWave, defenses: recoveryWaveDefenses(snapshot), towerHealth: true,
      recoveryVersion: 1, waveProtocol: 2 });
    const state = wave.state();
    const wall = state.walls.find(item => item.id === 'wall_1');
    const tower = state.towers.find(item => item.id === 'cannon_1');
    expect(wall.hp).toBeGreaterThan(0);
    expect(wall.broken).toBe(false);
    expect(tower.hp).toBeGreaterThan(0);
    expect(tower.broken).toBe(false);
    expect(wave.recoveryHealthVector()).toEqual({ hpUnits: { 'wall-tiny': 1, 'tower-tiny': 1 },
      basisRepairSeq: { 'wall-tiny': 0, 'tower-tiny': 0 } });
  });

  it('keeps an inactive culverin in the full vector and accepts a matching paid restore event', () => {
    const snapshotData = makeSnapshot();
    snapshotData.structures.push({ spot: 'culverin_8', instanceId: 'culverin-instance', kind: 'culverin', level: 1,
      x: 3, z: 4, hpUnits: 250_000, maxHP: 56, repairSeq: 3 });
    const snapshot = readRecoverySnapshot(snapshotData, 'wave-a');
    const wave = createWave({ ...snapshot.createWave, defenses: recoveryWaveDefenses(snapshot), towerHealth: true,
      recoveryStructures: snapshot.structures, recoveryVersion: 1, waveProtocol: 2 });
    expect(wave.recoveryHealthVector().hpUnits['culverin-instance']).toBe(250_000);
    expect(wave.applyRecoveryEvent({ serverSeq: 10, effectiveTick: 0, type: 'structure_repaired', payload: {
      spot: 'culverin_8', instanceId: 'culverin-instance', hpUnits: 1_000_000, maxHP: 56, repairSeq: 4, chargedPrice: 200,
    } })).toBe(true);
    expect(wave.recoveryHealthVector()).toMatchObject({ hpUnits: { 'culverin-instance': 1_000_000 },
      basisRepairSeq: { 'culverin-instance': 4 } });
  });
});
