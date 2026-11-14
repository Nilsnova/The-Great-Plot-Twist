import {expect, it} from 'vitest';
import {createIslandApi} from '../../src/island/api.js';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();
const data = {weekStart: '2026-11-09T00:00:00Z', weekEnd: '2026-11-16T00:00:00Z',
  entries: [{rank: 1, name: 'Ana', wave: 30}, {rank: 1, name: 'Bo', wave: 30}, {rank: 3, name: 'Cal', wave: 20}]};

it('rejects unreadable rankings and handles a connection failure', async () => {
  const api = value => createIslandApi({transport: {get: async () => ({ok: true, data: value}), post() {}}});
  for (const bad of [null, {...data, entries: [null]}, {...data, entries: [{rank: 1, name: 'Ana', wave: -1}]}, {...data, weekEnd: 'wrong'},
    {...data, entries: Array(11).fill(data.entries[0])}]) expect((await api(bad).leaderboard()).code).toBe('unreadable');
  expect((await api(data).leaderboard()).data).toEqual(data);
  const broken = createIslandApi({transport: {get: async () => { throw Error(); }, post() {}}});
  expect((await broken.leaderboard()).message).toContain('Check your internet');
});

it('opens from the menu, loads, retries, shows ties and empty results; closing prevents a late reopen', async () => {
  const result = await evaluate(async data => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport(); let resolve, menu;
    const transport = {...base, get: path => path === '/api/island/leaderboard' ? new Promise(done => { resolve = done; }) : base.get(path)};
    const island = createIsland({on, emit, container: document.body, mode: 'fake', transport, storage: null,
      menu: provider => { menu = provider; return () => {}; }});
    await island.load();
    menu().find(item => item.label === 'Weekly leaderboard').onSelect();
    const text = () => document.querySelector('.island-card-leaderboard[open]')?.textContent ?? '';
    const loading = text().includes('Loading…');
    resolve({ok: false, status: 503, message: 'Unavailable. Try again later.'});
    await new Promise(done => setTimeout(done, 0));
    const failed = text().includes('Unavailable. Try again later.');
    [...document.querySelectorAll('button')].find(b => b.textContent === 'Try again').click();
    resolve({ok: true, data}); await new Promise(done => setTimeout(done, 0));
    const rows = [...document.querySelectorAll('.island-leaderboard li')].map(n => ({
      rank: n.querySelector('.island-leaderboard-rank').getAttribute('aria-label'),
      medal: n.querySelector('.island-leaderboard-rank').textContent,
      name: n.querySelector('.island-leaderboard-name').textContent, wave: n.querySelector('.island-leaderboard-wave').textContent}));
    [...document.querySelectorAll('button')].find(b => b.textContent === 'Refresh').click();
    resolve({ok: true, data: {...data, entries: []}}); await new Promise(done => setTimeout(done, 0));
    const empty = text().includes('No waves won');
    const pending = island.openLeaderboard(); island.ui.close(); resolve({ok: true, data}); await pending;
    const stayedClosed = !document.querySelector('.island-card-leaderboard[open]');
    island.ui.leaderboardCard({data: {...data, entries: [{rank: 2, name: 'Bo', wave: 29}]}}, () => {});
    const silver = !!document.querySelector('.is-rank-2 .island-leaderboard-rank');
    island.dispose(); return {loading, failed, rows, empty, stayedClosed, silver};
  }, data);
  expect(result).toEqual({loading: true, failed: true, empty: true, stayedClosed: true, silver: true,
    rows: [{rank: 'Rank 1', medal: '1', name: 'Ana', wave: '30'},
      {rank: 'Rank 1', medal: '1', name: 'Bo', wave: '30'}, {rank: 'Rank 3', medal: '3', name: 'Cal', wave: '20'}]});
});
