// Real pointer events use the same building zones as E; blocked input never opens a card.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it.each([
  ['far away', 6, 0, true, false, true],
  ['at the building', 0, 0, true, true, false],
  ['just inside reach', 2.199, 0, true, true, false],
  ['just outside reach', 2.201, 0, true, false, true],
  ['at a different height', 0, 2.5, true, false, true],
  ['behind an overlay', 0, 0, false, false, false],
  ['without a player position', null, 0, true, false, true],
])('a building click %s respects reach and input blocking', async (_name, offset, height, active, opens, warns) => {
  const result = await evaluate(async ({offset, height, active}) => {
    const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
    const {decorateIsland} = await window.g20Import('/src/island/world.js');
    const {SPOTS, islandZones} = await window.g20Import('/src/island/spots.js');
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:640px;height:480px'; document.body.append(canvas);
    const camera = new THREE.OrthographicCamera(-32, 32, 24, -24, 1, 50);
    camera.position.z = 10; camera.updateMatrixWorld();
    const spot = SPOTS.find(item => item.id === 'cannon_3');
    const zone = islandZones().find(item => item.id === spot.id);
    const player = offset === null ? null : {position: {x: zone.x + offset, y: zone.y + height, z: zone.z}};
    const picked = [], warnings = [];
    const place = {group: new THREE.Group(), colliders: [], zones: []};
    const drawing = decorateIsland(place, {canvas, camera, player, reducedMotion: true,
      isActive: () => active, onPick: id => picked.push(id), onTooFar: () => warnings.push('far')});
    const point = new THREE.Vector3(spot.x, -spot.z * .72, 0).project(camera);
    const box = canvas.getBoundingClientRect();
    const pointer = {button: 0, pointerId: 1, bubbles: true,
      clientX: box.left + (point.x + 1) * box.width / 2,
      clientY: box.top + (1 - point.y) * box.height / 2};
    canvas.dispatchEvent(new PointerEvent('pointerdown', pointer));
    canvas.dispatchEvent(new PointerEvent('pointerup', pointer));
    drawing.dispose();
    return {picked, warnings};
  }, {offset, height, active});
  expect(result.picked).toEqual(opens ? ['cannon_3'] : []);
  expect(result.warnings).toEqual(warns ? ['far'] : []);
});
