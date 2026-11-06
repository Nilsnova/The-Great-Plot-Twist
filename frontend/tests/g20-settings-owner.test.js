// Shared preference owner: snapshots, subscriptions and system-motion lifecycle.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
let media, dataset;
beforeEach(() => {
  vi.resetModules(); media = Object.assign(new EventTarget(), { matches: true }); dataset = {};
  vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: vi.fn() }, matchMedia: () => media });
  vi.stubGlobal('document', { documentElement: { dataset } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('persists normalized patches and protects state from returned snapshots/listener mutation', async () => {
  const prefs = await import('../src/settings/preferences.js');
  const listener = vi.fn(value => { value.music = 99; }); const stop = prefs.onPreferences(listener);
  expect(prefs.setPreferences({ master: 0, colourblind: true })).toBe(true);
  expect(prefs.getPreferences()).toMatchObject({ master: 0, music: .35, colourblind: true });
  const snapshot = prefs.getPreferences(); snapshot.quality = 'low'; expect(prefs.getPreferences().quality).toBe('high');
  expect(dataset).toEqual({ reducedMotion: 'true', colourblind: 'true' });
  stop(); prefs.setPreferences({ quality: 'low' }); expect(listener).toHaveBeenCalledOnce();
});

it('watches system motion until unsubscribed and respects explicit user overrides', async () => {
  const prefs = await import('../src/settings/preferences.js'), listener = vi.fn(); prefs.onPreferences(listener);
  const stop = prefs.watchSystemMotion(); expect(prefs.reducedMotion()).toBe(true);
  media.matches = false; media.dispatchEvent(new Event('change')); expect(dataset.reducedMotion).toBe('false');
  prefs.setPreferences({ reducedMotion: true }); expect(prefs.reducedMotion()).toBe(true);
  stop(); const count = listener.mock.calls.length; media.dispatchEvent(new Event('change'));
  expect(listener).toHaveBeenCalledTimes(count);
});

it('keeps preferences usable when storage access is denied', async () => {
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
  const prefs = await import('../src/settings/preferences.js');
  expect(prefs.setPreferences({ quality: 'low', reducedMotion: false })).toBe(false);
  expect(prefs.getPreferences().quality).toBe('low'); expect(prefs.reducedMotion()).toBe(false);
});
