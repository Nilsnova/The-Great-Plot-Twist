// Outside a wave the island shows each building's real kind and level, its pips and the hired crew.
import {describe, expect, it} from 'vitest';
import {buildingArt, crewPlaces, pipCount, LEVEL_ART, PIP_ART, PIP_TIER_ART} from '../../src/island/world.js';
import {artSizes} from '../../src/world/art.js';
import {crewArt} from '../../src/pixel/pirate-catalog.js';

describe('island building art', () => {
  it('uses the level art for walls, cannons and mortars and one drawing for the rest', () => {
    expect(buildingArt('wall', 1)).toBe('island-wall');
    expect(buildingArt('wall', 3)).toBe('island-wall-l3');
    expect(buildingArt('cannon', 2)).toBe('island-cannon-l2');
    expect(buildingArt('mortar', 3)).toBe('island-mortar-l3');
    expect(buildingArt('watchtower', 2)).toBe('island-watchtower');
    expect(buildingArt('house', 2)).toBe('island-house');
    expect(buildingArt('cannon', 5)).toBe('island-cannon-l5'); // the tower tiers (GAME-V3.md §4.1)
    expect(buildingArt('cannon', 9)).toBe('island-cannon-l5');
    expect(buildingArt('cannon', undefined)).toBe('island-cannon');
    expect(buildingArt('ghost', 1)).toBeNull();
  });
  it('every drawing it asks for is in the catalog', () => {
    // Levels 4 and 5 are cartoon-only drawings: in the art sizes (src/world/art.js), not the pixel catalog.
    for (const id of [...Object.values(LEVEL_ART).flat(), PIP_ART, PIP_TIER_ART, ...Object.values(crewArt)]) expect(Object.hasOwn(artSizes, id), id).toBe(true);
  });
  it('shows pips on towers always and on the rest from level 2', () => {
    expect(pipCount('cannon', 1)).toBe(1);
    expect(pipCount('mortar', 3)).toBe(3);
    expect(pipCount('wall', 1)).toBe(0);
    expect(pipCount('wall', 2)).toBe(2);
    expect(pipCount('house', 2)).toBe(2);
    expect(pipCount('watchtower', 1)).toBe(0);
  });
});

describe('crew on the island', () => {
  const spots = [
    {id: 'cannon_1', kind: 'cannon', level: 1, built: true, x: -12.5, z: -14.5},
    {id: 'cannon_2', kind: 'mortar', level: 3, built: true, x: 13, z: -15},
    {id: 'cannon_3', kind: 'cannon', level: 2, built: true, x: 15.5, z: 14},
    {id: 'wall_1', kind: 'wall', level: 1, built: true, x: -18.5, z: -4},
    {id: 'wall_2', kind: 'wall', level: 1, built: false, x: 4, z: -19.5},
  ];
  it('puts gunners by the strongest towers and carpenters by the walls', () => {
    const places = crewPlaces(spots, {gunner: 2, carpenter: 2, lookout: 0});
    expect(places.filter(item => item.kind === 'gunner').map(item => item.at)).toEqual(['cannon_2', 'cannon_3']);
    const carpenters = places.filter(item => item.kind === 'carpenter');
    expect(carpenters.map(item => item.at)).toEqual(['wall_1', 'wall_1']);
    expect(carpenters[0].x).not.toBe(carpenters[1].x); // two on one wall stand on either side
  });
  it('stands beside the building, towards the middle of the island', () => {
    const [gunner] = crewPlaces(spots, {gunner: 1});
    expect(gunner.x).toBeLessThan(13); expect(Math.abs(gunner.x - 13)).toBeLessThan(2);
  });
  it('puts the lookout at the watchtower, or by the bell without one', () => {
    const bell = {x: 8.5, z: 12};
    expect(crewPlaces(spots, {lookout: 1}, {bell})[0]).toMatchObject({kind: 'lookout', at: 'bell'});
    const tower = {id: 'tower_1', kind: 'watchtower', level: 1, built: true, x: 0, z: -14};
    expect(crewPlaces([...spots, tower], {lookout: 1}, {bell})[0]).toMatchObject({kind: 'lookout', at: 'tower_1'});
    expect(crewPlaces(spots, {lookout: 1})).toEqual([]);
  });
  it('shows nobody without crew or without buildings', () => {
    expect(crewPlaces(spots, {})).toEqual([]);
    expect(crewPlaces([], {gunner: 2, carpenter: 2})).toEqual([]);
  });
});
