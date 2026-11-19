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
    const {layouts} = await window.g20Import('/src/world/places/layouts.js');
    const {artSizes} = await window.g20Import('/src/world/art.js');
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
      const water = place.group.getObjectByName('home-mooring-water');
      const landing = place.group.getObjectByName('home-timber-landing');
      const stage = place.group.getObjectByName('home-mooring-stage');
      const parts = [bollard, skiff, rope, water, landing, stage];
      const resources = [skiff.material, bollard.material, ...rope.children.map(mesh => mesh.geometry),
        water.material, water.geometry, landing.material, landing.geometry, stage.material, stage.geometry];
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
      skiff.geometry.computeBoundingBox();
      const {min, max} = skiff.geometry.boundingBox;
      const {image} = skiff.material.map;
      const pixels = image.getContext('2d').getImageData(0, 0, image.width, image.height).data;
      let bottom = 0;
      for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
        if (pixels[(y * image.width + x) * 4 + 3] > 90) bottom = y + 1;
      }
      const visibleHullBottom = skiff.position.y +
        (max.y - (max.y - min.y) * bottom / image.height) * skiff.scale.y;
      const actualHits = new THREE.Raycaster(new THREE.Vector3(skiff.position.x, skiff.position.y + .5, 10), new THREE.Vector3(0, 0, -1))
        .intersectObjects(parts, true).length;
      const target = island.pickAt(-8, 24.5);
      const standsAshore = canStand(-9.5, 19, place.colliders, place.groundHeight);
      const standsOnSkiff = canStand(-8, 24.5, place.colliders, place.groundHeight);
      const standsOnStage = canStand(-10, 24.4, place.colliders, place.groundHeight);
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
      const propsStayAtTheirFeet = layouts.home_islet.every(({asset, x, z}) => {
        const mesh = place.group.children.find(node => node.userData.asset === `home-${asset}`);
        const foot = projectGround(x, z);
        return mesh?.position.x === foot.x && mesh.position.y === foot.y
          && artSizes[mesh.userData.asset].every((dimension, i) => dimension === artSizes[asset][i]);
      });
      place.dispose();
      place.dispose();
      return {home, battle, returned, eyes, positionsMatchGround, maxOrder, stable, released, actualHits, target,
        width: (max.x - min.x) * skiff.scale.x, waterline: skiff.position.y, visibleHullBottom, standsAshore, standsOnSkiff, standsOnStage, sharesCollider,
        zoneIdsStable, shoreStable, retainsTravel, wallStable, propsStayAtTheirFeet};
    } finally { place.dispose(); }
  });
  expect(result).toMatchObject({
    home: [true, true, true, true, true, true], battle: [true, false, false, false, true, false],
    returned: [true, true, true, true, true, true],
    eyes: [{x: -9.5, z: 19.5}, {x: -8, z: 24.5}], positionsMatchGround: true, stable: true,
    released: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    actualHits: 0, target: null, standsAshore: true, standsOnSkiff: false, standsOnStage: false, sharesCollider: false,
    zoneIdsStable: true, shoreStable: true, retainsTravel: true, wallStable: true, propsStayAtTheirFeet: true,
  });
  expect(result.maxOrder).toBeLessThan(20);
  expect(result.width).toBeCloseTo(3.72);
  expect(result.waterline).toBeCloseTo(-14.7);
  expect(result.visibleHullBottom).toBeGreaterThanOrEqual(-14.88);
  expect(result.visibleHullBottom).toBeLessThan(-14.65);
});

it('moves the skiff, rope and rooted vegetation together and restores their rest poses', async () => {
  const result = await browser(async () => {
    const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
    const {createPlace} = await window.g20Import('/src/world/places/factory.js');
    const {MOORING_EYES} = await window.g20Import('/src/art/home-shore.js');
    const {artSizes} = await window.g20Import('/src/world/art.js');
    let still = false;
    const place = await createPlace({
      id: 'home_islet', loadBackdrop: async () => new THREE.Texture(), reducedMotion: () => still,
      island: {decorate() {}},
    });
    try {
      const skiff = place.group.getObjectByName('home-mooring-skiff');
      const rope = place.group.getObjectByName('home-mooring-rope');
      const water = place.group.getObjectByName('home-mooring-water');
      const wake = water.material.uniforms.uWakePhase;
      const cord = rope.children[0].geometry.attributes.position;
      const plants = place.group.children.filter(mesh => mesh.material?.userData.sway);
      const planted = plants.map(mesh => mesh.position.toArray());
      const [x, z] = place.spawn;
      const wave = (time, paused = false) => {
        place.update(1 / 60, {time, paused, player: {x, z}, night: 0, weather: {wind: .5}});
        place.prepareMooringRender();
      };
      const pose = () => [...skiff.position.toArray(), skiff.rotation.z];
      const end = i => new THREE.Vector3().fromBufferAttribute(cord, i)
        .add(new THREE.Vector3().fromBufferAttribute(cord, i + 1)).multiplyScalar(.5);
      const rest = pose(), waterline = water.position.toArray(), ashore = end(0), afloat = end(cord.count - 2);
      for (let step = 1; step <= 50; step++) wave(step / 60);
      const changed = pose(), moved = end(cord.count - 2), movingWake = wake.value;
      const eye = mesh => {
        const asset = mesh.userData.asset, [w, h, foot] = artSizes[asset], [eyeX, eyeY] = MOORING_EYES[asset];
        return mesh.localToWorld(new THREE.Vector3(eyeX / 16 - w / 2, (1 - foot) * h - eyeY / 16, 0));
      };
      const cleat = eye(skiff);
      const plantsMove = plants.every(mesh => Math.abs(mesh.material.userData.sway.uniform.value) > 0);
      const sway = plants.map(mesh => mesh.material.userData.sway.uniform.value);
      const grounded = plants.every((mesh, index) => mesh.position.toArray().every((v, i) => v === planted[index][i]));
      const stakeStable = ashore.distanceTo(end(0));
      wave(.9, true);
      const frozen = pose().every((v, i) => v === changed[i]) && moved.distanceTo(end(cord.count - 2)) === 0
        && wake.value === movingWake && plants.every((mesh, i) => mesh.material.userData.sway.uniform.value === sway[i]);
      const bollard = place.group.getObjectByName('home-mooring-bollard');
      const scale = skiff.scale.y;
      bollard.scale.y *= .65;
      skiff.scale.y *= .65;
      place.prepareMooringRender();
      const portraitGap = Math.max(eye(bollard).distanceTo(end(0)), eye(skiff).distanceTo(end(cord.count - 2)));
      bollard.scale.y = 1;
      skiff.scale.y = scale;
      place.prepareMooringRender();
      place.setMooringBattle(true);
      wave(2);
      const hiddenDuringWave = !skiff.visible && !rope.visible && !water.visible && pose().every((v, i) => v === changed[i]);
      place.setMooringBattle(false);
      still = true;
      wave(3, true);
      return {
        count: plants.length, grounded, plantsMove, frozen, hiddenDuringWave, stakeStable, portraitGap,
        boatLift: changed[1] - rest[1], boatTilt: changed[3], ropeTravel: moved.distanceTo(afloat),
        cleatGap: moved.distanceTo(cleat), ropeReset: end(cord.count - 2).distanceTo(afloat),
        reset: pose().every((v, i) => v === rest[i]),
        wakeInPlace: movingWake > 0 && water.visible && water.position.toArray().every((v, i) => v === waterline[i]),
        wakeReset: wake.value === 0,
        plantsReset: plants.every(mesh => mesh.material.userData.sway.uniform.value === 0),
      };
    } finally { place.dispose(); }
  });
  expect(result).toMatchObject({
    count: 23, grounded: true, plantsMove: true, frozen: true, hiddenDuringWave: true, reset: true, wakeInPlace: true,
    wakeReset: true, plantsReset: true,
  });
  expect(result.stakeStable).toBeLessThan(.000002);
  expect(result.cleatGap).toBeLessThan(.000002);
  expect(result.portraitGap).toBeLessThan(.000002);
  expect(result.ropeReset).toBeLessThan(.000002);
  expect(result.boatLift).toBeGreaterThan(.07);
  expect(result.boatTilt).toBeGreaterThan(.01);
  expect(result.ropeTravel).toBeGreaterThan(.05);
});
