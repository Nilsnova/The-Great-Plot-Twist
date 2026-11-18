import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {makeCombatWallConnections, standingCombatWalls} from '../../src/pirates/wall-connections.js';
import {createWaveRenderer, packAtlas} from '../../src/pirates/render.js';
import {createWave} from '../../src/pirates/sim.js';

const post = (id, x, z, level = 2) => ({id, kind: 'wall', x, z, level});
const hp = (id, amount = 120) => ({id, hp: amount, maxHp: 120});
const meshes = root => {
  const out = []; root.traverse(object => { if (object.isMesh) out.push(object); }); return out;
};
const atlas = () => ({texture: new THREE.Texture(), ...packAtlas()});

describe('live combat wall connections', () => {
  it('uses frozen posts, known positive sim HP and exact full-side contacts without mutating input', () => {
    const posts = [post('a', 0, 0, 5), post('b', 2, 0), post('c', 2, 2), post('gap', 4.5, 2), post('partial', -2, .5), post('diagonal', -2, -2)];
    const before = structuredClone(posts), root = new THREE.Group(), joins = makeCombatWallConnections(root);
    joins.show(posts, posts.map(item => hp(item.id)));
    expect(joins.links.map(({a, b, level}) => [a, b, level])).toEqual([['a', 'b', 2], ['b', 'c', 2]]);
    expect(posts).toEqual(before);
    expect(standingCombatWalls(posts, [hp('a', 0), hp('b', .00012)])).toEqual([{...posts[1], built: true}]);
    expect(standingCombatWalls(posts, [])).toEqual([]);
    joins.dispose();
  });

  it('retains geometry for positive HP ticks, opens both adjacent spans at zero, and restores only positive state', () => {
    const root = new THREE.Group(), joins = makeCombatWallConnections(root), posts = [post('a', 0, 0), post('b', 2, 0), post('c', 4, 0)];
    joins.show(posts, posts.map(item => hp(item.id)));
    const before = meshes(root), disposals = before.map(mesh => vi.spyOn(mesh.geometry, 'dispose'));
    for (let value = 119; value > 0; value--) joins.show([...posts].reverse(), [hp('a'), hp('b', value), hp('c')]);
    expect(meshes(root)).toEqual(before);
    for (const spy of disposals) expect(spy).not.toHaveBeenCalled();
    joins.show(posts, [hp('a'), hp('b', 0), hp('c')]);
    expect(joins.links).toEqual([]);
    for (const spy of disposals) expect(spy).toHaveBeenCalledOnce();
    joins.show(posts, [hp('a'), hp('b', .00012), hp('c')]);
    expect(joins.links).toHaveLength(2);
    joins.dispose();
  });

  it('does not accept a repair animation or wrong-instance recovery event as a restored barrier', () => {
    const defenses = [
      {...post('wall_1', 0, 0), instanceId: 'instance-a', hpUnits: 1_000_000, maxHP: 120, repairSeq: 0},
      {...post('wall_2', 2, 0), instanceId: 'instance-b', hpUnits: 0, maxHP: 120, repairSeq: 0},
    ];
    const wave = createWave({seed: 7, wave: 1, defenses, recoveryVersion: 1, waveProtocol: 2});
    const scene = new THREE.Scene(), renderer = createWaveRenderer({scene, atlas: atlas(), defenses, recoveryV1: true, fx: () => null});
    const count = () => meshes(renderer.root.getObjectByName('pirates:wall-connections')).length;
    renderer.update({state: wave.state()}); expect(count()).toBe(0);
    renderer.events([{type: 'wall_repaired', wallId: 'wall_2', x: 2, z: 0, hp: 120}]);
    renderer.update({state: wave.state()}); expect(count()).toBe(0);
    const event = {serverSeq: 1, effectiveTick: 0, type: 'structure_repaired', payload: {
      spot: 'wall_2', instanceId: 'instance-b', hpUnits: 1_000_000, maxHP: 120, repairSeq: 1,
    }};
    expect(wave.applyRecoveryEvent({...event, payload: {...event.payload, instanceId: 'old-instance'}})).toBe(false);
    renderer.update({state: wave.state()}); expect(count()).toBe(0);
    expect(wave.applyRecoveryEvent(event)).toBe(true);
    renderer.update({state: wave.state()}); expect(count()).toBe(1);
    const geometry = meshes(renderer.root.getObjectByName('pirates:wall-connections'))[0].geometry;
    expect(wave.applyRecoveryEvent(event)).toBe(false);
    renderer.update({state: wave.state()});
    expect(meshes(renderer.root.getObjectByName('pirates:wall-connections'))[0].geometry).toBe(geometry);
    renderer.dispose();
  });

  it('ignores frozen initial health during combat and preserves the explicit post-wave handoff', () => {
    const defenses = [{...post('a', 0, 0), rest: 1}, {...post('b', 2, 0), rest: 1}];
    const renderer = createWaveRenderer({scene: new THREE.Scene(), atlas: atlas(), defenses, fx: () => null});
    const state = {ships: [], walls: [hp('a'), hp('b', 0)], towers: [], fog: 0};
    renderer.update({state});
    const root = renderer.root.getObjectByName('pirates:wall-connections');
    expect(meshes(root)).toHaveLength(0);
    renderer.setDefenses(defenses.map(item => ({...item, health: 100})));
    renderer.update({state}); expect(meshes(root)).toHaveLength(1);
    renderer.setVisible(false); renderer.update({state});
    expect(renderer.root.visible).toBe(false); expect(root.visible).toBe(false);
    renderer.setVisible(true); renderer.update({state}); expect(root.visible).toBe(true);
    renderer.dispose();
  });

  it('matches healthy world junction widths without shifting feet and leaves damage/ruins full width', () => {
    const defenses = [post('a', 0, 0), post('b', 2, 0)];
    const renderer = createWaveRenderer({scene: new THREE.Scene(), atlas: atlas(), defenses, fx: () => null});
    const state = {ships: [], walls: [hp('a'), hp('b')], towers: [], fog: 0};
    const postMesh = () => renderer.root.getObjectByName('pirates:defense:a');
    renderer.update({state});
    const foot = [...postMesh().geometry.getAttribute('iPos').array.slice(0, 2)];
    expect(postMesh().geometry.getAttribute('iSize').array[0]).toBeCloseTo(3 * .62);
    renderer.update({state: {...state, walls: [hp('a', 60), hp('b')]}});
    expect(postMesh().geometry.getAttribute('iSize').array[0]).toBe(3);
    renderer.update({state: {...state, walls: [hp('a', 0), hp('b')]}});
    expect(postMesh().geometry.getAttribute('iSize').array[0]).toBe(3);
    expect([...postMesh().geometry.getAttribute('iPos').array.slice(0, 2)]).toEqual(foot);
    renderer.dispose();
  });

  it('keeps connections outside picking and releases owned geometry/material exactly once', () => {
    const root = new THREE.Group(), joins = makeCombatWallConnections(root);
    joins.show([post('a', 0, 0), post('b', 2, 0)], [hp('a'), hp('b')]);
    const mesh = meshes(root)[0], geometry = vi.spyOn(mesh.geometry, 'dispose'), material = vi.spyOn(mesh.material, 'dispose');
    expect(new THREE.Raycaster(new THREE.Vector3(1, 1, 10), new THREE.Vector3(0, 0, -1)).intersectObject(root, true)).toEqual([]);
    joins.dispose(); joins.dispose();
    expect(geometry).toHaveBeenCalledOnce(); expect(material).toHaveBeenCalledOnce(); expect(root.children).toHaveLength(0);
    joins.show([post('a', 0, 0), post('b', 2, 0)], [hp('a'), hp('b')]);
    expect(root.children).toHaveLength(0);
  });
});
