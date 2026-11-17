// The wave's simulation rules from the server ("rules" on the wave answers): wave-rules.js reads them,
// the controller hands them to createWave(), so every client of a wave plays the same rules whatever
// its own /api/config says. Without "rules" a wave plays exactly as before.
import { describe, expect, it, vi } from 'vitest';
import { coastPoint } from '../../src/pirates/sim.js';
import { createWaveController, readWaveInfo } from '../../src/pirates/controller.js';
import { RULE_OPTIONS, readRules } from '../../src/pirates/wave-rules.js';

const START = Date.UTC(2026, 10, 14, 12, 0, 0);
const INFO = { waveId: 'w-r', wave: 1, seed: 77, startsAt: new Date(START + 1000).toISOString(), weather: { kind: 'calm', ships: 1, fog: 0 }, flagship: false };
const p = coastPoint(Math.PI / 4, .75);
const DEFENSES = [{ id: 'cannon_2', kind: 'cannon', level: 1, x: p.x, z: p.z }];

function controllerWith(renderers, defenses = DEFENSES, recoveryTransport = null) {
  const clock = { now: START }, listeners = new Map();
  const bus = { on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(event) { for (const fn of [...(listeners.get(event.type) ?? [])]) fn(event); } };
  const controller = createWaveController({ bus, getDefenses: () => defenses, now: () => clock.now, world: { scene: {}, container: {} },
    finishWave: vi.fn(async () => ({ loot: 0 })), playCutscene: async () => {},
    createRenderer: options => { renderers.push(options); return { events() {}, update() {}, setVisible() {}, dispose() {} }; },
    createHud: () => ({ countdown() {}, bar() {}, prompt() {}, banner() {}, setVisible() {}, dispose() {} }),
    setTimer: () => ({}), clearTimer: () => {}, recoveryTransport });
  const advance = ms => { for (let t = 0; t < ms; t += 100) { clock.now += 100; controller.update(.1); } };
  return { bus, controller, advance };
}

describe('the wave rules', () => {
  it('turns known names into true options and ignores everything else', () => {
    expect(readRules(['tower_health', 'nonsense'])).toEqual({ towerHealth: true, pathing: false, towerObstacles: false, rescue: false, defensesV2: false, shipFire: false, structureRecovery: false });
    expect(readRules(undefined)).toEqual({ towerHealth: false, pathing: false, towerObstacles: false, rescue: false, defensesV2: false, shipFire: false, structureRecovery: false });
    expect(readRules(['pathing'])).toEqual({ towerHealth: false, pathing: true, towerObstacles: false, rescue: false, defensesV2: false, shipFire: false, structureRecovery: false });
    expect(readRules('tower_health')).toEqual({ towerHealth: false, pathing: false, towerObstacles: false, rescue: false, defensesV2: false, shipFire: false, structureRecovery: false });
    expect(readRules(['rescue']).rescue).toBe(true);
    expect(readRules(['defenses_v2']).defensesV2).toBe(true); // T43: the culverins fight only with this rule
    expect(readRules(['tower_health', 'pathing', 'tower_obstacles']).towerObstacles).toBe(true);
    expect(readRules(['ship_fire']).shipFire).toBe(true); // T50: ships fire at real targets only with this rule
    expect(readRules(['structure_recovery']).structureRecovery).toBe(true);
    expect(Object.values(RULE_OPTIONS)).toContain('towerHealth');
  });

  it('reads the rules of a wave answer', () => {
    expect(readWaveInfo({ ...INFO, rules: ['tower_health'] }).rules).toEqual({ towerHealth: true, pathing: false, towerObstacles: false, rescue: false, defensesV2: false, shipFire: false, structureRecovery: false });
    expect(readWaveInfo(INFO).rules).toEqual({ towerHealth: false, pathing: false, towerObstacles: false, rescue: false, defensesV2: false, shipFire: false, structureRecovery: false });
    expect(readWaveInfo({ ...INFO, recoveryVersion: 1, waveProtocol: 2, rules: ['structure_recovery'] })).toBeNull();
    expect(readWaveInfo({ ...INFO, recoveryVersion: 1, waveProtocol: 1, rules: ['structure_recovery'] })).toBeNull();
    expect(readWaveInfo({ ...INFO, recoveryVersion: 1, waveProtocol: 2 })).toBeNull();
  });

  it('starts recovery v1 from the immutable HP vector and snapshot defenses, including a D060 spot', () => {
    const rules = ['structure_recovery', 'tower_health'];
    const initialSnapshot = { recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId: 'w-r', islandEpoch: 'epoch-1',
      seed: 77, startsAt: INFO.startsAt, weather: INFO.weather, rules,
      createWave: { seed: 77, wave: 1, weather: INFO.weather, defenses: [
        { id: 'wall_2', kind: 'wall', level: 2, x: 0, z: 1 },
        { id: 'house_1', kind: 'house', level: 2, spec: 'workshop', x: 1, z: 1 },
      ], crew: { carpenter: 2 } },
      structures: [
        { spot: 'wall_2', instanceId: 'wall-instance', kind: 'wall', level: 2, x: 0, z: 1, hpUnits: 0, maxHP: 120, repairSeq: 0 },
        { spot: 'cannon_8', instanceId: 'gun-instance', kind: 'cannon', level: 1, x: -8, z: 12, hpUnits: 500_000, maxHP: 80, repairSeq: 0 },
      ] };
    const made = controllerWith([], DEFENSES, { sendInputs: async () => ({ ok: true }), readEvents: async () => ({ ok: true, data: {} }) });
    made.bus.emit({ type: 'wave_started_server', ...INFO, recoveryVersion: 1, waveProtocol: 2, rules, initialSnapshot,
      participantToken: '7165d60f-14f5-4b9e-96a0-2ed457b4c219', lastActorCounter: 0 });
    made.advance(2000);
    expect(made.controller.state.walls).toMatchObject([{ id: 'wall_2', hp: 0, broken: true }]);
    expect(made.controller.state.towers).toMatchObject([{ id: 'cannon_8', hp: 40, maxHp: 80 }]);
  });

  it('a wave with tower_health gives its towers hp and paints the tower states; without it nothing changes', () => {
    const on = [], off = [];
    const withRule = controllerWith(on), without = controllerWith(off);
    withRule.bus.emit({ type: 'wave_started_server', ...INFO, rules: ['tower_health'] });
    without.bus.emit({ type: 'wave_started_server', ...INFO });
    withRule.advance(2000); without.advance(2000);
    expect(withRule.controller.state.towers[0]).toMatchObject({ hp: 80, maxHp: 80 });
    expect(without.controller.state.towers[0].hp).toBeUndefined();
    expect(on[0].towerStates).toBe(true);
    expect(off[0].towerStates).toBe(false);
  });

  it('a wave with ship_fire (T50) has the ships fire at real targets; without it they shell as before', () => {
    const withRule = controllerWith([], []), without = controllerWith([], []);
    withRule.bus.emit({ type: 'wave_started_server', ...INFO, rules: ['ship_fire'] });
    without.bus.emit({ type: 'wave_started_server', ...INFO });
    withRule.advance(40000); without.advance(40000);
    // Nothing built: the sloops at anchor aim at the heart, and their balls cost it ♥.
    expect(withRule.controller.state.shipShots).toBeDefined();
    expect(withRule.controller.state.islandHp).toBeLessThan(without.controller.state.islandHp);
    expect(without.controller.state.shipShots).toBeUndefined();
  });

  it('a culverin fights and is drawn only in a wave with defenses_v2 (T43); without it the wave plays without it', () => {
    const q = coastPoint(Math.PI * 3 / 4, .75), island = [...DEFENSES, { id: 'cannon_3', kind: 'culverin', level: 2, x: q.x, z: q.z }];
    const on = [], off = [];
    const withRule = controllerWith(on, island), without = controllerWith(off, island);
    withRule.bus.emit({ type: 'wave_started_server', ...INFO, rules: ['defenses_v2'] });
    without.bus.emit({ type: 'wave_started_server', ...INFO });
    withRule.advance(1000); without.advance(1000);
    expect(withRule.controller.state.towers.map(tower => tower.kind)).toEqual(['cannon', 'culverin']);
    expect(without.controller.state.towers.map(tower => tower.kind)).toEqual(['cannon']);
    expect(on[0]).toMatchObject({ culverins: true });
    expect(on[0].defenses.map(item => item.kind)).toContain('culverin');
    expect(off[0]).toMatchObject({ culverins: false });
    expect(off[0].defenses.map(item => item.kind)).not.toContain('culverin');
  });
});
