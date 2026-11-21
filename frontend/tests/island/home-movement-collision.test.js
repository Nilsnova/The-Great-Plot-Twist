import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const evaluate = browserHarness();

it('blocks confirmed Home houses and the watchtower while keeping original passage points open', async () => {
  const result = await evaluate(async () => {
    const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
    const {decorateIsland} = await window.g20Import('/src/island/world.js');
    const {ARSENAL, BELL, CABIN, campaignBuilding, placedSpot} = await window.g20Import('/src/island/spots.js');
    const {HEART} = await window.g20Import('/src/island/placement.js');
    const {canStand, moveWithCollisions} = await window.g20Import('/src/player/collision.js');
    const {planTapPath} = await window.g20Import('/src/controls/tap-path.js');
    const {campaignOf} = await window.g20Import('/src/campaign/index.js');

    const groundAt = () => 1.03;
    const tree = {x: 13, z: 14, radius: .48};
    const colliders = [tree];
    const place = {id: 'home_islet', group: new THREE.Group(), colliders, zones: [], groundHeight: groundAt};
    const canWalk = (x, z) => canStand(x, z, colliders, groundAt);
    const canWalkAt = ({x, z}) => canWalk(x, z - .5);
    const drawing = decorateIsland(place, {art: {cabin: new THREE.MeshBasicMaterial()},
      loadArt: async names => Object.fromEntries(names.map(id => [id, new THREE.MeshBasicMaterial()]))});

    try {
      const house = {id: 'house_1', kind: 'house', level: 1, built: true};
      const emptyHouse = {id: 'house_2', kind: 'house', built: false};
      const tower = {id: 'tower_1', kind: 'watchtower', level: 1, built: true};
      const home = placedSpot(house.id), watch = placedSpot(tower.id);
      const preview = {spotId: house.id, x: 5, z: -9, size: 3, ok: true};
      const moved = {...house, x: 11, z: -6};
      const initial = [canWalkAt(home), canWalkAt(watch)];
      const staticColliders = [...colliders];

      drawing.apply({spots: [house, emptyHouse, tower]});
      const confirmed = [canWalkAt(home), canWalkAt(watch), canWalkAt(placedSpot(emptyHouse.id))];
      const landmarks = [canWalk(CABIN.x, CABIN.z - 1.8), canWalk(HEART.x, HEART.z),
        canWalk(BELL.x, BELL.z), canWalk(tree.x, tree.z)];
      const start = {x: home.x - 4, z: home.z - .5}, end = {x: home.x + 4, z: start.z};
      const stopped = moveWithCollisions(start, end.x - start.x, 0, colliders, groundAt);
      const path = planTapPath({x: start.x, y: start.z}, {x: end.x, y: end.z}, {canStand: canWalk});

      drawing.preview(preview);
      const whilePreviewing = [canWalkAt(home), canWalkAt(preview)];
      // A shared island can refresh positions while the local preview is still open.
      drawing.apply({spots: [moved, emptyHouse, tower], visitor: true});
      const whileRefreshing = [canWalkAt(home), canWalkAt(preview), canWalkAt(moved), canWalkAt(watch)];
      drawing.preview(null);
      drawing.apply({spots: [moved, emptyHouse, tower], visitor: true, battle: true});
      const duringWave = [canWalkAt(home), canWalkAt(preview), canWalkAt(moved), canWalkAt(watch)];

      const campaignLandmarks = ['island_harbor', 'island_techhub', 'island_wreck'].map(campaignBuilding);
      const checkCampaignBuildings = () => [...campaignLandmarks, ARSENAL].map(canWalkAt);
      drawing.apply({spots: [moved, emptyHouse, tower], campaign: campaignOf({waveBest: 0})});
      const closedLandmarks = checkCampaignBuildings();
      drawing.apply({spots: [moved, emptyHouse, tower], campaign: campaignOf({waveBest: 12}), arsenal: true});
      const openLandmarks = checkCampaignBuildings();
      const retainedTree = colliders.includes(tree);
      drawing.dispose();
      return {initial, confirmed, landmarks, stoppedBeforeHouse: stopped.x < home.x,
        walksAroundHouse: path?.at(-1)?.x === end.x && path.some(point => point.y !== start.z),
        whilePreviewing, whileRefreshing, duringWave, closedLandmarks, openLandmarks, retainedTree,
        sharedArray: place.colliders === colliders, restoredStatic: colliders.length === staticColliders.length
          && staticColliders.every((collider, index) => colliders[index] === collider)};
    } finally { drawing.dispose(); }
  });
  expect(result).toEqual({
    initial: [true, true],
    confirmed: [false, false, true],
    landmarks: [false, true, true, false],
    stoppedBeforeHouse: true,
    walksAroundHouse: true,
    whilePreviewing: [false, true],
    whileRefreshing: [true, true, false, false],
    duringWave: [true, true, false, false],
    closedLandmarks: [true, true, true, true],
    openLandmarks: [false, false, true, false],
    sharedArray: true,
    retainedTree: true,
    restoredStatic: true,
  });
});

it('keeps the existing Pirate Point movement collision data when its defenses are built', async () => {
  expect(await evaluate(async () => {
    const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
    const {decorateIsland} = await window.g20Import('/src/island/world.js');
    const {POINT_PLACE, PP_SPOTS, pointZones} = await window.g20Import('/src/island/spots.js');
    const tree = {x: 3, z: 4, radius: .48};
    const colliders = [tree];
    const place = {id: POINT_PLACE, group: new THREE.Group(), colliders, zones: []};
    const drawing = decorateIsland(place, {
      layout: {spots: PP_SPOTS, zones: pointZones, cabin: false, bell: false},
      loadArt: async names => Object.fromEntries(names.map(id => [id, new THREE.MeshBasicMaterial()])),
    });
    try {
      drawing.apply({spots: [{id: 'pp_wall_1', kind: 'wall', level: 1, built: true},
        {id: 'pp_tower_1', kind: 'cannon', level: 1, built: true}]});
      return place.colliders === colliders && colliders.length === 1 && colliders[0] === tree;
    } finally { drawing.dispose(); }
  })).toBe(true);
});
