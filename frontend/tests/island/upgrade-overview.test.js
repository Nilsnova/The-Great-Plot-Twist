import {describe, expect, it} from 'vitest';
import {upgradeOverviewModel, overviewRows} from '../../src/island/upgrade-overview.js';

const building = (id, kind, level = 1, extra = {}) => ({id, kind, level, built: true, ...extra});
const island = (spots, extra = {}) => ({coins: 500, waveBest: 30, spots, ...extra});

describe('base overview planning model', () => {
  it('includes offered extra spots exactly once and does not invent empty or unknown buildings', () => {
    const model = upgradeOverviewModel({island: island([
      building('cannon_8', 'mortar', 2), building('wall_2', 'wall'), building('cannon_8', 'mortar', 2),
      {id: 'house_1', kind: 'house', built: false}, {id: 'not-built', kind: 'wall', built: 'yes'},
      building('invalid', 'unknown'), building('wall_1', 'wall')])});
    expect(model.rows.map(row => row.id)).toEqual(['cannon_8', 'wall_1', 'wall_2']);
    expect(model.lead).toBe('3 built buildings · 🪙 500');
    expect(overviewRows(model, 'wall').map(row => row.id)).toEqual(['wall_1', 'wall_2']);
  });

  it('reuses the server upgrade price and distinguishes missing coins from affordable plans', () => {
    const spot = building('cannon_1', 'cannon', 1, {upgradeCost: 53});
    const ready = upgradeOverviewModel({island: island([spot], {coins: 53})});
    expect(ready.rows[0]).toMatchObject({next: 'Level 2 · 🪙 53', state: 'ready', reason: ''});
    const short = upgradeOverviewModel({island: island([spot], {coins: 52})});
    expect(short.rows[0]).toMatchObject({state: 'blocked', reason: 'Not enough 🪙: you need 🪙 1 more.'});
    const loading = upgradeOverviewModel({island: island([spot], {coins: null})});
    expect(loading.rows[0]).toMatchObject({state: 'blocked', reason: 'Your coins are still loading.'});
    expect(overviewRows(loading, 'all', 'ready')).toEqual([]);
  });

  it('keeps wave locks, top building levels, role and path progress without repeating house loot values', () => {
    const locked = upgradeOverviewModel({island: island([building('cannon_1', 'cannon')], {waveBest: 0})});
    expect(locked.rows[0]).toMatchObject({state: 'blocked', next: 'Level 2: Opens after wave 2.'});
    const full = upgradeOverviewModel({island: island([building('house_1', 'house', 3, {spec: 'tavern'}),
      building('cannon_8', 'cannon', 5, {tree: {a: 2, b: 1}})])});
    expect(full.rows.find(row => row.id === 'house_1')).toMatchObject({state: 'top', next: 'Highest building level', skill: 'Role: Tavern'});
    expect(full.rows.find(row => row.id === 'cannon_8')).toMatchObject({state: 'top', paths: 'Tower paths: 3/4 steps bought'});
    expect(JSON.stringify(full)).not.toContain('Loot');
  });

  it('keeps a running wave as a planning state without changing the accepted source snapshot', () => {
    const source = island([building('wall_1', 'wall')]);
    const before = structuredClone(source);
    expect(upgradeOverviewModel({island: source, battle: true}).note).toBe('A wave is running. Plan building levels here.');
    expect(source).toEqual(before);
    expect(upgradeOverviewModel().lead).toBe('Your island is still loading.');
    expect(upgradeOverviewModel({island: island([])}).empty).toContain('Build your first defense');
  });
});
