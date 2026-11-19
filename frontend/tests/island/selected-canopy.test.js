import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it('uses visible pixels and painter order, and invalidates a selection when home trees grow', async () => {
  const result = await browser(async () => {
    const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
    const {makeSelectedCanopy} = await window.g20Import('/src/world/places/selected-canopy.js');
    function sprite(order, fill) {
      const canvas = Object.assign(document.createElement('canvas'), {width: 64, height: 64});
      canvas.getContext('2d').fillRect(...fill);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4),
        new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(canvas), transparent: true}));
      mesh.renderOrder = order;
      return mesh;
    }
    const building = sprite(100, [0, 0, 32, 64]).translateX(.25);
    const foreground = sprite(101, [0, 0, 64, 64]);
    const background = sprite(99, [0, 0, 64, 64]);
    const clearHalf = sprite(101, [40, 0, 24, 64]);
    const growing = sprite(101, [0, 0, 64, 64]).translateX(-4);
    const distant = sprite(101, [0, 0, 64, 64]).translateX(20);
    const trees = [foreground, background, clearHalf, growing, distant];
    const canopy = makeSelectedCanopy(trees);
    const matched = () => trees.map(mesh => canopy.has(mesh));
    const materials = [building, ...trees].map(({material}) => material);
    try {
      canopy.show(building);
      const first = matched(), unchanged = canopy.show(building);
      for (const mesh of trees) mesh.scale.setScalar(1.5);
      const changed = canopy.show(building), grown = matched();
      canopy.show(null);
      return {first, unchanged, changed, grown, closed: matched(), sameMaterials: [building, ...trees].every((mesh, i) => mesh.material === materials[i])};
    } finally {
      for (const mesh of [building, ...trees]) {
        mesh.geometry.dispose(); mesh.material.map.dispose(); mesh.material.dispose();
      }
    }
  });
  expect(result).toEqual({
    first: [true, false, false, false, false],
    unchanged: false,
    changed: true,
    grown: [true, false, false, true, false],
    closed: [false, false, false, false, false],
    sameMaterials: true,
  });
});

it('reveals the real Cannon #1 beneath its coastal tree and restores the tree on selection exits', async () => {
  const result = await browser(async () => {
    const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
    const {createSettlement} = await window.g20Import('/src/world/places/settlement.js');
    const {decorateIsland} = await window.g20Import('/src/island/world.js');
    const spots = [
      {id: 'cannon_1', kind: 'cannon', level: 5, spec: 'heavy', built: true},
      {id: 'house_1', kind: 'house', level: 3, built: true},
      {id: 'house_2', kind: 'house', level: 3, built: true},
      {id: 'wall_1', kind: 'wall', level: 1, built: true},
    ];
    const cannon = {spotId: 'cannon_1', kind: 'cannon', size: 3, level: 5, x: -12.5, z: -14.5};
    let island, selection = cannon;
    const place = await createSettlement({id: 'home_islet', loadBackdrop: async () => new THREE.Texture(), reducedMotion: true,
      decorate(place, art, cleanups) {
        island = decorateIsland(place, {art, selection: () => selection, reducedMotion: true});
        cleanups.push(() => island.dispose());
      }});
    const trees = place.group.children.filter(mesh => ['oak', 'pine', 'birch'].includes(mesh.userData.asset));
    const snapshots = trees.map(mesh => ({mesh, material: mesh.material, geometry: mesh.geometry, position: mesh.position.clone(), order: mesh.renderOrder}));
    const terrainColliders = JSON.stringify(place.colliders.filter(collider => !collider.islandBuilding));
    const player = {x: 0, z: 12};
    function draw(at = player) {
      place.update(1 / 60, {time: 0, player: at, night: 0, weather: {wind: 0}});
      island.update(1 / 60);
    }
    const faded = () => trees.filter(mesh => mesh.material.opacity === .24).map(mesh => mesh.userData.ground);
    try {
      await island.retryArt();
      island.apply({spots});
      const colliders = JSON.stringify(place.colliders);
      draw();
      const selected = faded();
      draw();
      const stillSelected = faded();
      selection = null;
      draw({x: -13, z: -13});
      const captainOpacity = trees[2].material.opacity;
      selection = cannon;
      draw();
      island.preview({...cannon, ok: true});
      const moving = faded();
      island.preview(null);
      draw();
      island.apply({spots, visitor: true});
      draw();
      const visiting = faded();
      island.apply({spots});
      draw();
      island.apply({spots, battle: true});
      draw();
      const battling = faded();
      island.apply({spots});
      selection = {spotId: 'wall_1', kind: 'wall', level: 1, x: -18.5, z: -1};
      draw();
      const wall = faded();
      selection = cannon;
      draw();
      const sameColliders = JSON.stringify(place.colliders) === colliders;
      island.dispose();
      return {selected, stillSelected, captainOpacity, moving, visiting, battling, wall, disposed: faded(), sameColliders,
        restoredTerrainColliders: JSON.stringify(place.colliders) === terrainColliders,
        sameTreeResources: snapshots.every(({mesh, material, geometry, position, order}) =>
          mesh.material === material && mesh.geometry === geometry && mesh.position.equals(position) && mesh.renderOrder === order)};
    } finally { place.dispose(); }
  });
  expect(result).toEqual({
    selected: [{x: -13, z: -12}],
    stillSelected: [{x: -13, z: -12}],
    captainOpacity: .3,
    moving: [], visiting: [], battling: [], wall: [], disposed: [],
    sameColliders: true, restoredTerrainColliders: true, sameTreeResources: true,
  });
});

it('reveals only the foreground oak covering a confirmed wall on a legal Move cell', async () => {
  const result = await browser(async () => {
    const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
    const {createSettlement} = await window.g20Import('/src/world/places/settlement.js');
    const {decorateIsland} = await window.g20Import('/src/island/world.js');
    const {checkMove, positionsOf} = await window.g20Import('/src/island/placement.js');
    const wall = {id: 'wall_1', kind: 'wall', built: true, level: 3};
    const x = 16.5, z = -.5, moved = {...wall, x, z};
    const anchor = {spotId: wall.id, kind: wall.kind, level: wall.level, x, z, size: 2};
    let island, selection = null;
    const place = await createSettlement({id: 'home_islet', loadBackdrop: async () => new THREE.Texture(), reducedMotion: true,
      decorate(place, art, cleanups) {
        island = decorateIsland(place, {art, selection: () => selection, reducedMotion: true});
        cleanups.push(() => island.dispose());
      }});
    const trees = place.group.children.filter(mesh => ['oak', 'pine', 'birch'].includes(mesh.userData.asset));
    const blockingOak = trees.find(mesh => mesh.userData.ground.x === 16 && mesh.userData.ground.z === 2);
    const originalMaterial = blockingOak.material, player = {x: 0, z: 12};
    const draw = () => {
      place.update(1 / 60, {time: 0, player, night: 0, weather: {wind: 0}});
      island.update(1 / 60);
    };
    const faded = () => trees.filter(mesh => mesh.material.opacity === .24).map(mesh => mesh.userData.ground);
    try {
      await island.retryArt();
      const legal = checkMove(wall.id, x, z, positionsOf([wall])).ok;
      island.apply({spots: [moved]});
      draw();
      const walls = island.root.getObjectByName('island-wall-connections');
      const unselected = faded(), orders = walls.children.map(mesh => mesh.renderOrder);
      const colliders = JSON.stringify(place.colliders);
      selection = anchor;
      draw();
      const selected = faded(), selectedOrders = walls.children.map(mesh => mesh.renderOrder);
      const post = walls.getObjectByName('wall-art-layer:99.5');
      const geometry = post.geometry;
      draw();
      const resourcesReused = post.geometry === geometry && blockingOak.material === originalMaterial;
      island.preview({...anchor, ok: true});
      const moving = faded();
      island.preview(null);
      draw();
      selection = null;
      draw();
      const closed = faded(), restoredOpacity = blockingOak.material.opacity;
      selection = anchor;
      draw();
      island.apply({spots: [moved], visitor: true});
      draw();
      const visitor = faded();
      island.apply({spots: [moved], battle: true});
      draw();
      const battle = faded();
      island.apply({spots: [{...moved, built: false}]});
      draw();
      const removed = faded();
      return {legal, unselected, selected, moving, closed, visitor, battle, removed, restoredOpacity, resourcesReused,
        collidersUnchanged: JSON.stringify(place.colliders) === colliders, orders, selectedOrders, treeOrder: blockingOak.renderOrder};
    } finally { place.dispose(); }
  });
  expect(result).toEqual({
    legal: true, unselected: [], selected: [{x: 16, z: 2}], moving: [], closed: [], visitor: [], battle: [],
    removed: [], restoredOpacity: 1, resourcesReused: true, collidersUnchanged: true,
    orders: [99.5], selectedOrders: [99.5], treeOrder: 102,
  });
});
