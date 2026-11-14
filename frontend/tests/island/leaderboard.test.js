// T7 and T45: the ranking request, its checks, and the Leaderboard card (week/all-time tabs, crew, this island).
import {expect, it} from 'vitest';
import {createIslandApi} from '../../src/island/api.js';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();
const data = {scope: 'week', weekStart: '2026-11-09T00:00:00Z', weekEnd: '2026-11-16T00:00:00Z',
  entries: [{rank: 1, name: 'Ana', wave: 30, crew: 3}, {rank: 1, name: 'Bo', wave: 30, crew: 1}, {rank: 3, name: 'Cal', wave: 20, crew: 2}]};
const ever = {scope: 'all', weekStart: null, weekEnd: null, entries: [{rank: 1, name: 'Dee', wave: 64, crew: 1}]};

it('rejects unreadable rankings and handles a connection failure', async () => {
  const asked = [];
  const api = value => createIslandApi({transport: {get: async path => { asked.push(path); return {ok: true, data: value}; }, post() {}}});
  for (const bad of [null, {...data, entries: [null]}, {...data, entries: [{rank: 1, name: 'Ana', wave: -1}]}, {...data, weekEnd: 'wrong'},
    {...data, entries: Array(11).fill(data.entries[0])}, {...data, entries: [{rank: 1, name: 'Ana', wave: 3, crew: 0}]},
    {...data, entries: [{rank: 1, name: 'Ana', wave: 3, crew: 11}]}, {...data, scope: 'all'}, ever]) expect((await api(bad).leaderboard()).code).toBe('unreadable');
  expect((await api(data).leaderboard()).data).toEqual(data);
  expect((await api(ever).leaderboard('all')).data).toEqual(ever);
  for (const bad of [data, {...ever, weekStart: data.weekStart}, {...ever, scope: 'week'}]) expect((await api(bad).leaderboard('all')).code).toBe('unreadable');
  // A T7 answer without scope or crew still reads as this week's board.
  const {scope, ...older} = data; void scope;
  expect((await api({...older, entries: [{rank: 1, name: 'Ana', wave: 30}]}).leaderboard()).ok).toBe(true);
  expect(asked.at(-1)).toBe('/api/island/leaderboard');
  await api(ever).leaderboard('all');
  expect(asked.at(-1)).toBe('/api/island/leaderboard?scope=all');
  const broken = createIslandApi({transport: {get: async () => { throw Error(); }, post() {}}});
  expect((await broken.leaderboard()).message).toContain('Check your internet');
});

it('opens from the menu, loads, retries, shows ties and empty results; closing prevents a late reopen', async () => {
  const result = await evaluate(async data => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport(); let resolve, menu;
    const transport = {...base, get: path => path.startsWith('/api/island/leaderboard') ? new Promise(done => { resolve = done; }) : base.get(path)};
    const island = createIsland({on, emit, container: document.body, mode: 'fake', transport, storage: null,
      menu: provider => { menu = provider; return () => {}; }});
    await island.load();
    menu().find(item => item.label === 'Leaderboard').onSelect();
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

it('switches between this week and all time, shows crews and this island’s milestones', async () => {
  const result = await evaluate(async ({data, ever}) => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport(); const asked = [];
    const transport = {...base, get: path => {
      if (!path.startsWith('/api/island/leaderboard')) return base.get(path);
      asked.push(path); return Promise.resolve({ok: true, data: path.endsWith('scope=all') ? ever : data});
    }};
    const island = createIsland({on, emit, container: document.body, mode: 'fake', transport, storage: null, menu: () => () => {}});
    await island.load(); island.dev.setWaveBest(27); await island.load();
    const settle = () => new Promise(done => setTimeout(done, 0));
    await island.openLeaderboard();
    const card = () => document.querySelector('.island-card-leaderboard[open]');
    const tabs = () => [...card().querySelectorAll('.island-leaderboard-tabs button')].map(b => `${b.textContent}:${b.getAttribute('aria-pressed')}`);
    const crews = () => [...card().querySelectorAll('.island-leaderboard-crew')].map(n => n.textContent);
    const week = {tabs: tabs(), crews: crews(), period: card().textContent.includes('Resets each Monday'),
      progress: card().querySelector('.island-progress')?.textContent};
    [...card().querySelectorAll('button')].find(b => b.textContent === 'All time').click(); await settle(); await settle();
    const all = {tabs: tabs(), crews: crews(), period: card().textContent.includes('Never resets'),
      names: [...card().querySelectorAll('.island-leaderboard-name')].map(n => n.textContent)};
    [...card().querySelectorAll('button')].find(b => b.textContent === 'Refresh').click(); await settle(); await settle();
    const refreshedAll = tabs()[1];
    island.ui.close(); await island.openLeaderboard();
    const remembered = tabs()[1];
    island.dispose(); return {week, all, refreshedAll, remembered, asked};
  }, {data, ever});
  expect(result.week).toEqual({tabs: ['This week:true', 'All time:false'], crews: ['Crew of 3', 'Solo', 'Crew of 2'], period: true,
    progress: 'This islandBest wave 27Silver shield · Bronze statueNext: Gold shield at wave 30 · Silver statue at wave 50'});
  expect(result.all).toEqual({tabs: ['This week:false', 'All time:true'], crews: ['Solo'], period: true, names: ['Dee']});
  expect(result.refreshedAll).toBe('All time:true');
  expect(result.remembered).toBe('All time:true');
  expect(result.asked).toEqual(['/api/island/leaderboard', '/api/island/leaderboard?scope=all',
    '/api/island/leaderboard?scope=all', '/api/island/leaderboard?scope=all']);
});
