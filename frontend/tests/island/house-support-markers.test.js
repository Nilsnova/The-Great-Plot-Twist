import * as THREE from 'three';
import {expect, it, vi} from 'vitest';
import {makeHouseSupportMarkers} from '../../src/island/world.js';

it('shows only the current or legal proposed support area, reuses markers, and clears on cancel', () => {
  const root = new THREE.Group();
  const markers = makeHouseSupportMarkers(root);
  const layer = root.getObjectByName('island-house-support');
  const at = (x, id) => ({areas: [{x, z: 4, radius: 10}], beneficiaries: [{id, kind: 'wall', x, z: 8}]});
  const current = {role: 'workshop', current: at(4, 'wall_1'), proposed: null};

  markers.show(current);
  const ring = layer.getObjectByName('island-range');
  const marker = layer.getObjectByName('house-support-target');
  const disposed = vi.spyOn(ring.geometry, 'dispose');
  expect(layer.userData.position).toBe('current');
  expect(ring.userData.range.x).toBe(4);
  expect(marker.userData.spotId).toBe('wall_1');

  markers.show({...current, proposed: at(9, 'wall_2')});
  expect(layer.userData.position).toBe('proposed');
  expect(layer.getObjectByName('island-range')).toBe(ring);
  expect(layer.getObjectByName('house-support-target')).toBe(marker);
  expect(ring.userData.range.x).toBe(9);
  expect(marker.userData.spotId).toBe('wall_2');

  markers.show(current);
  expect(marker.userData.spotId).toBe('wall_1');
  markers.show(null);
  expect(layer.visible).toBe(false);
  expect(layer.userData.position).toBeNull();
  expect(marker.visible).toBe(false);
  markers.dispose();
  expect(root.getObjectByName('island-house-support')).toBeUndefined();
  expect(disposed).toHaveBeenCalledOnce();
});
