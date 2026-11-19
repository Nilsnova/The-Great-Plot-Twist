// D060 (more tower spots over time): the browser's table of the extra tower spots equals the server's files, an
// extra spot shows only while an island answer lists it (the server's flag more_tower_spots), it opens after its won
// wave, it is a legal place on the build grid, and the fake server follows the flag.
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {EXTRA_SPOT_TABLE, extraOpenedBetween, extraSpotWave, offeredExtra} from '../../src/island/extra-spots.js';
import {ALL_SPOTS, SPOTS, defenses, islandZones, offeredSpots, spotById} from '../../src/island/spots.js';
import {checkMove, onWallPerimeter, positionsOf, routeOpen} from '../../src/island/placement.js';
import {spotWave} from '../../src/campaign/index.js';
import {buildCardModel} from '../../src/island/card-model.js';
import {cardById, cardsBetween} from '../../src/tutorial/unlock-cards.js';
import {createFakeIslandApi, createFakeWorld} from '../../src/pirates/fake-api.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const islands = read('../../../backend/content/islands.json'), layout = read('../../../backend/content/island_layout.json');
const IDS = ['cannon_8', 'cannon_9', 'cannon_10', 'cannon_11'];
const answerWith = ids => [...SPOTS, ...ids.map(id => spotById(id))].map(spot => ({id: spot.id, kind: spot.kind, built: false}));
async function refusal(promise) {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected a refusal');
}

describe('the extra tower spots are the server\'s', () => {
  it('has the ids and waves of islands.json and the places of island_layout.json', () => {
    expect(EXTRA_SPOT_TABLE.map(([id, , , wave]) => ({id, unlockWave: wave}))).toEqual(islands.extraTowerSpots.spots);
    expect(EXTRA_SPOT_TABLE.map(([id, x, z]) => [id, 'tower', x, z])).toEqual(layout.extraSpots.rows);
  });
  it('opens them after waves 10, 20, 30 and 40', () => {
    expect(IDS.map(spotWave)).toEqual([10, 20, 30, 40]);
    expect(IDS.map(extraSpotWave)).toEqual([10, 20, 30, 40]);
    expect(spotWave('cannon_1')).toBe(0);
    expect(spotWave('wall_7')).toBe(5);
  });
});

describe('an extra spot shows only while the answer lists it', () => {
  it('flag off (22 spots): no extra spot, no zone, no position', () => {
    const plain = answerWith([]);
    expect(offeredExtra(plain)).toEqual([]);
    expect(offeredSpots(plain)).toHaveLength(22);
    expect(islandZones({spots: plain}).filter(zone => IDS.includes(zone.id))).toEqual([]);
    expect(Object.keys(positionsOf(plain))).toHaveLength(22);
  });
  it('flag on: the four extra tower spots with their zones and places', () => {
    const more = answerWith(IDS);
    expect(offeredExtra(more)).toEqual(IDS);
    expect(offeredSpots(more).map(spot => spot.id).slice(22)).toEqual(IDS);
    expect(islandZones({spots: more}).filter(zone => IDS.includes(zone.id)).map(zone => zone.name)).toEqual(Array(4).fill('Tower spot'));
    expect(ALL_SPOTS.filter(spot => IDS.includes(spot.id)).every(spot => spot.slot === 'tower')).toBe(true);
    // A tower built there fights in the wave like any other.
    const built = more.map(item => (item.id === 'cannon_9' ? {...item, kind: 'swivel', built: true, level: 2} : item));
    expect(defenses(built)).toEqual([{id: 'cannon_9', kind: 'swivel', level: 2, x: 11.5, z: -8.5}]);
  });
  it('tells which extra spots a win opened', () => {
    expect(extraOpenedBetween(9, 10, answerWith(IDS))).toEqual(['cannon_8']);
    expect(extraOpenedBetween(9, 40, answerWith(IDS))).toEqual(IDS);
    expect(extraOpenedBetween(9, 40, answerWith([]))).toEqual([]);
  });
});

describe('placement', () => {
  it('every extra tower is clear of the wall perimeter and keeps a route open', () => {
    const positions = positionsOf(answerWith(IDS));
    expect(routeOpen(positions)).toBe(true);
    for (const id of IDS) {
      const {x, z} = positions[id];
      expect(checkMove(id, x, z, positions), id).toEqual({ok: true});
      for (let dx = -1; dx <= 1; dx += .5) for (let dz = -1; dz <= 1; dz += .5) expect(onWallPerimeter(x + dx, z + dz), `${id} perimeter`).toBe(false);
    }
    // The new towers do not move any existing spot.
    const plain = positionsOf(answerWith([]));
    for (const [id, where] of Object.entries(plain)) expect(positions[id]).toEqual(where);
  });
});

describe('the locked card and the unlock card', () => {
  it('a locked extra spot says when it opens', () => {
    const answer = answerWith(IDS);
    const model = buildCardModel({spotId: 'cannon_10', slot: 'tower', spot: answer.find(item => item.id === 'cannon_10'), coins: 500,
      campaign: {wave: 12, open: new Set(), locked: new Map(), later: new Set()}});
    expect(model.locked).toBe(true);
    expect(model.soon).toBe('Opens after wave 30.');
    expect(model.purpose).toMatch(/new tower spot/i);
  });
  it('"New tower spot!" comes once per wave step, and only while the flag is on', () => {
    expect(cardById('tower_spot_8')).toMatchObject({wave: 10, flag: 'more_tower_spots', title: 'New tower spot!', where: 'cannon_8'});
    expect(cardsBetween(9, 10, {more_tower_spots: true}).map(card => card.id)).toContain('tower_spot_8');
    expect(cardsBetween(9, 10, {}).map(card => card.id)).not.toContain('tower_spot_8');
    expect(cardsBetween(29, 40, {more_tower_spots: true}).map(card => card.id).filter(id => id.startsWith('tower_spot'))).toEqual(['tower_spot_10', 'tower_spot_11']);
  });
});

describe('the fake server follows the flag', () => {
  it('off: the 22 spots, and an extra spot does not exist', async () => {
    const api = createFakeIslandApi({version: 2});
    expect((await api.island()).spots).toHaveLength(22);
    const error = await refusal(api.build({spot: 'cannon_8', kind: 'cannon', actionUid: 'more-0001'}));
    expect([error.status, error.code]).toEqual([404, 'no_such_spot']);
  });
  it('on: four more tower spots, locked until their wave, then any tower kind', async () => {
    const world = createFakeWorld(), api = createFakeIslandApi({world, version: 2, flags: {more_tower_spots: true, defenses_v2: true}});
    const answer = await api.island();
    expect(answer.spots.map(spot => spot.id).slice(22)).toEqual(IDS);
    expect(answer.spots[22].kinds).toEqual(['cannon', 'mortar', 'harpoon', 'swivel', 'culverin']);
    const me = world.players.get('me'), island = world.islands.get(me.code);
    me.coins = 1000; island.waveBest = 9;
    const locked = await refusal(api.build({spot: 'cannon_8', kind: 'cannon', actionUid: 'more-0002'}));
    expect([locked.status, locked.code, locked.message]).toEqual([409, 'locked', 'Opens after wave 10.']);
    island.waveBest = 15;
    const built = await api.build({spot: 'cannon_8', kind: 'mortar', actionUid: 'more-0003'});
    expect(built.spots.find(spot => spot.id === 'cannon_8')).toMatchObject({kind: 'mortar', built: true, level: 1});
    expect((await refusal(api.build({spot: 'cannon_9', kind: 'cannon', actionUid: 'more-0004'}))).code).toBe('locked');
  });
});
