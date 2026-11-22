// Playtest 22 Nov: on loading the game the built cannons showed the old flat cartoon for a moment before the
// new art. The drawn stand-ins now wait: a normal load never shows them; a slow or failed load still does.
import {afterEach, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {decorateIsland, STANDIN_DELAY_MS} from '../../src/island/world.js';
// The same light stubs as wall-selection.test.js: no canvas painting, the island's logic only.
vi.mock('../../src/art/textures.js', async () => {
  const THREE = await import('three');
  return {frameCanvas: () => ({}), smoothTexture: () => new THREE.Texture(),
    spriteMaterial: map => new THREE.MeshBasicMaterial({map, transparent: true, depthTest: false, depthWrite: false})};
});
vi.mock('../../src/island/decorations.js', () => ({decorateProgress: () => ({apply() {}, dispose() {}})}));
vi.mock('../../src/island/structure-recovery-indicators.js', () => ({createStructureRecoveryIndicators: () => ({setState() {}, update() {}, dispose() {}})}));
vi.mock('../../src/art/wall-atlas.js', () => ({loadWallAtlas: () => new Promise(() => {}), wallPreviewCanvas: () => ({})}));

afterEach(() => { vi.useRealTimers(); });
const built = {spots: [{id: 'cannon_1', kind: 'cannon', built: true, level: 1}]};
const prepared = ids => Object.fromEntries(ids.map(id => [id, new THREE.MeshBasicMaterial({map: new THREE.Texture()})]));
function island(loadArt) {
  const place = {group: new THREE.Group(), colliders: [], zones: []};
  const drawing = decorateIsland(place, {loadArt, loadWallAtlas: () => new Promise(() => {})});
  drawing.apply(built);
  const standin = () => drawing.root.getObjectByName('island-cannon:cannon_1');
  return {drawing, standin};
}

it('a normal load goes straight to the new cannon art, never the old stand-in', async () => {
  vi.useFakeTimers();
  let finish; const art = new Promise(resolve => { finish = resolve; });
  const {drawing, standin} = island(ids => art.then(() => prepared(ids)));
  const old = standin();
  expect(old.visible).toBe(false);                        // loading: the spot waits
  await vi.advanceTimersByTimeAsync(STANDIN_DELAY_MS / 2);
  expect(old.visible).toBe(false);
  finish(); await vi.advanceTimersByTimeAsync(0);
  expect(old.parent).toBeNull();                          // the stand-in is retired unseen
  const real = standin();                                 // the new art took the name
  expect(real).not.toBe(old); expect(real.visible).toBe(true);
  await vi.advanceTimersByTimeAsync(STANDIN_DELAY_MS);    // the timer no longer brings anything back
  expect(old.parent).toBeNull();
  drawing.dispose();
});

it('a slow load shows the stand-in after the wait, so the island never looks unbuilt for long', async () => {
  vi.useFakeTimers();
  const {drawing, standin} = island(() => new Promise(() => {}));
  await vi.advanceTimersByTimeAsync(STANDIN_DELAY_MS - 1);
  expect(standin().visible).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(standin().visible).toBe(true);
  drawing.dispose();
});

it('a failed load shows the stand-in at once', async () => {
  vi.useFakeTimers();
  const {drawing, standin} = island(() => Promise.reject(new Error('offline')));
  await vi.advanceTimersByTimeAsync(0);
  expect(standin().visible).toBe(true);
  drawing.dispose();
});
