import {expect, it} from 'vitest';
import {Group} from 'three';
import {makeBuildingFoundations} from '../../src/island/building-foundations.js';
import {placedSpot} from '../../src/island/spots.js';
import {surfaceClass} from '../../src/world/places/surfaces.js';
import {unprojectGround} from '../../src/world/projection.js';

function readFoundation(id) {
  const {x, z} = placedSpot(id);
  const root = new Group(), foundations = makeBuildingFoundations(root);
  foundations.show([{slot: 'tower', x, z}]);
  const vertices = root.children[0].geometry.getAttribute('position');
  const points = Array.from({length: vertices.count}, (_, i) => {
    const height = vertices.getZ(i);
    return {...unprojectGround(vertices.getX(i), vertices.getY(i) - height), height};
  });
  foundations.dispose();
  return points;
}

it.each(['cannon_1', 'cannon_2', 'cannon_3', 'cannon_4'])('provides a solid perch at the original coastal slot %s', id => {
  const points = readFoundation(id), toes = points.filter(({height}) => height < -.67);
  expect(points.some(({height}) => height > .1)).toBe(true);
  expect(toes.length).toBeGreaterThan(0);
  expect(toes.every(({x, z}) => surfaceClass('home_islet', x, z) > 0)).toBe(true);
});

it('keeps the ordinary shallow pad on an inland slot', () => {
  const points = readFoundation('cannon_6');
  expect(points.some(({height}) => height > .1)).toBe(true);
  expect(points.every(({height}) => height >= 0)).toBe(true);
});
