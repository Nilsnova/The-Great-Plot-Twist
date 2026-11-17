// The real controller must reserve the device's onboarding hint for actual wave one.
import {afterEach, expect, it, vi} from 'vitest';
import {createWaveController, HINT_KEY, HINT_SECONDS} from '../../src/pirates/controller.js';

afterEach(() => vi.unstubAllGlobals());

it('does not consume the hint on wave 41, shows it on wave one once, and keeps its existing lifetime', async () => {
  const values = new Map(), writes = vi.fn((key, value) => values.set(key, value));
  vi.stubGlobal('localStorage', {getItem: key => values.get(key), setItem: writes});
  let now = Date.UTC(2026, 10, 17), controller;
  const hints = [], make = wave => ({waveId: `wave-${wave}`, wave, seed: 77,
    startsAt: new Date(now).toISOString(), weather: {kind: 'calm', ships: 1, fog: 0}, flagship: false});
  const mount = async wave => {
    controller = createWaveController({guide: true, now: () => now, getDefenses: () => [],
      world: {scene: {}, container: {}}, createGuide: () => ({update() {}, dispose() {}}),
      createRenderer: () => ({events() {}, update() {}, setVisible() {}, dispose() {}}),
      createHud: () => ({goalHint: show => hints.push(show), bar() {}, countdown() {}, prompt() {}, banner() {}, setVisible() {}, dispose() {}})});
    controller.start(make(wave)); await Promise.resolve(); await Promise.resolve(); controller.update(0);
  };
  await mount(41); expect(hints.at(-1)).toBe(false); expect(writes).not.toHaveBeenCalled(); controller.dispose();
  await mount(1); expect(hints.at(-1)).toBe(true); expect(writes).toHaveBeenCalledExactlyOnceWith(HINT_KEY, '1');
  now += (HINT_SECONDS + 1) * 1000; controller.update(.1); expect(hints.at(-1)).toBe(false); controller.dispose();
  await mount(1); expect(hints.at(-1)).toBe(false); expect(writes).toHaveBeenCalledTimes(1); controller.dispose();
});
