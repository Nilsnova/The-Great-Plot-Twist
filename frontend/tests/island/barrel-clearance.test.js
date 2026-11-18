// One unsaved prop clears the western wall corridor; real feet/reserves/blockers must agree.
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {layouts, edgeTrees} from '../../src/world/places/layouts.js';
import {places} from '../../src/world/places/registry.js';
import {createSettlement} from '../../src/world/places/settlement.js';
import {projectGround} from '../../src/world/projection.js';
import {WALL_OBSTACLES, checkMove, positionsOf} from '../../src/island/placement.js';
import {EXTRA_SPOTS} from '../../src/island/spots.js';

const server = JSON.parse(readFileSync(new URL('../../../backend/content/island_layout.json', import.meta.url)));
const trees = [[-15,6],[-16,0],[-13,-12],[-9,-17],[9,-17],[15,-8],[16,2],[14,11],[-12,13]];
const barrel = {id: 'barrel', name: 'the barrel', x: -10.5, z: 8, w: 1.25, d: .75};
const options = {wallRuleVersion: 1, wallCapacity: 128};
const check = (x, z) => checkMove('wall_13', x, z, positionsOf(EXTRA_SPOTS), options);

describe('western barrel clearance', () => {
  it('draws the single barrel at its reserved foot without adding colliders or interaction zones', async () => {
    const place = await createSettlement({id: 'home_islet', loadArt: async ids => Object.fromEntries(ids.map(id => [id,
      new THREE.MeshBasicMaterial({map: new THREE.Texture()})])), loadBackdrop: async () => new THREE.Texture()});
    try {
      const barrels = place.group.children.filter(mesh => mesh.userData.asset === 'barrel');
      expect(barrels).toHaveLength(1);
      const foot = projectGround(-10.5, 8);
      expect(barrels[0].userData.ground).toEqual({x: -10.5, z: 8});
      expect(barrels[0].position.toArray()).toEqual([foot.x, foot.y, 0]);
      expect(barrels[0].renderOrder).toBe(108);
      expect(place.colliders).toEqual(trees.map(([x, z]) => ({x, z, radius: .48})));
      expect(place.zones).toBe(places.home_islet.zones);
      expect(layouts.home_islet.filter(prop => prop.asset !== 'barrel')).toEqual([
        {asset: 'bench', x: 4, z: 13}, {asset: 'lantern', x: -3, z: 12}]);
      expect(edgeTrees.home_islet).toEqual(trees);
    } finally { place.dispose(); }
  });
  it('matches client/server reserves while every other scenery reserve stays fixed', () => {
    expect(WALL_OBSTACLES).toEqual(server.wallObstacles);
    expect(WALL_OBSTACLES.find(row => row.id === 'barrel')).toEqual(barrel);
    expect(WALL_OBSTACLES.filter(row => row.id !== 'barrel')).toEqual([
      ...trees.map(([x, z], index) => ({id: `tree_${index + 1}`, name: 'a tree', x, z, radius: .48})),
      {id: 'bench', name: 'the bench', x: 4, z: 13, w: 2.5, d: .75},
      {id: 'lantern', name: 'the lantern', x: -3, z: 12, w: .5, d: .5},
      {id: 'record', name: 'the record board', x: -3.5, z: 2.5, w: 1.5, d: .75},
      {id: 'statue', name: 'the statue', x: 4, z: 5.5, w: 2.5, d: 1},
    ]);
  });
  it.each([6, 8])('admits the western wall corridor cell at -12.5,%s', z => {
    expect(check(-12.5, z)).toEqual({ok: true});
  });
  it('still refuses a new wall through the relocated barrel base', () => {
    expect(check(-10.5, 8)).toMatchObject({ok: false, code: 'place_taken', message: 'That is too close to the barrel.'});
  });
});
