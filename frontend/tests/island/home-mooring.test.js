import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it('fits the real southwest mooring artwork without changing walking, targeting or the wave view', async () => {
  const result = await browser(async () => {
    const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
    const {createPlace} = await window.g20Import('/src/world/places/factory.js');
    const {decorateIsland} = await window.g20Import('/src/island/world.js');
    const {placedSpot} = await window.g20Import('/src/island/spots.js');
    const {canStand} = await window.g20Import('/src/player/collision.js');
    const {projectGround} = await window.g20Import('/src/world/projection.js');
    const {routes} = await window.g20Import('/src/world/places/registry.js');
    let island;
    const place = await createPlace({
      id: 'home_islet', loadBackdrop: async () => new THREE.Texture(),
      island: {decorate(place, art, cleanups) {
        island = decorateIsland(place, {art, reducedMotion: true});
        cleanups.push(() => island.dispose());
      }},
    });
    try {
      await island.retryArt();
      const bollard = place.group.getObjectByName('home-mooring-bollard');
      const skiff = place.group.getObjectByName('home-mooring-skiff');
      const rope = place.group.getObjectByName('home-mooring-rope');
      const stage = place.group.getObjectByName('home-mooring-stage');
      const parts = [bollard, skiff, rope, stage];
      const resources = [skiff.material, bollard.material, ...rope.children.map(mesh => mesh.geometry), stage.geometry, stage.material];
      const released = resources.map(() => 0);
      resources.forEach((resource, i) => resource.addEventListener('dispose', () => released[i]++));
      const visibility = () => parts.map(mesh => mesh.visible);
      const home = visibility();
      const eyes = parts.slice(0, 2).map(mesh => mesh.userData.ground);
      const positionsMatchGround = parts.slice(0, 2).every(mesh => {
        const {x, z} = mesh.userData.ground, projected = projectGround(x, z);
        return mesh.position.x === projected.x && mesh.position.y === projected.y;
      });
      const positionsBeforeWave = parts.map(mesh => mesh.position.toArray());
      const ropePositions = rope.children.map(mesh => mesh.geometry.getAttribute('position'));
      const originalRope = ropePositions.map(position => Array.from(position.array));
      rope.children.forEach(mesh => mesh.onBeforeRender(null, null, {userData: {homePortraitDepth: 1.9}}));
      const ropeChangesOnlyHeight = ropePositions.every((position, i) => Array.from(position.array).some((value, j) => j % 3 === 1 && value !== originalRope[i][j])
        && Array.from(position.array).every((value, j) => j % 3 === 1 || value === originalRope[i][j]));
      rope.children.forEach(mesh => mesh.onBeforeRender(null, null, {userData: {homePortraitDepth: 1}}));
      const ropeReturns = ropePositions.every((position, i) => Array.from(position.array).every((value, j) => value === originalRope[i][j]));
      skiff.geometry.computeBoundingBox();
      const {min, max} = skiff.geometry.boundingBox;
      const {image} = skiff.material.map;
      const pixels = image.getContext('2d').getImageData(0, 0, image.width, image.height).data;
      let bottom = 0;
      for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
        if (pixels[(y * image.width + x) * 4 + 3] > 90) bottom = y + 1;
      }
      const visibleHullBottom = skiff.position.y + max.y - (max.y - min.y) * bottom / image.height;
      const actualHits = new THREE.Raycaster(new THREE.Vector3(skiff.position.x, skiff.position.y + .5, 10), new THREE.Vector3(0, 0, -1))
        .intersectObjects(parts, true).length;
      const target = island.pickAt(-8, 24.5);
      const standsAshore = canStand(-9.5, 19, place.colliders, place.groundHeight);
      const standsOnSkiff = canStand(-8, 24.5, place.colliders, place.groundHeight);
      const standsOnStage = canStand(-6.4, 23.8, place.colliders, place.groundHeight);
      const sharesCollider = eyes.some(at => place.colliders.some(({x, z}) => x === at.x && z === at.z));
      const originalZones = place.zones.map(({id}) => id);
      const shoreZones = () => place.zones.filter(({id}) => id === 'island_harbor' || id === 'island_bell');
      const shoreBefore = shoreZones();
      const retainsTravel = routes.some(([from, to]) => from === 'saltreach_harbor' && to === place.id);
      const wallBefore = placedSpot('wall_4');
      island.apply({battle: true});
      const battle = visibility();
      island.apply({battle: false});
      const returned = visibility();
      const stable = parts.every((mesh, i) => mesh.position.toArray().every((value, axis) => value === positionsBeforeWave[i][axis]));
      const maxOrder = Math.max(skiff.renderOrder, bollard.renderOrder, ...rope.children.map(mesh => mesh.renderOrder));
      const zoneIdsStable = JSON.stringify(originalZones) === JSON.stringify(place.zones.map(({id}) => id));
      const shoreStable = shoreBefore.length === 2 && JSON.stringify(shoreBefore) === JSON.stringify(shoreZones());
      const wallStable = JSON.stringify(wallBefore) === JSON.stringify(placedSpot('wall_4'));
      place.dispose();
      place.dispose();
      return {home, battle, returned, eyes, positionsMatchGround, maxOrder, stable, released, actualHits, target,
        width: max.x - min.x, waterline: skiff.position.y, visibleHullBottom, standsAshore, standsOnSkiff, standsOnStage, sharesCollider,
        zoneIdsStable, shoreStable, retainsTravel, wallStable, ropeChangesOnlyHeight, ropeReturns};
    } finally { place.dispose(); }
  });
  expect(result).toMatchObject({
    home: [true, true, true, true], battle: [true, false, false, false], returned: [true, true, true, true],
    eyes: [{x: -9.5, z: 19.5}, {x: -8, z: 24.5}], positionsMatchGround: true, stable: true, released: [1, 1, 1, 1, 1, 1],
    actualHits: 0, target: null, standsAshore: true, standsOnSkiff: false, standsOnStage: false, sharesCollider: false,
    zoneIdsStable: true, shoreStable: true, retainsTravel: true, wallStable: true, ropeChangesOnlyHeight: true, ropeReturns: true,
  });
  expect(result.maxOrder).toBeLessThan(20);
  expect(result.width).toBe(4.75);
  expect(result.waterline).toBeCloseTo(-14.7);
  expect(result.visibleHullBottom).toBeGreaterThanOrEqual(-14.88);
  expect(result.visibleHullBottom).toBeLessThan(-14.65);
});
