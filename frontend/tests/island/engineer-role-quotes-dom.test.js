// Real island assembly with synthetic authoritative quotes; no provider or live account.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it.each([[false, false, false], [true, false, false], [false, true, false], [true, true, false], [false, false, true], [true, false, true]])(
  'refreshes role-dependent construction quotes (visiting=%s, respec=%s, readFails=%s)', async (visiting, respec, readFails) => {
  const result = await evaluate(async ({visiting, respec, readFails}) => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {sharedFixture, receipt, actorId} = await window.g20Import('/tests/island/shared-core-fixture.js');
    const {personalReply, personalCaptain} = await window.g20Import('/tests/island/economy-fixture.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport(), writes = [];
    let engineer = respec, changed = false, quoteReads = 0;
    const profile = () => personalReply({captain: personalCaptain({role: engineer ? 'engineer' : null, revision: changed ? '2' : '1'})});
    const snapshot = code => {
      const data = sharedFixture(); data.code = code; data.personalCaptain = profile();
      if (engineer) for (const row of data.quotes.build) row.intent.quotedCoins = '9';
      return data;
    };
    const transport = {get: async path => {
      if (path === '/api/captain') return {ok: true, data: profile()};
      if (path === '/api/island' || path.startsWith('/api/island/visit/')) {
        if (changed) { quoteReads++; if (readFails) return {ok: false, status: 503, message: 'Unavailable'}; }
        return {ok: true, data: snapshot(path === '/api/island' ? 'ISLE-K7Q2M' : 'ISLE-FR3ND')};
      }
      return base.get(path);
    }, post: async (path, body) => {
      if (path === '/api/captain/role' || path === '/api/captain/respec') {
        engineer = path === '/api/captain/role'; changed = true; return {ok: true, data: profile()};
      }
      if (path === '/api/island/build') {
        writes.push(body);
        return body.quotedCoins === (engineer ? '9' : '10') ? {ok: true, data: receipt(snapshot(body.code ?? 'ISLE-K7Q2M'), body, 'build')}
          : {ok: false, status: 409, code: 'stale_construction_quote', message: 'Refresh this quote.'};
      }
      return base.post(path, body);
    }};
    const built = [], stop = on('island_spots_changed', event => built.push(event));
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, getActorId: () => actorId,
      storage: null, visitStorage: null, menu: () => () => {}, settings: () => () => {}});
    if (visiting) island.visit('ISLE-FR3ND');
    await island.load();
    if (respec) { await island.respecCaptain(); await island.respecCaptain(); }
    else await island.takeRole('engineer');
    const readsBeforeBuy = quoteReads;
    island.pick('wall_1');
    const card = document.querySelector('.island-card[open]').textContent;
    const stale = (island.visiting ?? island.island).quotesStale === true;
    await island.build('wall_1', 'wall');
    const result = {writes, readsBeforeBuy, card, stale, built: built.length};
    island.dispose(); stop(); return result;
  }, {visiting, respec, readFails});
  expect(result.readsBeforeBuy).toBeGreaterThan(0);
  if (readFails) {
    expect(result.stale).toBe(true);
    expect(result.writes).toEqual([]);
    expect(result.built).toBe(0);
  } else {
    const price = respec ? '10' : '9';
    expect(result.writes).toHaveLength(1);
    expect(result.writes[0]).toMatchObject({spot: 'wall_1', kind: 'wall', quotedCoins: price});
    expect(result.card).toContain(price);
    expect(result.built).toBe(1);
  }
});
