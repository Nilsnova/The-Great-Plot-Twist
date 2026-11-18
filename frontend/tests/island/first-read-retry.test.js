// Two players loading at once (a cold serverless start): the first GET /api/island may fail. The island
// must not stay empty for good: the next reread (the wave wiring's 15 s timer, the bell, a build card)
// reads it again. A signed-out player (401) is not asked again and again.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it('reads your island again after a failed first read, but not after a 401', async () => {
  const result = await browser.withPage(page => page.evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const make = failure => {
      const base = createFakeIslandTransport();
      let fail = 1, reads = 0;
      const transport = {...base, get: async path => {
        if (path === '/api/island') { reads++; if (fail-- > 0) return failure; }
        return base.get(path);
      }};
      const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null, menu: () => () => {}});
      return {island, reads: () => reads};
    };
    const cold = make({ok: false, status: 503, code: 'database_unavailable', message: 'The server is busy. Try again.'});
    await cold.island.load();
    const before = cold.island.island;
    await cold.island.refreshDefended();
    const after = cold.island.island;
    const coldReads = cold.reads();
    cold.island.dispose();
    const out = make({ok: false, status: 401, code: 'unauthorized', message: 'Sign in first.'});
    await out.island.load();
    await out.island.refreshDefended(); await out.island.refreshDefended();
    const outReads = out.reads();
    out.island.dispose();
    return {before, after: !!after?.code, coldReads, outReads};
  }));
  expect(result.before).toBe(null);
  expect(result.after).toBe(true);
  expect(result.coldReads).toBe(2);
  expect(result.outReads).toBe(1);
});
