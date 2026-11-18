import { describe, expect, it } from 'vitest';
import { readRecoverySnapshot, recoveryWaveDefenses } from '../../src/pirates/recovery-snapshot.js';
import { createWave } from '../../src/pirates/sim.js';

const makeSnapshot = () => ({ recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId: 'wave-a', islandEpoch: 'epoch-a',
  seed: 4, startsAt: '2026-11-16T12:00:00Z', weather: { kind: 'calm' }, rules: ['structure_recovery'],
  participants: [{ participantToken: '7165d60f-14f5-4b9e-96a0-2ed457b4c219', captain: { level: 2, skills: [], weapon: 'musket' } }],
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
  it('accepts public geometry v2 only with the complete frozen perimeter contract', () => {
    const source = makeSnapshot();
    source.configVersion = 2; source.wallRuleVersion = 1; source.wallCapacity = 128;
    source.rules.push('pathing');
    source.createWave.pathing = true; source.createWave.perimeterWalls = true;
    source.structures[0].spot = 'wall_128'; source.createWave.defenses[0].id = 'wall_128';
    const snapshot = readRecoverySnapshot(source, 'wave-a');
    expect(snapshot?.configVersion).toBe(2);
    expect(recoveryWaveDefenses(snapshot)[0].id).toBe('wall_128');
    expect(Object.isFrozen(snapshot.createWave)).toBe(true);
    for (const change of [{configVersion: 1}, {wallRuleVersion: 0}, {wallCapacity: 12},
      {createWave: {...source.createWave, pathing: false}}, {createWave: {...source.createWave, perimeterWalls: false}},
      {rules: ['structure_recovery']}]) expect(readRecoverySnapshot({...source, ...change}, 'wave-a')).toBeNull();
    const unknown = structuredClone(source); unknown.structures[0].spot = 'wall_129';
    expect(readRecoverySnapshot(unknown, 'wave-a')).toBeNull();
    const wrongKind = structuredClone(source); wrongKind.structures[0].kind = 'cannon';
    expect(readRecoverySnapshot(wrongKind, 'wave-a')).toBeNull();
    const malformed = structuredClone(source); malformed.structures[0].spot = 'wall_013';
    expect(readRecoverySnapshot(malformed, 'wave-a')).toBeNull();
    const full = structuredClone(source);
    const ids = [...Array.from({length: 128}, (_, i) => `wall_${i + 1}`), ...Array.from({length: 11}, (_, i) => `cannon_${i + 1}`)];
    full.structures = ids.map(spot => ({...source.structures[0], spot, instanceId: `instance-${spot}`, kind: spot.startsWith('wall_') ? 'wall' : 'cannon'}));
    full.createWave.defenses = full.structures.map(row => ({id: row.spot, kind: row.kind, level: row.level, x: row.x, z: row.z}));
    expect(readRecoverySnapshot(full, 'wave-a')?.structures).toHaveLength(139);
    full.structures.push({...full.structures[0], spot: 'wall_129', instanceId: 'one-too-many'});
    expect(readRecoverySnapshot(full, 'wave-a')).toBeNull();
    expect(source.configVersion).toBe(2);
  });

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
    const privateIdentity = makeSnapshot(); privateIdentity.participants[0].playerId = 'profile-uuid';
    expect(readRecoverySnapshot(privateIdentity, 'wave-a')).toBeNull();
    expect(readRecoverySnapshot({ ...makeSnapshot(), participants: [] }, 'wave-a')).toBeNull();
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

  it('reconciles a paid restore after terminal sim without changing combat result or ticking combat again', () => {
    const snapshot = readRecoverySnapshot(makeSnapshot(), 'wave-a');
    const wave = createWave({ ...snapshot.createWave, wave: 1, seed: snapshot.seed, weather: { ships: .5, fog: 0 },
      defenses: recoveryWaveDefenses(snapshot), towerHealth: true, recoveryStructures: snapshot.structures,
      recoveryVersion: 1, waveProtocol: 2 });
    let ticks = 0;
    while (!wave.done && ticks < 4000) { wave.step(.05); ticks++; }
    expect(wave.done).toBe(true);
    const result = wave.result();
    expect(wave.state().walls.find(item => item.id === 'wall_1').hp).toBe(0);
    expect(wave.applyRecoveryEvent({ serverSeq: 1, effectiveTick: ticks, type: 'structure_repaired', payload: {
      spot: 'wall_1', instanceId: 'instance-a', hpUnits: 1_000_000, maxHP: 120, repairSeq: 1, chargedPrice: 50,
    } })).toBe(true);
    expect(wave.state().walls.find(item => item.id === 'wall_1').hp).toBe(120);
    wave.step(1);
    expect(wave.result()).toEqual(result);
    expect(wave.state().walls.find(item => item.id === 'wall_1').hp).toBe(120);
  });
});
