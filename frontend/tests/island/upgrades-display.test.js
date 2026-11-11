// Upgrades that went unseen (11 Nov, "sometimes some upgrades were not visible"): an older answer of the
// island must not undo a newer one, and the Pirate Point card holds you to your own unlocks like the server.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('an island read that started before an upgrade never takes the level back', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const fake = createFakeIslandTransport();
    // GET /api/island answers with the island as it was when asked, but only when let go.
    let gate = null;
    const transport = {dev: fake.dev, post: (path, body) => fake.post(path, body),
      get: async path => { const answer = await fake.get(path); if (gate && path === '/api/island') await gate.promise; return answer; }};
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null, menu: () => () => {}});
    await island.load();
    fake.dev.setWaveBest(3); fake.dev.setCoins(500); await island.load();
    await island.build('cannon_1', 'cannon');
    const level = () => island.island.spots.find(spot => spot.id === 'cannon_1').level;
    const before = level();
    let release; gate = {promise: new Promise(resolve => { release = resolve; })};
    const stale = island.refreshDefended(); // a friend's island_changed: the read is on its way
    await new Promise(resolve => setTimeout(resolve, 20));
    const upgrading = island.upgrade('cannon_1'); // our own upgrade goes through meanwhile
    await new Promise(resolve => setTimeout(resolve, 20));
    gate = null; release();
    await Promise.all([stale, upgrading]);
    await new Promise(resolve => setTimeout(resolve, 30));
    return {before, after: level(), coins: island.island.coins};
  });
  expect(result.before).toBe(1);
  expect(result.after).toBe(2);
});

it('the Pirate Point card offers the next level only when you have won the wave for it', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const transport = createFakeIslandTransport();
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null, menu: () => () => {}});
    await island.load(); await island.loadPoint();
    transport.dev.setCoins(500); await island.load();
    await island.build('pp_tower_1', 'cannon');
    const card = () => ({upgrade: !!document.querySelector('.island-card[open] [data-focus="upgrade"]'),
      soon: document.querySelector('.island-card[open] .island-soon:not([hidden])')?.textContent ?? ''});
    island.pick('pp_tower_1'); const locked = card(); island.ui.close();
    transport.dev.setWaveBest(2); await island.load();
    island.pick('pp_tower_1'); const open = card(); island.ui.close();
    return {locked, open};
  });
  expect(result.locked.upgrade).toBe(false);
  expect(result.locked.soon).toMatch(/Level 2 · after wave 2/);
  expect(result.open.upgrade).toBe(true);
});
