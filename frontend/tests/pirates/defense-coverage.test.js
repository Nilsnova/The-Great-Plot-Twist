import { describe, expect, it } from 'vitest';
import { createWave, previewDefenseCoverage } from '../../src/pirates/sim.js';

const defense = (kind, extra = {}) => ({ id: kind, kind, level: 1, x: 5, z: -4, ...extra });
const watchtower = extra => defense('watchtower', extra);

describe('clear-weather primary defense coverage', () => {
  it.each([
    ['cannon', { bonus: 'long_guns' }, 66.72, 0, ['ships', 'boarders']],
    ['mortar', { spec: 'long_range' }, 83.28, 8, ['ships', 'boarders']],
    ['harpoon', {}, 64.08, 0, ['sailing-ships']],
    ['culverin', {}, 52.8, 12, ['ships']],
    ['swivel', {}, 15.6, 0, ['boarders']],
  ])('describes the %s and matches the running sim without weather or events', (kind, extra, range, minRange, targets) => {
    const options = { defensesV2: true, defenses: [
      defense(kind, extra),
      watchtower({ id: 'b', level: 5, bonus: 'high_tower' }),
      watchtower({ id: 'a', spec: 'eagle_eye' }),
    ] };
    const tower = createWave(options).state().towers[0];
    expect(previewDefenseCoverage(options.defenses, kind, options)).toEqual({
      id: kind, kind, level: 1, x: 5, z: -4, range, minRange, targets,
    });
    expect(tower.range).toBe(range);
  });

  it('applies Eagle eye at its exact boundary, once only, using confirmed positions', () => {
    const cannon = defense('cannon');
    const lookouts = [
      watchtower({ id: 'b', x: -17, spec: 'eagle_eye' }),
      watchtower({ id: 'a', x: 27, spec: 'eagle_eye' }),
    ];
    expect(previewDefenseCoverage([cannon, ...lookouts], cannon.id).range).toBe(43.2);
    expect(previewDefenseCoverage([{ ...cannon, z: -3.5 }, ...lookouts], cannon.id).range).toBe(36);
  });

  it('omits missing selections, supports, malformed defenses and disabled culverins', () => {
    const defenses = [defense('culverin'), watchtower(), defense('cannon', { x: Infinity })];
    expect(previewDefenseCoverage(defenses, 'culverin')).toBeNull();
    expect(previewDefenseCoverage(defenses, 'watchtower')).toBeNull();
    expect(previewDefenseCoverage(defenses, 'cannon')).toBeNull();
    expect(previewDefenseCoverage(defenses, 'missing')).toBeNull();
    expect(previewDefenseCoverage(null, 'culverin', { defensesV2: true })).toBeNull();
  });

  it('leaves the active sim sight to weather and event rules', () => {
    const options = { wave: 4, weather: { fog: .5 }, crew: { lookout: 1 }, defenses: [defense('mortar')] };
    const preview = previewDefenseCoverage(options.defenses, 'mortar');
    expect(preview.range).toBe(36);
    expect(createWave(options).state().towers[0].range).toBe(21.6);
    expect(createWave({ ...options, event: 'night_raid' }).state().towers[0].range).toBe(14.04);
  });
});
