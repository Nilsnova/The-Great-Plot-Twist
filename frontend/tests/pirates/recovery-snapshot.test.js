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
});
