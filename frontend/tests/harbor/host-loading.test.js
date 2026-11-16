// Module factories are controlled here; existing cards.test.js exercises the real browser cards.
import {expect, it, vi} from 'vitest';
import {createHarbor} from '../../src/harbor/host.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function setup() {
  const reply = deferred(), load = vi.fn(() => reply.promise), notify = vi.fn(), stop = vi.fn();
  const overview = {open: vi.fn(), close: vi.fn(), dispose: vi.fn()};
  const weather = {open: vi.fn(), close: vi.fn(), dispose: vi.fn()};
  const module = {createOverviewCard: vi.fn(() => overview), createWeatherCard: vi.fn(() => weather)};
  const harbor = createHarbor({load, notify, menu: () => stop});
  return {reply, load, notify, stop, overview, weather, module, harbor};
}

it('closing during a load prevents a late open, but a later explicit open reuses the cards', async () => {
  const f = setup(), first = f.harbor.openOverview();
  f.harbor.close();
  f.reply.resolve(f.module); await first;
  expect(f.overview.open).not.toHaveBeenCalled();
  await f.harbor.openOverview();
  expect(f.overview.open).toHaveBeenCalledOnce();
  expect(f.load).toHaveBeenCalledOnce();
  f.harbor.close();
  expect(f.overview.close).toHaveBeenCalledOnce();
  f.harbor.dispose();
});

it('repeated opens while loading create and open only one card', async () => {
  const f = setup();
  const opens = [f.harbor.openOverview(), f.harbor.openOverview(), f.harbor.openOverview()];
  f.reply.resolve(f.module); await Promise.all(opens);
  expect(f.load).toHaveBeenCalledOnce();
  expect(f.module.createOverviewCard).toHaveBeenCalledOnce();
  expect(f.overview.open).toHaveBeenCalledOnce();
  f.harbor.dispose();
});

it.each(['overview', 'weather'])('only the last requested view opens (%s)', async last => {
  const f = setup();
  const first = last === 'overview' ? f.harbor.openWeather() : f.harbor.openOverview();
  const second = last === 'overview' ? f.harbor.openOverview() : f.harbor.openWeather();
  f.reply.resolve(f.module); await Promise.all([first, second]);
  expect(f[last].open).toHaveBeenCalledOnce();
  expect(f[last === 'overview' ? 'weather' : 'overview'].open).not.toHaveBeenCalled();
  f.harbor.dispose();
});

it('a failed load reports one error and permits an explicit retry', async () => {
  const f = setup(), opens = [f.harbor.openOverview(), f.harbor.openOverview()];
  f.reply.reject(new Error('offline')); await Promise.all(opens);
  expect(f.notify).toHaveBeenCalledExactlyOnceWith('The harbor could not open. Try again.');
  f.load.mockResolvedValue(f.module);
  await f.harbor.openWeather();
  expect(f.load).toHaveBeenCalledTimes(2);
  expect(f.weather.open).toHaveBeenCalledOnce();
  f.harbor.dispose();
});

it('a failure after closing does not show an obsolete error', async () => {
  const f = setup(), opening = f.harbor.openOverview();
  f.harbor.close(); f.reply.reject(new Error('offline')); await opening;
  expect(f.notify).not.toHaveBeenCalled();
  f.harbor.dispose();
});

it.each(['success', 'failure'])('disposal before a load %s prevents cards and notifications', async outcome => {
  const f = setup(), opening = f.harbor.openOverview();
  f.harbor.dispose();
  if (outcome === 'success') f.reply.resolve(f.module);
  else f.reply.reject(new Error('offline'));
  await opening;
  expect(f.module.createOverviewCard).not.toHaveBeenCalled();
  expect(f.notify).not.toHaveBeenCalled();
  await f.harbor.openWeather();
  expect(f.load).toHaveBeenCalledOnce();
  expect(f.stop).toHaveBeenCalledOnce();
});
