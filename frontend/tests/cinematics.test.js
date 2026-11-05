// Finale presentation timing and chart projection do not decide a solve or reward.
import { expect, it } from 'vitest';
import { createTimeline, cinematicNames, projectLights } from '../src/world/cinematics/logic.js';
import { places } from '../src/world/places/registry.js';
it('finishes every named beat within fifteen seconds and supports skip/reduced motion', () => {
  for (const name of cinematicNames) {
    const line = createTimeline(name); line.tick(14); expect(line.done).toBe(true);
    const skipped = createTimeline(name); skipped.skip(); expect(skipped.progress).toBe(1);
    expect(createTimeline(name,{reducedMotion:true}).done).toBe(true);
  }
  expect(() => createTimeline('unknown')).toThrow('Unknown cinematic');
});
it('projects the exact registered light origins and rejects duplicate/unknown lights', () => {
  const lights = projectLights(places,['keepers_lamp','harbor_light','islet_signal_station']);
  expect(lights.map(light=>light.id)).toEqual(['keepers_lamp','harbor_light','islet_signal_station']);
  expect(lights.every(light=>Number.isFinite(light.x)&&Number.isFinite(light.y))).toBe(true);
  expect(() => projectLights(places,['wrong'])).toThrow('Unknown light');
  expect(() => projectLights(places,['harbor_light','harbor_light'])).toThrow('Duplicate light');
});
