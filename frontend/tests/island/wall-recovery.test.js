// The wall card's Repair and Rebuild (tasks T29-T32 and T47, decision D039, proposed): a damaged or
// destroyed wall never offers Upgrade, says its health and its timer, and the API helpers send and
// read the agreed shapes.
import { describe, expect, it } from 'vitest';
import { buildCardModel } from '../../src/island/card-model.js';
import { mendsText, withWallRecovery } from '../../src/island/wall-recovery.js';
import { createIslandApi, isWalls, wallHealthBody } from '../../src/island/api.js';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const wallSpot = {id: 'wall_1', kind: 'wall', built: true, level: 2, cost: 10, upgradeCost: 40};
const card = (wall, extra = {}) => withWallRecovery(buildCardModel({spotId: 'wall_1', slot: 'wall', spot: wallSpot, coins: 100}),
  {wall, coins: 100, now: NOW, ...extra});

describe('the wall card', () => {
  it('T29: without the flag (no wall answer) a built wall offers Upgrade, as before', () => {
    expect(card(null).mode).toBe('upgrade');
    expect(card({spot: 'wall_1', health: 100, recoversAt: null, repairCost: null}).mode).toBe('upgrade');
  });

  it('T29: a destroyed wall offers Rebuild at its level, never Upgrade', () => {
    const model = card({spot: 'wall_1', level: 2, health: 0, recoversAt: '2026-11-14T12:07:30Z', repairCost: 9});
    expect(model).toMatchObject({mode: 'repair', repair: 'rebuild', button: 'Rebuild · 🪙 9', disabled: false, level: 2,
      soon: 'Repair it before you upgrade it.'});
    expect(model.upgrade).toEqual({label: 'Destroyed', stats: 'Rebuild it at its level · Mends by itself in 8 min'});
  });

  it('a damaged wall offers Repair with its health', () => {
    const model = card({spot: 'wall_1', health: 40, recoversAt: null, repairCost: 6});
    expect(model).toMatchObject({mode: 'repair', repair: 'repair', button: 'Repair · 🪙 6', disabled: false});
    expect(model.upgrade.label).toBe('Damaged · health 40%');
  });

  it('waits for the break during a wave and says how to repair now', () => {
    const model = card({spot: 'wall_1', health: 40, recoversAt: null, repairCost: 6}, {battle: true});
    expect(model.disabled).toBe(true);
    expect(model.reason).toMatch(/between waves/);
  });

  it('says how many coins are missing', () => {
    const model = card({spot: 'wall_1', health: 0, recoversAt: null, repairCost: 9}, {coins: 4});
    expect(model).toMatchObject({disabled: true, reason: 'Not enough 🪙: you need 🪙 5 more.'});
  });

  it('shows the repair under way', () => {
    expect(card({spot: 'wall_1', health: 40, recoversAt: null, repairCost: 6}, {busy: 'repair'})).toMatchObject({button: 'Repairing…', disabled: true});
  });

  it('leaves other buildings alone', () => {
    const cannon = buildCardModel({spotId: 'cannon_1', slot: 'tower', spot: {id: 'cannon_1', kind: 'cannon', built: true, level: 1, cost: 30, upgradeCost: 60}, coins: 100});
    expect(withWallRecovery(cannon, {wall: {health: 0, repairCost: 1}})).toBe(cannon);
  });

  it('rounds the timer up to whole minutes, at least one', () => {
    expect(mendsText('2026-11-14T12:00:10Z', NOW)).toBe('Mends by itself in 1 min');
    expect(mendsText(null, NOW)).toBe('');
  });
});

describe('the wall API', () => {
  it('keeps only wall spots with whole percents in a finish', () => {
    expect(wallHealthBody({wall_1: 40, wall_2: 0, cannon_1: 5, wall_3: 101, wall_4: 2.5})).toEqual({wall_1: 40, wall_2: 0});
    expect(wallHealthBody({})).toBeNull();
    expect(wallHealthBody(undefined)).toBeNull();
  });

  it('reads the walls answer', () => {
    expect(isWalls({coins: 5, walls: [{spot: 'wall_1', level: 1, health: 0, recoversAt: null, repairCost: 3}]})).toBe(true);
    expect(isWalls({coins: 5, walls: [{spot: 'wall_1', level: 1, health: 120, recoversAt: null, repairCost: 3}]})).toBe(false);
  });

  it('sends a repair with a click id and the friend code, and a finish with its walls', async () => {
    const sent = [];
    const transport = {
      get: async path => { sent.push(['get', path]); return {ok: true, status: 200, data: {coins: 1, walls: []}}; },
      post: async (path, body) => { sent.push(['post', path, body]); return {ok: true, status: 200, data: path.endsWith('finish') ? {loot: 1, coins: 1, waveBest: 1, flags: 1} : {coins: 1, walls: []}}; },
    };
    const api = createIslandApi({transport});
    await api.walls({code: 'K7Q2M'});
    await api.repairWall({spot: 'wall_1', code: 'K7Q2M'});
    await api.finishWave({waveId: 'w1', survived: true, shipsSunk: 2, walls: {wall_1: 40}});
    expect(sent[0]).toEqual(['get', '/api/island/walls?code=ISLE-K7Q2M']);
    expect(sent[1][1]).toBe('/api/island/repair');
    expect(sent[1][2]).toMatchObject({spot: 'wall_1', code: 'ISLE-K7Q2M'});
    expect(sent[1][2].actionUid).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(sent[2][2]).toEqual({waveId: 'w1', survived: true, shipsSunk: 2, walls: {wall_1: 40}});
  });
});
