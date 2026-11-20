import {expect, it} from 'vitest';
import {Group} from 'three';
import {makeBuildingFoundations} from '../../src/island/building-foundations.js';
import {defenseDisplayAnchors, TOWER_PAD, padCorners} from '../../src/island/defense-display.js';
import {ARSENAL, CAMPAIGN_BUILDINGS, placedSpot} from '../../src/island/spots.js';
import {HEART, checkMove, positionsOf} from '../../src/island/placement.js';
import {surfaceClass} from '../../src/world/places/surfaces.js';
import {unprojectGround} from '../../src/world/projection.js';

function readFoundation(id, at = placedSpot(id), slot = 'tower') {
  const root = new Group(), foundations = makeBuildingFoundations(root);
  foundations.show([{slot, ...at}]);
  const vertices = root.children[0].geometry.getAttribute('position');
  const points = Array.from({length: vertices.count}, (_, i) => {
    const height = vertices.getZ(i);
    return {...unprojectGround(vertices.getX(i), vertices.getY(i) - height), height};
  });
  foundations.dispose();
  return points;
}

it.each([ARSENAL, ...CAMPAIGN_BUILDINGS.filter(item => ['island_harbor', 'island_techhub'].includes(item.id))])(
  'keeps the low apron at $id on the original dry ground',
  building => {
    const tread = readFoundation(building.id, building, building.id).filter(point => point.height > 0);
    expect(tread.length).toBeGreaterThan(0);
    expect(tread.every(({x, z, height}) => surfaceClass('home_islet', x, z) > 0 && height < .08)).toBe(true);
  },
);

it.each([['heart', HEART], ['house', placedSpot('house_1')]])(
  'leaves the original path beneath the %s visible',
  (slot, at) => {
    expect(readFoundation(slot, at, slot).every(point => point.height === 0)).toBe(true);
  },
);

it('keeps the southeast Heart roof shadow near the foundation and on dry ground', () => {
  const points = readFoundation('heart', HEART, 'heart');
  const longest = Math.max(...points.map(({x, z}) => (x - HEART.x) * .66 + (z - HEART.z) * .75));
  expect(longest).toBeGreaterThan(2.5);
  expect(longest).toBeLessThan(4);
  const coastal = readFoundation('coastal-house', {x: 14, z: 13}, 'house');
  expect(coastal.length).toBeGreaterThan(0);
  expect(coastal.every(({x, z}) => surfaceClass('home_islet', x, z) > 0)).toBe(true);
});

it.each(['cannon_1', 'cannon_2', 'cannon_3', 'cannon_4'])('provides a solid perch at the original coastal slot %s', id => {
  const points = readFoundation(id), toes = points.filter(({height}) => height < -.9);
  const cap = points.filter(({height}) => height > .1).map(({x}) => x);
  expect(Math.max(...cap) - Math.min(...cap)).toBeGreaterThan(1.7);
  expect(toes.length).toBeGreaterThan(0);
  expect(toes.every(({x, z}) => surfaceClass('home_islet', x, z) > 0)).toBe(true);
});

it('keeps the ordinary shallow pad on an inland slot', () => {
  const points = readFoundation('cannon_6');
  expect(points.some(({height}) => height > .1)).toBe(true);
  expect(points.every(({height}) => height >= 0)).toBe(true);
});

it('keeps dressed cap and side blocks inside the tower footprint', () => {
  const anchor = placedSpot('cannon_6');
  const {width, depth, rear} = TOWER_PAD;
  const stones = readFoundation('cannon_6', anchor).filter(({height}) => height > 0);
  expect(stones.length).toBeGreaterThan(0);
  expect(stones.every(({x, z, height}) => Math.abs(x - anchor.x) <= width + .0001
    && Math.abs(z - anchor.z + rear) <= depth + .0001 && height < .17)).toBe(true);
});

const coastalGuns = ['cannon_1', 'cannon_2', 'cannon_3', 'cannon_4'].map(id => {
  const {x, z} = placedSpot(id);
  return Object.freeze({id, kind: 'cannon', x, z});
});

it.each(coastalGuns.map(({id}) => id))('draws %s and its stone pad inland with a visible shore gap', id => {
  const original = coastalGuns.find(gun => gun.id === id);
  const {x, z} = defenseDisplayAnchors('home_islet', coastalGuns).get(id);
  expect(Math.hypot(x - original.x, z - original.z)).toBeGreaterThan(1.5);
  const {width, depth, rear} = TOWER_PAD;
  const rimAndGap = padCorners(x, z - rear, width + .8, depth + .8);
  expect(rimAndGap.every(([gx, gz]) => surfaceClass('home_islet', gx, gz) > 0)).toBe(true);

  const points = readFoundation(id, {x, z, inshore: true});
  expect(points.some(({height}) => height > .1)).toBe(true);
  expect(points.every(({height}) => height >= 0)).toBe(true);
});

it('only shifts guns that need a clear dry pad on Home Island', () => {
  const inland = {id: 'cannon_6', kind: 'cannon', x: 14.5, z: -3};
  const view = defenseDisplayAnchors('home_islet', [inland, ...coastalGuns]);
  expect(view.has(inland.id)).toBe(false);
  expect([...defenseDisplayAnchors('home_islet', [...coastalGuns].reverse())]).toEqual([...view]);
  expect(defenseDisplayAnchors('lighthouse_isle', coastalGuns).size).toBe(0);
});

it('searches clear alternatives and keeps the saved position when the inshore ground is occupied', () => {
  const gun = coastalGuns[2], preferred = defenseDisplayAnchors('home_islet', [gun]).get(gun.id);
  const neighbor = {id: 'cannon_6', kind: 'cannon', x: 13.5, z: 12.5};
  const crowded = {...neighbor, z: 13.5};
  for (const {id, x, z} of [neighbor, crowded]) {
    expect(checkMove(id, x, z, positionsOf([gun])).ok).toBe(true);
  }
  const offset = defenseDisplayAnchors('home_islet', [gun, neighbor]).get(gun.id);
  expect(offset).toBeDefined();
  expect(offset).not.toEqual(preferred);
  const {width, depth, rear} = TOWER_PAD;
  expect(Math.abs(offset.x - neighbor.x) >= width + 1 || Math.abs(offset.z - rear - neighbor.z) >= depth + 1).toBe(true);
  expect(defenseDisplayAnchors('home_islet', [gun, crowded]).has(gun.id)).toBe(false);
});
