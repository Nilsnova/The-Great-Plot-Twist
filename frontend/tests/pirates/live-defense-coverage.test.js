import { describe, expect, it } from 'vitest';
import { CONFIG, createWave } from '../../src/pirates/sim.js';
import { towers, walls } from './balance-fixture.js';

const defense = (kind, overrides = {}) => ({ id: kind, kind, level: 1, x: 5, z: -4, ...overrides });

function firstEvent(sim, type) {
  for (let tick = 0; tick < 3_000 && !sim.done; tick++) {
    const event = sim.step(CONFIG.tick).find(item => item.type === type);
    if (event) return event;
  }
  throw new Error(`Expected ${type} in the fixture wave`);
}

describe('live tower attack coverage', () => {
  it('reads raw frozen range, geometry and reload during countdown', () => {
    const sim = createWave({ wave: 4, countdown: 5, weather: { fog: .3337 }, defenses: [defense('mortar')] });
    const range = 36 * (1 - .3337);
    expect(sim.attackCoverage('mortar')).toEqual({
      id: 'mortar', kind: 'mortar', level: 1, x: 5, z: -4, range, minRange: 8, litRange: null,
      targets: ['ships', 'boarders'], status: 'ready', reload: 1,
    });
    expect(sim.state().phase).toBe('countdown');
    expect(sim.state().towers[0].range).toBe(23.99);
    expect(sim.state().towers[0].range).not.toBe(range);
  });

  it('uses the fog-bank Watchtower boundary exactly', () => {
    const sim = createWave({ wave: 4, event: 'fog_bank', defenses: [
      defense('watchtower', { x: 0, z: 0 }),
      defense('cannon', { id: 'on-edge', x: 16, z: 0 }),
      defense('cannon', { id: 'outside', x: 16.001, z: 0 }),
    ] });
    expect(sim.attackCoverage('on-edge')).toMatchObject({ range: 36, litRange: null });
    expect(sim.attackCoverage('outside')).toMatchObject({ range: 36 * .8, litRange: null });
  });

  it('separates normal night sight from reach for lit targets, with ordinary fog and lookout applied to both', () => {
    const options = { wave: 12, event: 'night_raid', weather: { fog: .5 }, crew: { lookout: 1 }, defenses: [defense('mortar')] };
    expect(createWave(options).attackCoverage('mortar')).toMatchObject({
      range: 36 * .6 * .65, litRange: 36 * .6, minRange: 8,
    });
    expect(createWave({ ...options, flagship: true }).attackCoverage('mortar')).toMatchObject({
      range: 36 * .6, litRange: null,
    });
    const heavy = createWave({ ...options, crew: {}, weather: { fog: .9 } }).attackCoverage('mortar');
    expect(heavy.range).toBeLessThan(heavy.minRange);
    expect(heavy.litRange).toBeLessThan(heavy.minRange);
  });

  it('does not expose absent, non-attacking or frozen-off defenses', () => {
    const defenses = [defense('culverin'), defense('harpoon'), defense('swivel'), defense('watchtower'), defense('wall')];
    const sim = createWave({ defenses });
    for (const id of ['missing', 'watchtower', 'wall', 'culverin']) expect(sim.attackCoverage(id)).toBeNull();
    expect(sim.attackCoverage('harpoon').targets).toEqual(['sailing-ships']);
    expect(sim.attackCoverage('swivel').targets).toEqual(['boarders']);
    expect(createWave({ defenses, defensesV2: true }).attackCoverage('culverin')).toMatchObject({
      range: 44, minRange: 12, targets: ['ships'],
    });
  });

  it('reads destroyed status until the correct replayed repair restores the frozen tower', () => {
    const cannon = defense('cannon', { spot: 'cannon', instanceId: 'cannon-instance', hpUnits: 0, maxHP: 80, repairSeq: 0 });
    const sim = createWave({ wave: 3, defenses: [cannon], recoveryStructures: [cannon],
      towerHealth: true, recoveryVersion: 1, waveProtocol: 2 });
    expect(sim.attackCoverage(cannon.id)).toMatchObject({ status: 'destroyed', range: 28 });
    const restore = { type: 'structure_repaired', serverSeq: 1, effectiveTick: 0,
      payload: { spot: cannon.id, instanceId: cannon.instanceId, hpUnits: 1_000_000, maxHP: 80, repairSeq: 1 } };
    expect(sim.applyRecoveryEvent({ ...restore, payload: { ...restore.payload, instanceId: 'old-cannon' } })).toBe(false);
    expect(sim.attackCoverage(cannon.id).status).toBe('destroyed');
    expect(sim.applyRecoveryEvent(restore)).toBe(true);
    expect(sim.attackCoverage(cannon.id).status).toBe('ready');
  });

  it('reads live jamming and expires it with the simulation clock', () => {
    const cannon = defense('cannon', { x: 0, z: -6 });
    const sim = createWave({ seed: 7919, wave: 18, defenses: [cannon], lanes: [{ id: 'south', bearing: 90 }] });
    const event = firstEvent(sim, 'tower_jammed');
    expect(event.towerId).toBe(cannon.id);
    expect(sim.attackCoverage(cannon.id).status).toBe('jammed');
    sim.step(event.until - event.t - CONFIG.tick);
    expect(sim.attackCoverage(cannon.id).status).toBe('jammed');
    sim.step(CONFIG.tick);
    expect(sim.attackCoverage(cannon.id).status).toBe('ready');
  });

  it('reads live siege silence from the existing event rule', () => {
    const sim = createWave({ seed: 9, wave: 12, event: 'siege_barge', island: { hp: 5000 },
      defenses: [...walls(3), ...towers([['cannon', 1], ['cannon', 1]])] });
    const event = firstEvent(sim, 'tower_silenced');
    expect(sim.attackCoverage(event.towerId).status).toBe('silenced');
  });

  it('keeps the event stream and state identical when queried and drops coverage at wave end', () => {
    const options = { seed: 5, wave: 5, event: 'night_raid', defenses: [defense('cannon')] };
    const baseline = createWave(options), queried = createWave(options);
    for (let step = 0; step < 700 && !baseline.done; step++) {
      const info = queried.attackCoverage('cannon');
      info.targets.push('untrusted caller');
      expect(queried.attackCoverage('cannon').targets).toEqual(['ships', 'boarders']);
      expect(queried.step(.25)).toEqual(baseline.step(.25));
      if (step % 8 === 0) expect(queried.state()).toEqual(baseline.state());
    }
    expect(baseline.done).toBe(true);
    expect(queried.state()).toEqual(baseline.state());
    expect(queried.result()).toEqual(baseline.result());
    expect(queried.attackCoverage('cannon')).toBeNull();
  });
});
