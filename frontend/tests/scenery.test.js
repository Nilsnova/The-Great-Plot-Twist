// T21: the code-drawn scenes of the title and the cutscenes (src/art/scenery.js, src/art/stage.js), without a browser.
import {describe, expect, it} from 'vitest';
import {MOODS, PANELS, sceneLayout, topAt} from '../src/art/scenery.js';
import {stageRatio} from '../src/art/stage.js';

describe('cartoon scenes', () => {
  it('lays a scene out for a laptop and a phone: the horizon, the scale and the pan margin', () => {
    const laptop = sceneLayout(1280, 800), phone = sceneLayout(390, 844);
    expect(laptop).toMatchObject({portrait: false, hz: 480, s: 1, margin: 36});
    expect(phone.portrait).toBe(true);
    expect(phone.s).toBeGreaterThan(390 / 1280); // a phone never shrinks the art to a third
    expect(sceneLayout(390, 844, {horizon: .48, portraitHorizon: .58}).hz).toBe(Math.round(844 * .58));
    expect(sceneLayout(1280, 800, {horizon: .48, portraitHorizon: .58}).hz).toBe(384);
  });
  it('finds the top of a smooth hill so the lighthouse and the cabin stand on it', () => {
    const hill = [[0, 100], [50, 0], [100, 100], [50, 120]];
    expect(topAt(hill, 50)).toBeGreaterThan(0);
    expect(topAt(hill, 50)).toBeLessThan(60);
    expect(topAt(hill, 500, -1)).toBe(-1);
  });
  it('keeps each painted layer near 2.6 million pixels and never below 0.75 or above 2x', () => {
    expect(stageRatio(1280, 800, 2)).toBeCloseTo(Math.sqrt(2.6e6 / (1280 * 800)), 5);
    expect(stageRatio(390, 844, 3)).toBe(2);
    expect(stageRatio(390, 844, 1)).toBe(1);
    expect(stageRatio(5000, 3000, 2)).toBe(.75);
  });
  it('names a mood for every panel and only in-game ship drawings', () => {
    for (const [name, panel] of Object.entries(PANELS)) {
      expect(MOODS[panel.sky], name).toBeDefined();
      for (const ship of panel.ships ?? []) expect(ship.name, name).toMatch(/^pirate-(sloop|flagship|warship)-1$|^pirate-wreck$/);
    }
  });
});
