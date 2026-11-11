// Fog balance: the first wave in fog stays winnable with the first cannon, wherever it stands.
import { describe, expect, it } from 'vitest';
import { CONFIG, coastPoint, createWave } from '../../src/pirates/sim.js';
import { ISLAND_RULES } from '../../src/pirates/fake-api.js';

const at = (id, bearing) => {
  const p = coastPoint(bearing * Math.PI / 180, .75);
  return { id, kind: 'cannon', x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 };
};
const CANNONS = [at('cannon_1', -45), at('cannon_2', 45), at('cannon_3', 135), at('cannon_4', -135)];
const run = options => { const wave = createWave(options); while (!wave.done) wave.step(1); return wave.result(); };

describe('pirate wave fog balance', () => {
  it('lets one cannon on any corner win wave 1 in the fog the weather sends', () => {
    const fog = ISLAND_RULES.weather.fog.fog;
    for (const cannon of CANNONS) for (let seed = 1; seed <= 20; seed++) {
      expect(run({ seed, wave: 1, weather: { fog }, defenses: [cannon] })).toMatchObject({ survived: true, shipsSunk: 3 });
    }
    // Even the thickest fog leaves wave 1 a minimum sight.
    const thick = createWave({ seed: 1, wave: 1, weather: { fog: CONFIG.fog.max }, defenses: [CANNONS[1]] }).state();
    expect(thick.sight).toBeCloseTo(CONFIG.cannon.range * CONFIG.fog.firstWaveSight, 5);
    expect(run({ seed: 1, wave: 1, weather: { fog: CONFIG.fog.max }, defenses: [CANNONS[1]] }).survived).toBe(true);
  });

  it('keeps the full fog from wave 2 on', () => {
    const state = createWave({ seed: 1, wave: 2, weather: { fog: .4 }, defenses: [CANNONS[1]] }).state();
    expect(state.sight).toBeCloseTo(CONFIG.cannon.range * .6, 5);
  });
});
