// Late lazy imports cannot resurrect a panel after its game has ended.
import { expect, it, vi } from 'vitest';
import { createSportsEntry } from '../../src/screens/sports/index.js';
it('shares one import/panel for quick repeated opens', async () => {
  const panel = { open: vi.fn(), dispose: vi.fn(), active: true };
  const load = vi.fn(async () => [{ createSportsHttp: vi.fn() }, { createSportsPanel: vi.fn(() => panel) }]);
  const entry = createSportsEntry({}, { load });
  await Promise.all([entry.open(), entry.open()]);
  expect(load).toHaveBeenCalledOnce(); expect(entry.active).toBe(true);
  entry.dispose(); entry.dispose(); expect(panel.dispose).toHaveBeenCalledOnce();
});
it('does not create a late dialog when disposed during its import', async () => {
  let finish; const createSportsPanel = vi.fn();
  const load = () => new Promise(resolve => { finish = resolve; });
  const entry = createSportsEntry({}, { load }), pending = entry.open(); entry.dispose();
  finish([{ createSportsHttp: vi.fn() }, { createSportsPanel }]); await pending;
  expect(createSportsPanel).not.toHaveBeenCalled(); await entry.open();
  expect(entry.active).toBe(false);
});
it('blocks the game while loading, and Escape/close cancels a late open', async () => {
  let finish; const panel = { open: vi.fn(), close: vi.fn(), active: false };
  const load = () => new Promise(resolve => { finish = resolve; });
  const entry = createSportsEntry({}, { load }), pending = entry.open();
  expect(entry.active).toBe(true); entry.close(); expect(entry.active).toBe(false);
  finish([{ createSportsHttp: vi.fn() }, { createSportsPanel: () => panel }]); await pending;
  expect(panel.open).not.toHaveBeenCalled(); await entry.open(); expect(panel.open).toHaveBeenCalledOnce();
});
