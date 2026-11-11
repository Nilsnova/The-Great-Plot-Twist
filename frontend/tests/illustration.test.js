// The map's logical movement stays separate from its flat illustrated projection.
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { projectPoint, artSizes } from '../src/world/art.js';
import { createCharacter } from '../src/player/character.js';
import { createController } from '../src/player/controller.js';
import { createCamera } from '../src/player/camera.js';
import { cameraAnchors } from '../src/world/lighthouse.js';

describe('illustrated world contracts', () => {
  it('projects world X/Z consistently and never uses terrain elevation', () => {
    expect(projectPoint(3, 10).x).toBe(3);
    expect(projectPoint(3, 10).y).toBeCloseTo(-7.2);
    const art = Object.fromEntries(Object.keys(artSizes).map(name => [name, new THREE.MeshBasicMaterial()]));
    const character = createCharacter(art);
    character.group.position.set(3, 2, 10); character.animate(0, 0);
    const before = character.sprite.position.clone();
    character.group.position.y = 30; character.animate(0, 0);
    expect(character.sprite.position.equals(before)).toBe(true);
    expect(character.sprite.position.z).toBe(0);
  });
  it('moves W toward north and D toward east at the same diagonal speed', () => {
    const character = { group: new THREE.Object3D(), face: vi.fn(), animate: vi.fn() };
    let forward = 1, right = 0;
    const input = { held: new Set(), axis: keys => keys.includes('KeyW') ? forward : right };
    const controller = createController(character, input, []);
    const start = controller.player.position.clone(); controller.update(0.1, true);
    expect(controller.player.position.x).toBeCloseTo(start.x);
    expect(controller.player.position.z).toBeLessThan(start.z);
    const straight = Math.hypot(controller.player.position.x - start.x, controller.player.position.z - start.z);
    controller.player.position.copy(start); right = 1; controller.update(0.1, true);
    expect(controller.player.position.x).toBeGreaterThan(start.x);
    expect(Math.hypot(controller.player.position.x - start.x, controller.player.position.z - start.z)).toBeCloseTo(straight);
    controller.player.position.copy(start); forward = 0; controller.update(0.1, false);
    expect(controller.player.position.equals(start)).toBe(true);
  });
  it('keeps a fixed orthographic orientation while following and zooming', () => {
    const input = { pointer: { x: 200, y: 100, wheel: -1000 } };
    const view = createCamera(input), before = view.camera.quaternion.clone();
    view.camera.userData.pixelScale = 2; // the renderer sets this; zoom then takes whole device-pixel steps
    view.start(true); view.update(0.1, { x: 1, z: 4 });
    expect(view.camera.isOrthographicCamera).toBe(true);
    expect(view.camera.quaternion.equals(before)).toBe(true);
    expect(view.camera.zoom).toBeGreaterThan(1);
  });
  it('provides camera anchors for the drawn tower as well as its logical story positions', () => {
    expect(cameraAnchors.stairwell.z).toBe(100);
    expect(cameraAnchors.lamp_room.y).toBeGreaterThan(cameraAnchors.stairwell.y + 5);
    expect(cameraAnchors.lamp_room.x).toBe(cameraAnchors.stairwell.x);
  });
});
