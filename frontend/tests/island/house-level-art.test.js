import {describe, expect, it} from 'vitest';
import {buildingArt, ROLE_ART} from '../../src/island/world.js';
import {islandFrame} from '../../src/art/registry.js';
import {browserHarness} from '../g20-browser.js';

const evaluate = browserHarness();

describe('house level art', () => {
  it('keeps roles at levels 2/3, neutral fallbacks and the existing frame anchors', () => {
    for (const role of [null, ...Object.keys(ROLE_ART)]) {
      const levels = role ? [2, 3] : [1, 2, 3];
      const ids = levels.map(level => buildingArt('house', level, role));
      expect(new Set(ids).size).toBe(levels.length);
      for (const id of ids) expect(islandFrame(id).slice(0, 3)).toEqual(role ? [80, 72, 8] : [64, 64, 8]);
    }
    expect(buildingArt('house', 1, 'tavern')).toBe('island-house');
    expect(buildingArt('house', 2, 'unknown')).toBe('island-house-l2');
    for (const invalid of [0, -1, NaN, '3']) expect(buildingArt('house', invalid, 'tavern')).toBe('island-house');
    expect(buildingArt('house', 999, 'tavern')).toBe('island-house-tavern-l3');
  });

  it('changes the painted silhouette at each level, rather than only its color or pips', async () => {
    const groups = await evaluate(async () => {
      const {buildingArt} = await window.g20Import('/src/island/world.js');
      const {frameCanvas} = await window.g20Import('/src/art/textures.js');
      return [null, 'barracks', 'tavern', 'workshop'].map(role => {
        const levels = role ? [2, 3] : [1, 2, 3];
        return levels.map(level => {
          const canvas = frameCanvas(buildingArt('house', level, role), 2);
          const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          return Array.from(pixels.filter((_value, index) => index % 4 === 3), alpha => alpha > 200 ? 1 : 0).join('');
        });
      });
    });
    for (const masks of groups) expect(new Set(masks).size).toBe(masks.length);
  });

  it('loads the new role frames, swaps art on upgrade and releases replaced geometry', async () => {
    const result = await evaluate(async () => {
      const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
      const {decorateIsland} = await window.g20Import('/src/island/world.js');
      const place = {group: new THREE.Group(), colliders: [], zones: []};
      let wanted = [];
      const drawing = decorateIsland(place, {layout: {spots: [{id: 'house_1', slot: 'house', x: 3, z: 4}], zones: () => [], cabin: false, bell: false},
        loadArt: async names => { wanted = names; return Object.fromEntries(names.map(id => [id, new THREE.MeshBasicMaterial()])); }});
      await Promise.resolve();
      const group = place.group.children.find(child => child.name === 'island');
      const spot = {id: 'house_1', kind: 'house', built: true, level: 2, spec: 'tavern'};
      drawing.apply({spots: [spot]});
      const find = () => group.children.find(child => child.name === 'island-house:house_1');
      const before = find(), position = before.position.toArray(), box = [before.geometry.parameters.width, before.geometry.parameters.height];
      let replaced = 0, released = 0;
      before.geometry.addEventListener('dispose', () => replaced++);
      drawing.apply({spots: [{...spot, level: 3}]});
      const after = find(), stable = after.geometry;
      after.geometry.addEventListener('dispose', () => released++);
      drawing.apply({spots: [{...spot, level: 3}]});
      const sameGeometry = find().geometry === stable;
      const upgraded = {asset: after.userData.asset, role: after.userData.role, level: after.userData.level,
        samePosition: JSON.stringify(after.position.toArray()) === JSON.stringify(position),
        sameBox: JSON.stringify([after.geometry.parameters.width, after.geometry.parameters.height]) === JSON.stringify(box)};
      drawing.dispose(); drawing.dispose();
      return {wanted, upgraded, sameGeometry, replaced, released};
    });
    for (const role of Object.keys(ROLE_ART)) expect(result.wanted).toContain(`${ROLE_ART[role]}-l3`);
    expect(result.upgraded).toEqual({asset: 'island-house-tavern-l3', role: 'tavern', level: 3, samePosition: true, sameBox: true});
    expect(result).toMatchObject({sameGeometry: true, replaced: 1, released: 1});
  });
});
