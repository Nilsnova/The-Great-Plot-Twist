// QA must inspect a rendered level, including stale-buffer and missing-art failures.
import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {observeMultiplayerMap, WALL_AUDIT_ATLAS} from '../scripts/multiplayer-map-observer.js';
import {makeWallConnections} from '../src/island/wall-connections.js';
import {WALL_ATLAS_IDS, frames} from '../src/art/village/walls.js';

const wall = (id = 'wall_2', x = 4, z = 3, level = 1) => ({id, x, z, level, kind: 'wall', built: true});
function drawing(rows = [wall()]) {
  const scene = new THREE.Scene(), walls = makeWallConnections(scene);
  const texture = new THREE.Texture({width: WALL_AUDIT_ATLAS.width * 2, height: WALL_AUDIT_ATLAS.height * 2});
  texture.userData.villageArt = WALL_ATLAS_IDS.map(id => ({id, logical: frames[id].logical, source: 'png', file: 'village/compiled.png'}));
  walls.setArt({...WALL_AUDIT_ATLAS, texture}); walls.show(rows);
  return {scene, walls, texture, group: walls.root, mesh: walls.root.children.at(-1)};
}
const read = state => observeMultiplayerMap(state.scene, 'wall_2');
const invalid = state => expect(read(state).mode).toBe('invalid-wall-batch');

describe('actual multiplayer map observer', () => {
  it.each([1, 2, 3, 4, 5])('observes tier %i in real indexed wall buffers without inventing pips', level => {
    const state = drawing([wall('wall_2', 4, 3, level)]);
    expect(read(state)).toEqual({level, pips: 0, mode: 'wall-batch'}); state.walls.dispose();
  });
  it('observes the actual cap of a straight same-level wall, and changed level after repaint', () => {
    const rows = [wall('a', 2, 3, 3), wall('wall_2', 4, 3, 3), wall('c', 6, 3, 3)], state = drawing(rows);
    expect(read(state)).toEqual({level: 3, pips: 0, mode: 'wall-batch'});
    state.walls.show(rows.map(row => row.id === 'wall_2' ? {...row, level: 4} : row));
    expect(read(state)).toEqual({level: 4, pips: 0, mode: 'wall-batch'}); state.walls.dispose();
  });
  it('does not trust a fresh diagnostic level over stale drawn UVs', () => {
    const rows = [wall()], state = drawing(rows);
    rows[0].level = 2; // The public diagnostic reads the new row; drawn buffers still contain tier one.
    invalid(state); state.walls.dispose();
  });
  it.each(['position', 'uv', 'index'])('rejects a corrupted actual %s buffer', attribute => {
    const state = drawing(), geometry = state.mesh.geometry;
    if (attribute === 'index') geometry.index.array[geometry.index.array.length - 1] = 0;
    else geometry.getAttribute(attribute).array[geometry.getAttribute(attribute).array.length - 1] += .25;
    invalid(state); state.walls.dispose();
  });
  it.each(['missing mesh', 'hidden mesh', 'hidden ancestor', 'moved mesh', 'moved scene', 'manual matrix', 'scaled group', 'empty draw range', 'excluded post', 'no texture', 'transparent material', 'wrong texture size', 'placeholder receipt', 'empty metrics', 'missing receipt'])('rejects %s', fault => {
    const state = drawing();
    if (fault === 'missing mesh') state.group.remove(...state.group.children);
    if (fault === 'hidden mesh') state.mesh.visible = false;
    if (fault === 'hidden ancestor') state.scene.visible = false;
    if (fault === 'moved mesh') state.mesh.position.x = 1;
    if (fault === 'moved scene') state.scene.position.y = 1;
    if (fault === 'manual matrix') {state.group.matrixAutoUpdate = false; state.group.matrix.makeTranslation(1,0,0);}
    if (fault === 'scaled group') state.group.scale.x = .5;
    if (fault === 'empty draw range') state.mesh.geometry.setDrawRange(0, 0);
    if (fault === 'excluded post') state.mesh.geometry.setDrawRange(0, state.mesh.geometry.index.count - 6);
    if (fault === 'no texture') state.mesh.material.map = null;
    if (fault === 'transparent material') state.mesh.material.opacity = 0;
    if (fault === 'wrong texture size') state.texture.image.height += 9;
    if (fault === 'placeholder receipt') state.texture.userData.villageArt[0].source = 'unprepared-placeholder';
    if (fault === 'empty metrics') state.texture.userData.villageArt[0].logical = [];
    if (fault === 'missing receipt') state.texture.userData.villageArt.pop();
    invalid(state); state.walls.dispose();
  });
  it('does not report a torn-down row from another wall in the same layer', () => {
    const state = drawing([wall('other')]);
    expect(read(state)).toEqual({level: 0, pips: 0, mode: 'unobserved-wall'}); state.walls.dispose();
  });
  it('refuses teardown success when fresh rows disappear but the last observed quad is still drawn', () => {
    const rows = [wall()], state = drawing(rows);
    expect(read(state).mode).toBe('wall-batch');
    rows.splice(0); // Diagnostic rows now say absent, without replacing the old indexed geometry.
    invalid(state);
    state.walls.show(rows);
    expect(read(state)).toEqual({level: 0, pips: 0, mode: 'none'}); state.walls.dispose();
  });
  it.each(['wrong UV', 'no texture', 'moved ancestor'])('rejects a stale teardown remnant despite %s', fault => {
    const rows = [wall()], state = drawing(rows);
    expect(read(state).mode).toBe('wall-batch'); rows.splice(0);
    if (fault === 'wrong UV') state.mesh.geometry.getAttribute('uv').array.fill(0);
    if (fault === 'no texture') state.mesh.material.map = null;
    if (fault === 'moved ancestor') state.scene.position.x = 1;
    invalid(state); state.walls.dispose();
  });
  it('preserves legacy walls, towers and real pip counts, refusing duplicate renderers', () => {
    const scene = new THREE.Scene(), mesh = new THREE.Group(); mesh.name = 'island-wall:wall_2'; mesh.userData.level = 3; scene.add(mesh);
    for (let n = 1; n <= 3; n++) {const pip = new THREE.Group(); pip.name = `island-pip:wall_2:${n}`; scene.add(pip);}
    expect(observeMultiplayerMap(scene, 'wall_2')).toEqual({level: 3, pips: 3, mode: 'sprite'});
    mesh.name = 'island-cannon:wall_2';
    expect(observeMultiplayerMap(scene, 'wall_2')).toEqual({level: 3, pips: 3, mode: 'sprite'});
    const state = drawing(); state.scene.add(mesh);
    invalid(state); state.walls.dispose();
  });
});

// These cases name the presentation contract, not the renderer's shape-selection helper.
const profiles = [1, 2, 3, 4, 5].flatMap(level => ['horizontal', 'vertical'].flatMap(axis =>
  ['cap', 'buttress'].map(form => ({level, axis, form}))));
function straightRows({level, axis, form}, offset = 0) {
  const along = (form === 'buttress' ? 6 : 4) + offset;
  const center = axis === 'horizontal' ? [along, 3] : [4, along];
  return [-2, 0, 2].map((step, i) => wall(['a', 'wall_2', 'c'][i],
    center[0] + (axis === 'horizontal' ? step : 0), center[1] + (axis === 'vertical' ? step : 0), level));
}

describe('independent current cap and buttress contract', () => {
  it.each(profiles)('observes tier $level $axis $form across positive, negative and half-grid positions', profile => {
    for (const offset of [0, -12, .5]) {
      const state = drawing(straightRows(profile, offset));
      expect(read(state)).toEqual({level: profile.level, pips: 0, mode: 'wall-batch'});
      state.walls.dispose();
    }
  });

  it.each(profiles)('rejects fresh tier diagnostics over stale tier $level $axis $form buffers', profile => {
    const rows = straightRows(profile), state = drawing(rows);
    expect(read(state)).toEqual({level: profile.level, pips: 0, mode: 'wall-batch'});
    for (const row of rows) row.level = profile.level === 5 ? 1 : profile.level + 1;
    invalid(state);
    state.walls.show(rows);
    expect(read(state)).toEqual({level: rows[1].level, pips: 0, mode: 'wall-batch'});
    state.walls.dispose();
  });

  const corruptions = profiles.flatMap(profile => ['position', 'uv', 'index'].map(attribute => ({...profile, attribute})));
  it.each(corruptions)('rejects corrupted $attribute on a tier $level $axis $form', ({attribute, ...profile}) => {
    const state = drawing(straightRows(profile)), geometry = state.mesh.geometry;
    expect(read(state)).toEqual({level: profile.level, pips: 0, mode: 'wall-batch'});
    if (attribute === 'index') geometry.index.array[geometry.index.array.length - 1] = 0;
    else geometry.getAttribute(attribute).array[geometry.getAttribute(attribute).array.length - 1] += .25;
    invalid(state); state.walls.dispose();
  });

  it.each(profiles)('rejects stale teardown quads for tier $level $axis $form', profile => {
    const rows = straightRows(profile), state = drawing(rows);
    expect(read(state)).toEqual({level: profile.level, pips: 0, mode: 'wall-batch'});
    rows.splice(1, 1);
    invalid(state);
    state.walls.show(rows);
    expect(read(state)).toEqual({level: 0, pips: 0, mode: 'none'});
    state.walls.dispose();
  });
});
