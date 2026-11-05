// Real Three.js scene objects, fake local textures: no WebGL or network in unit tests.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createPlace } from '../src/world/places/factory.js';
import { places, placeIds } from '../src/world/places/registry.js';
import { canStand } from '../src/player/collision.js';
import { on, emit } from '../src/core/events.js';
const adapters = {
  loadArt: async ids => Object.fromEntries(ids.map(id => [id, new THREE.MeshBasicMaterial({ map: new THREE.Texture() })])),
  loadBackdrop: async () => new THREE.Texture(),
};
describe('real place lifetime', () => {
  it('creates every registered hotspot, safe stand point, anchor and light in every place', async () => {
    for (const id of placeIds) {
      const place = await createPlace({ id, ...adapters });
      expect(() => place.update(1/60)).not.toThrow();
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
