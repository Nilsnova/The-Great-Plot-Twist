// Real Canvas/Three.js lifecycle checks for T5, with no live server or account.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('refreshes the number on each recorded win and changes rank at the next ten', async () => {
  const result = await evaluate(async () => {
    const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const island = createIsland({container: document.body, mode: 'fake', transport: createFakeIslandTransport(), on, emit, storage: null});
    const cleanups = [], place = {group: new THREE.Group(), colliders: [], zones: [], update() {}};
    await island.load(); island.decorate(place, {}, cleanups);
    const badge = place.group.getObjectByName('island-best-wave'), seen = [];
    try {
      for (const wave of [21, 22, 29, 30]) {
        island.dev.setWaveBest(wave); // fake server records the new best before announcing the win
        emit({type: 'wave_finished', survived: true, coins: island.island.coins});
        for (let n = 0; n < 50 && badge.userData.wave !== wave; n++) await new Promise(resolve => setTimeout(resolve, 10));
        seen.push({wave: badge.userData.wave, rank: badge.userData.rank});
      }
      return seen;
    } finally { cleanups.forEach(stop => stop()); island.dispose(); }
  });
  expect(result).toEqual([{wave: 21, rank: 'silver'}, {wave: 22, rank: 'silver'},
    {wave: 29, rank: 'silver'}, {wave: 30, rank: 'gold'}]);
});

it('updates the viewed island, reuses unchanged art and releases its own resources once', async () => {
  const result = await evaluate(async () => {
    const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
    const {decorateProgress} = await window.g20Import('/src/island/decorations.js');
    const place = {group: new THREE.Group(), colliders: [{x: 1, z: 2, radius: .48}]};
    const tree = new THREE.Object3D(); tree.userData.asset = 'oak'; tree.scale.set(2, 2, 2); place.group.add(tree);
    const decor = decorateProgress(place), root = place.group.getObjectByName('island-progress');
    const flag = root.getObjectByName('island-best-wave'), statue = root.getObjectByName('island-wave-25');
    const house = id => ({id, kind: 'house', built: true});
    decor.apply({wave: 24}, [house('house_1')], true);
    const first = {wave: flag.userData.wave, statue: statue.visible, tree: tree.scale.x};
    const texture = flag.material.map; let replaced = 0;
    texture.addEventListener('dispose', () => replaced++);
    decor.apply({wave: 24}, [house('house_1')], true);
    const reused = flag.material.map === texture;
    decor.apply({wave: 25}, [house('house_1'), house('house_2')], true);
    const milestone = {wave: flag.userData.wave, statue: statue.visible, tree: tree.scale.x};
    let freed = 0;
    for (const mesh of [flag, statue]) for (const resource of [mesh.geometry, mesh.material, mesh.material.map])
      resource.addEventListener('dispose', () => freed++);
    decor.apply({wave: 1}, [], true); // a different, new island, including house removal
    const fresh = {wave: flag.userData.wave, statue: statue.visible, tree: tree.scale.x};
    // The previous flag texture was released by that update; watch the current one at cleanup too.
    flag.material.map.addEventListener('dispose', () => freed++);
    decor.apply(null, [], false);
    const hidden = !flag.visible && !statue.visible;
    decor.dispose(); decor.dispose(); decor.apply({wave: 30}, [], true);
    return {first, reused, replaced, milestone, fresh, hidden, freed, restored: tree.scale.x,
      children: place.group.children.length, colliders: place.colliders};
  });
  expect(result).toEqual({first: {wave: 24, statue: false, tree: 2.2}, reused: true, replaced: 1,
    milestone: {wave: 25, statue: true, tree: 2.4}, fresh: {wave: 1, statue: false, tree: 2},
    hidden: true, freed: 7, restored: 2, children: 1, colliders: [{x: 1, z: 2, radius: .48}]});
});
