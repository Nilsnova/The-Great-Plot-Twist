// Real island cards reject late run/selection replies; synthetic transport responses never use a live backend.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it.each(['own', 'visit'])('adopts another member reset from the current %s GET and ignores an older GET and hire reply', async place => {
  const result = await evaluate(async place => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {sharedEconomy} = await window.g20Import('/tests/island/economy-fixture.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport(); base.dev.setCoins(9000); base.dev.setWaveBest(9);
    let economy = sharedEconomy(), holdRead = false, releaseRead, releaseHire;
    const readPath = place === 'visit' ? '/api/island/visit/ISLE-FR3ND' : '/api/island';
    const old = {...(await base.get(readPath)).data, economy, waveBest: 9};
    const transport = {get: async path => {
      if (path !== readPath) return base.get(path);
      const answer = {...await base.get(path), data: {...old, economy}};
      if (holdRead) { holdRead = false; return new Promise(resolve => { releaseRead = () => resolve(answer); }); }
      return answer;
    }, post: (path, body) => path === '/api/island/hire'
      ? new Promise(resolve => { releaseHire = () => resolve({ok: true, data: old}); }) : base.post(path, body)};
    const money = [];
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      menu: () => () => {}, settings: () => () => {}, onCoins: value => money.push(value)});
    if (place === 'visit') island.visit('ISLE-FR3ND');
    await island.load();
    const hire = island.hire('gunner');
    holdRead = true; const oldRead = island.refreshDefended();
    await new Promise(resolve => setTimeout(resolve, 0));
    economy = sharedEconomy({accountId: '44444444-4444-4444-8444-444444444444', runEpoch: '55555555-5555-4555-8555-555555555555',
      treasury: {balanceCoins: '60', committedCoins: '0', availableCoins: '60'}});
    await island.refreshDefended();
    releaseRead(); await oldRead; releaseHire(); await hire;
    island.openCrew();
    const answer = {economy: (island.visiting ?? island.island).economy, money: money.at(-1), card: document.querySelector('.island-card[open]').textContent};
    island.dispose(); return answer;
  }, place);
  expect(result.economy.runEpoch).toBe('55555555-5555-4555-8555-555555555555');
  expect(result.money).toBe('60');
  expect(result.card).toContain('🪙 60 available');
  expect(result.card).not.toContain('unavailable');
});

it.each(['hire', 'research'])('ignores a shared visited-island %s reply after sailing to a legacy home', async operation => {
  const result = await evaluate(async operation => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {sharedEconomy} = await window.g20Import('/tests/island/economy-fixture.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport(); base.dev.setCoins(9000); base.dev.setWaveBest(9);
    const home = (await base.get('/api/island')).data;
    let visited, release;
    const transport = {get: async path => {
      const answer = await base.get(path);
      if (answer.ok && path.startsWith('/api/island/visit/')) {
        visited = {...answer.data, prices: home.prices, economy: sharedEconomy()};
        return {...answer, data: visited};
      }
      return answer;
    }, post: (path, body) => path === `/api/island/${operation}`
      ? new Promise(resolve => { release = () => resolve({ok: true, data: visited}); }) : base.post(path, body)};
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null, visitStorage: null,
      menu: () => () => {}, settings: () => () => {}});
    island.visit('ISLE-FR3ND'); await island.load();
    const pending = operation === 'hire' ? island.hire('gunner') : island.research('cannon');
    await island.sailHome(); release(); await pending;
    island.openCrew();
    const answer = {expectedCode: home.code, home: island.island, visiting: island.visiting,
      card: document.querySelector('.island-card[open]').textContent};
    island.dispose(); return answer;
  }, operation);
  expect(result.home.code).toBe(result.expectedCode);
  expect(result.home.coins).toBe(9000);
  expect(result.home).not.toHaveProperty('economy');
  expect(result.visiting).toBe(null);
  expect(result.card).not.toContain('Island treasury');
});

it('reconciles a late legacy own-build through a fresh read without restoring its old money after adoption', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {sharedEconomy} = await window.g20Import('/tests/island/economy-fixture.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport(); base.dev.setCoins(100); base.dev.setWaveBest(9);
    let economy = null, release;
    const transport = {get: async (path, options) => {
      const answer = await base.get(path, options);
      return answer.ok && path === '/api/island' && economy
        ? {...answer, data: {...answer.data, economy}} : answer;
    }, post: (path, body) => {
      const answer = base.post(path, body);
      return path === '/api/island/build'
        ? new Promise(resolve => { release = async () => { const old = await answer; resolve({...old, data: {...old.data, coins: 1}}); }; })
        : answer;
    }};
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null, visitStorage: null,
      menu: () => () => {}, settings: () => () => {}});
    await island.load();
    const building = island.build('wall_1', 'wall');
    island.visit('ISLE-FR3ND'); await island.load();
    economy = sharedEconomy({accountId: '44444444-4444-4444-8444-444444444444', runEpoch: '55555555-5555-4555-8555-555555555555',
      treasury: {balanceCoins: '60', committedCoins: '0', availableCoins: '60'}});
    await release(); await building;
    const answer = {home: island.island, visiting: island.visiting?.code};
    island.dispose(); return answer;
  });
  expect(result.home.economy?.runEpoch).toBe('55555555-5555-4555-8555-555555555555');
  expect(result.home.economy?.treasury.availableCoins).toBe('60');
  expect(result.home.coins).toBe(90);
  expect(result.visiting).toBe('FR3ND');
});
