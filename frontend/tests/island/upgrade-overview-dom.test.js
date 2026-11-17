import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('opens from the actual menu provider, filters without purchases and refreshes accepted data', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const transport = createFakeIslandTransport(), writes = [];
    const post = transport.post.bind(transport); transport.post = (...args) => { writes.push(args[0]); return post(...args); };
    let menu;
    const island = createIsland({container: document.body, mode: 'fake', transport, on, emit, storage: null,
      menu: provider => { menu = provider; return () => {}; }});
    await island.load(); transport.dev.setWaveBest(30); transport.dev.setCoins(5000); await island.load();
    await island.api.build({spot: 'cannon_1', kind: 'cannon'});
    await island.api.build({spot: 'wall_1', kind: 'wall'}); await island.load();
    writes.length = 0;
    const entry = menu().find(item => item.label === 'Base overview'); entry.onSelect();
    const card = () => document.querySelector('.island-card[open]');
    const rows = () => [...card().querySelectorAll('[data-spot]')].map(item => item.dataset.spot);
    const before = rows(), title = card().querySelector('.kit-heading').textContent;
    const kind = card().querySelector('[data-focus="overview-kind"]');
    kind.value = 'wall'; kind.dispatchEvent(new Event('change'));
    const filtered = rows(), focus = document.activeElement.dataset.focus;
    island.setBattle(true);
    const during = {rows: rows(), note: card().textContent.includes('A wave is running'), selected: card().querySelector('[data-focus="overview-kind"]').value};
    island.setBattle(false); transport.dev.setCoins(0); await island.load();
    const updated = card().querySelector('[data-spot="wall_1"]').textContent;
    const actions = [...card().querySelectorAll('button')].map(button => button.textContent);
    const state = {coins: island.island.coins, wallLevel: island.island.spots.find(spot => spot.id === 'wall_1').level};
    island.dispose();
    return {title, before, filtered, focus, during, updated, actions, writes, state, remainingDialogs: document.querySelectorAll('dialog[open]').length};
  });
  expect(result.title).toBe('Base overview');
  expect(result.before).toEqual(['cannon_1', 'wall_1']);
  expect(result.filtered).toEqual(['wall_1']);
  expect(result.focus).toBe('overview-kind');
  expect(result.during).toEqual({rows: ['wall_1'], note: true, selected: 'wall'});
  expect(result.updated).toContain('Not enough 🪙');
  expect(result.writes).toEqual([]);
  expect(result.state).toEqual({coins: 0, wallLevel: 1});
  expect(result.actions.some(text => /buy|upgrade|build/i.test(text))).toBe(false);
  expect(result.remainingDialogs).toBe(0);
});

it('fits on a phone and keeps the filter usable when no buildings match', async () => {
  const result = await evaluate.withPage(async page => {
    await page.setViewportSize({width: 375, height: 812});
    return page.evaluate(async () => {
      const {createIslandUi} = await window.g20Import('/src/island/ui.js');
      const {upgradeOverviewModel} = await window.g20Import('/src/island/upgrade-overview.js');
      const ui = createIslandUi({container: document.body});
      ui.overviewCard(upgradeOverviewModel({island: {coins: 0, waveBest: 30, spots: [{id: 'cannon_11', kind: 'culverin', built: true, level: 1}]}}));
      const card = document.querySelector('dialog[open]'), filter = card.querySelector('[data-focus="overview-state"]');
      filter.focus(); filter.value = 'ready'; filter.dispatchEvent(new Event('change'));
      const active = document.querySelector('dialog[open]');
      const result = {overflow: document.documentElement.scrollWidth > innerWidth, empty: active.textContent.includes('No buildings match'),
        focus: document.activeElement.dataset.focus, filterHeight: active.querySelector('select').getBoundingClientRect().height};
      ui.dispose(); return result;
    });
  });
  expect(result).toEqual({overflow: false, empty: true, focus: 'overview-state', filterHeight: 44});
});
