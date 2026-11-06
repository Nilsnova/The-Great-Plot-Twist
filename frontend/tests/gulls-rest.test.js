// Gull's Rest is lazy-loaded, keeps its art original, and owns its small ambient effects.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { canStand } from '../src/player/collision.js';
import { createPlace } from '../src/world/places/factory.js';

function adapters(extra = {}) {
  const loaded = [];
  return {
    loaded,
    loadArt: async ids => {
      loaded.push(...ids);
      return Object.fromEntries(ids.map(id => [id, new THREE.MeshBasicMaterial({ map: new THREE.Texture() })]));
    },
    loadBackdrop: async () => new THREE.Texture(),
    ...extra,
  };
}

const frame = time => ({
  time, player: { x: 0, y: 1.03, z: 10 }, night: .4, relit: true,
  weather: { cloudCover: 0, rain: 0, fog: 0, wind: 0 },
});

describe('Gull’s Rest keepsakes and ambient life', () => {
  it('loads original keepsakes and exposes reachable named hotspots', async () => {
    const io = adapters();
    const place = await createPlace({ id: 'gulls_rest', ...io });
    expect(io.loaded).toEqual(expect.arrayContaining([
      'lens-hall-open', 'festival-lantern-string', 'lighthouse-lens', 'keepers-star', 'lantern', 'gull',
    ]));
    expect(place.zones.map(zone => zone.id)).toEqual(['gulls_rest_dock', 'lens_store', 'keepers_star']);
    expect(place.zones.map(({ x, z }) => [x, z])).toEqual([[0, 13], [0, 2], [5, 7]]);
    for (const zone of place.zones) expect(canStand(zone.x, zone.z, place.colliders, place.groundHeight), zone.id).toBe(true);
    const keepsakes = [];
    place.group.traverse(object => {
      if (object.userData.keepsake && object.userData.keepsake !== 'festival-lantern-string') keepsakes.push(object);
    });
    expect(keepsakes.map(object => [object.userData.keepsake, object.userData.ground.x, object.userData.ground.z]))
      .toEqual([['lighthouse-lens', -3, 4], ['keepers-star', 5, 7], ['lantern', -5, 9]]);
    place.dispose();
  });

  it('moves the wave and gull marks and flickers the lantern glow on the pixel grid', async () => {
    const place = await createPlace({ id: 'gulls_rest', ...adapters(), reducedMotion: () => false });
    const life = place.group.children.find(object => object.type === 'LineSegments');
    const waves = place.group.children.find(object => object.type === 'Mesh' && object.geometry.type === 'BufferGeometry');
    const lanternString = place.group.children.find(object => object.userData.keepsake === 'festival-lantern-string');
    expect(life).toBeDefined(); expect(waves).toBeDefined(); expect(lanternString).toBeDefined();
    place.update(.1, frame(1));
    const first = [life.position.x, life.position.y, waves.position.x, lanternString.material.opacity];
    place.update(.1, frame(3));
    const second = [life.position.x, life.position.y, waves.position.x, lanternString.material.opacity];
    expect(second[0]).not.toBe(first[0]);
    expect(second[2]).not.toBe(first[2]);
    expect(second[3]).not.toBe(first[3]);
    expect([first[0], first[1], second[0], second[1], first[2], second[2]]
      .every(value => Number.isInteger(value * 16))).toBe(true);
    place.dispose();
  });

  it('leaves ambient effects still for reduced motion and disposes every owned resource once', async () => {
    const place = await createPlace({ id: 'gulls_rest', ...adapters(), reducedMotion: () => true });
    const parent = new THREE.Group(); parent.add(place.group);
    const life = place.group.children.find(object => object.type === 'LineSegments');
    const waves = place.group.children.find(object => object.type === 'Mesh' && object.geometry.type === 'BufferGeometry');
    const lanternString = place.group.children.find(object => object.userData.keepsake === 'festival-lantern-string');
    place.update(1, frame(2));
    expect([life.position.x, life.position.y, waves.position.x, lanternString.material.opacity]).toEqual([-4, -5.375, 0, 1]);
    const resources = new Set();
    place.group.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) {
        resources.add(object.material);
        if (object.material.map) resources.add(object.material.map);
      }
    });
    const disposalCounts = new Map([...resources].map(resource => [resource, 0]));
    resources.forEach(resource => resource.addEventListener('dispose', () => disposalCounts.set(resource, disposalCounts.get(resource) + 1)));
    place.dispose(); place.dispose();
    expect(parent.children).toHaveLength(0);
    expect(place.group.children).toHaveLength(0);
    expect([...disposalCounts.values()].every(count => count === 1)).toBe(true);
  });
});
