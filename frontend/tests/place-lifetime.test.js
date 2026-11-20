// Real Three.js scene objects, fake local textures: no WebGL or network in unit tests.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createPlace } from '../src/world/places/factory.js';
import { places, placeIds } from '../src/world/places/registry.js';
import {edgeTrees, layouts} from '../src/world/places/layouts.js';
import {projectGround} from '../src/world/projection.js';
import {decorateProgress} from '../src/island/decorations.js';
import { canStand } from '../src/player/collision.js';
import { on, emit } from '../src/core/events.js';
const adapters = {
  loadArt: async ids => Object.fromEntries(ids.map(id => [id, new THREE.MeshBasicMaterial({ map: new THREE.Texture() })])),
  loadBackdrop: async () => new THREE.Texture(),
};
const homeTreeScale = ({x, z}) => x === -13 && z === -12 ? .42 : .7;
describe('real place lifetime', () => {
  it.each(Object.keys(edgeTrees))('keeps %s tree feet, blockers and drawing behavior while restraining only home foliage', async id => {
    const place = await createPlace({id, ...adapters, island: {decorate() {}}});
    try {
      const trees = place.group.children.filter(mesh => ['oak', 'pine', 'birch'].includes(mesh.userData.asset));
      expect(trees).toHaveLength(edgeTrees[id].length);
      expect(place.colliders).toEqual([
        ...layouts[id].filter(item => item.collider).map(item => item.collider),
        ...edgeTrees[id].map(([x, z]) => ({x, z, radius: .48})),
      ]);
      trees.forEach((mesh, index) => {
        const [x, z] = edgeTrees[id][index], foot = projectGround(x, z);
        const scale = id === 'home_islet' ? homeTreeScale({x, z}) : 1;
        expect(mesh.userData.ground).toEqual({x, z});
        expect(mesh.position.toArray()).toEqual([foot.x, foot.y, 0]);
        expect(mesh.renderOrder).toBe(100 + z);
        expect(mesh.scale.toArray()).toEqual([scale, scale, scale]);
        expect(mesh.material.userData.sway).toBeDefined();
      });
      const first = trees[0], {x, z} = first.userData.ground, sway = first.material.userData.sway;
      place.update(1 / 60, {time: 1, player: {x, z: z - 1}, night: 0, weather: {wind: .8}});
      expect(first.material.opacity).toBe(.3);
      expect(first.material.userData.sway).toBe(sway);
      expect(Number.isFinite(sway.uniform.value)).toBe(true);
      place.update(1 / 60, {time: 2, player: {x: x + 10, z: z + 10}, night: 0, weather: {wind: 0}});
      expect(first.material.opacity).toBe(1);
    } finally { place.dispose(); }
  });

  it('grows actual home trees from their smaller baseline and restores it without changing collision or ownership', async () => {
    const place = await createPlace({id: 'home_islet', ...adapters, island: {decorate() {}}});
    const trees = place.group.children.filter(mesh => ['oak', 'pine', 'birch'].includes(mesh.userData.asset));
    const colliders = structuredClone(place.colliders);
    const original = trees.map(mesh => ({position: mesh.position.clone(), geometry: mesh.geometry,
      material: mesh.material, order: mesh.renderOrder, ground: {...mesh.userData.ground}}));
    const progress = decorateProgress(place), house = id => ({id, kind: 'house', built: true});
    try {
      for (const [houses, growth] of [[[], 1], [[house('house_1')], 1.1],
        [[house('house_1'), house('house_2')], 1.2], [[house('house_2')], 1.1], [[], 1]]) {
        progress.apply({wave: 0}, houses, true);
        trees.forEach((mesh, index) => {
          const scale = homeTreeScale(original[index].ground) * growth;
          for (const value of mesh.scale.toArray()) expect(value).toBeCloseTo(scale, 12);
          expect(mesh.position).toEqual(original[index].position);
          expect(mesh.geometry).toBe(original[index].geometry);
          expect(mesh.material).toBe(original[index].material);
          expect(mesh.renderOrder).toBe(original[index].order);
          expect(mesh.userData.ground).toEqual(original[index].ground);
        });
        expect(place.colliders).toEqual(colliders);
      }
      progress.apply({wave: 0}, [house('house_1'), house('house_2')], true);
      progress.dispose(); progress.dispose();
      for (const mesh of trees) {
        const restored = homeTreeScale(mesh.userData.ground);
        expect(mesh.scale.toArray()).toEqual([restored, restored, restored]);
      }
      expect(place.colliders).toEqual(colliders);
      const materials = [...new Set(trees.map(mesh => mesh.material))], releases = materials.map(() => 0);
      materials.forEach((material, index) => material.addEventListener('dispose', () => releases[index]++));
      place.dispose(); place.dispose();
      expect(releases).toEqual(materials.map(() => 1));
    } finally { progress.dispose(); place.dispose(); }
  });

  it('creates every registered hotspot, safe stand point, anchor and light in every place', async () => {
    for (const id of placeIds) {
      const place = await createPlace({ id, ...adapters });
      expect(() => place.update(1/60)).not.toThrow();
      if(id==='saltreach_harbor'){
        expect(place.zones.some(zone=>zone.id==='bulletin_board')).toBe(false);
        place.update(1/60,{time:0,player:{x:0,z:0},night:0,weather:{fog:0},bulletin:{status:'ready'}});
      }
      expect(place.lights.every(light => ['x','y','z'].every(axis => Number.isFinite(light.beamOrigin[axis])))).toBe(true);
      expect(place.id).toBe(id); expect(place.zones).toEqual(places[id].zones);
      expect(place.anchors).toEqual(places[id].anchors); expect(place.lights).toEqual(places[id].lights);
      for (const z of place.zones) expect(canStand(z.x, z.z, place.colliders, place.groundHeight), `${id}/${z.id}`).toBe(true);
      expect(canStand(...place.spawn, place.colliders, place.groundHeight), `${id} spawn`).toBe(true);
      place.dispose();
    }
  });
  it('removes every object and disposes shared-per-place resources exactly once', async () => {
    const place = await createPlace({ id: 'saltreach_harbor', ...adapters });
    const parent = new THREE.Group(); parent.add(place.group);
    const resources = new Set();
    place.group.traverse(o => { if (o.geometry) resources.add(o.geometry); if (o.material) { resources.add(o.material); if (o.material.map) resources.add(o.material.map); } });
    const counts = new Map([...resources].map(resource => [resource, 0]));
    resources.forEach(resource => resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)));
    place.dispose(); place.dispose();
    expect(parent.children).toHaveLength(0); expect(place.group.children).toHaveLength(0);
    expect([...counts.values()].every(count => count === 1)).toBe(true);
  });
  it('emits exact home plot payloads and removes subscriptions and pointer listeners', async () => {
    const canvas = new EventTarget(), calls = [];
    const originalAdd = canvas.addEventListener.bind(canvas), originalRemove = canvas.removeEventListener.bind(canvas);
    canvas.addEventListener = (...args) => { calls.push(['add', args[0]]); originalAdd(...args); };
    canvas.removeEventListener = (...args) => { calls.push(['remove', args[0]]); originalRemove(...args); };
    const seen = [], stop = on('plot_clicked', e => seen.push(e));
    const place = await createPlace({ id: 'home_islet', ...adapters, canvas, camera: new THREE.OrthographicCamera() });
    emit({ type: 'interact', id: 'plot_4', place: 'home_islet' });
    expect(seen).toEqual([{ type: 'plot_clicked', plot: 'plot_4' }]);
    place.dispose(); emit({ type: 'interact', id: 'plot_1', place: 'home_islet' });
    expect(seen).toHaveLength(1); expect(calls.filter(c => c[0] === 'add').map(c => c[1])).toEqual(calls.filter(c => c[0] === 'remove').map(c => c[1])); stop();
  });
});
