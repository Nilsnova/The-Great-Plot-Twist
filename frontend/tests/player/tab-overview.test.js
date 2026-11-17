// Hold Tab: the camera shows the whole island for a moment, also during a wave; letting go eases back.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createCamera, villageFrame} from '../../src/player/camera.js';
import {createInput} from '../../src/core/input.js';
import {worldViewport} from '../../src/pixel/display.js';
import {projectPoint} from '../../src/world/art.js';

const player = {x: 12, z: -8};
function viewAt() {
  const input = {pointer: {wheel: 0}, held: new Set()}, view = createCamera(input);
  Object.assign(view.camera, worldViewport(1280, 720, 22, 16));
  view.camera.updateProjectionMatrix(); view.setPlace('home_islet', player); view.start(true);
  return {view, input};
}

describe('hold Tab for the whole island', () => {
  it('zooms out to the island while Tab is held and back to the captain when it is let go', () => {
    const {view, input} = viewAt();
    view.update(.05, player);
    const near = {x: view.camera.position.x, zoom: view.camera.zoom};
    input.held.add('Tab'); view.update(.05, player);
    expect(view.camera.zoom).toBeLessThan(near.zoom);
    expect(view.camera.position.x).toBe(0);
    input.held.delete('Tab'); view.update(.05, player);
    expect(view.camera.position.x).toBe(projectPoint(player.x, player.z).x);
    expect(view.camera.zoom).toBe(near.zoom);
  });

  it('also works during a wave, over the battle zoom', () => {
    const {view, input} = viewAt();
    view.camera.userData.battleZoom = .9; view.update(.05, player);
    input.held.add('Tab'); view.update(.05, player);
    expect(view.camera.zoom).toBeLessThan(.9);
    expect(view.camera.position.x).toBe(0);
  });

  it('does nothing away from the home island', () => {
    const {view, input} = viewAt();
    view.setPlace('lighthouse_isle', player); view.start(true);
    input.held.add('Tab'); view.update(.05, player);
    expect(view.camera.zoom).toBe(1);
  });
});

describe('Tab in the game view', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('keeps focus in the game on the canvas, but Shift+Tab and other targets still move focus', () => {
    const window = new EventTarget(), canvas = new EventTarget(), button = new EventTarget();
    vi.stubGlobal('window', window); vi.stubGlobal('HTMLElement', class {});
    const input = createInput(canvas);
    const press = (target, shiftKey = false) => {
      const event = Object.assign(new Event('keydown', {cancelable: true}), {code: 'Tab', shiftKey});
      Object.defineProperty(event, 'target', {value: target}); window.dispatchEvent(event); return event.defaultPrevented;
    };
    expect(press(canvas)).toBe(true);
    expect(input.held.has('Tab')).toBe(true);
    window.dispatchEvent(Object.assign(new Event('keyup'), {code: 'Tab'}));
    expect(input.held.has('Tab')).toBe(false);
    expect(press(canvas, true)).toBe(false);
    expect(press(button)).toBe(false);
    input.dispose();
  });
});


// Temporary overview must not consume or expose the persistent working-camera transform.
describe('Tab with a saved village working view', () => {
  it.each([[1280, 720], [375, 812]])('fits while held and restores the exact working view at %s×%s', (width, height) => {
    const {view, input} = viewAt(), viewport = {height, top: 100, bottom: 240};
    Object.assign(view.camera, worldViewport(width, height, 22, 16)); view.camera.updateProjectionMatrix();
    view.setVillageView(true, viewport); view.villageControl('in'); view.villageControl('in');
    view.panVillage(-120, 60, width, height); view.update(.05, player);
    const working = {zoom: view.camera.zoom, position: view.camera.position.clone()}, fit = villageFrame(view.camera, 'home_islet', viewport);
    expect(working.position.x).not.toBe(0); expect(working.zoom).toBeGreaterThan(fit.zoom);
    for (let repeat = 0; repeat < 2; repeat++) {
      input.held.add('Tab'); view.update(.05, player);
      expect(view.camera.position.x).toBe(fit.x); expect(view.camera.position.y).toBe(fit.y); expect(view.camera.zoom).toBe(fit.zoom);
      input.held.delete('Tab'); view.update(.05, player);
      expect(view.camera.position).toEqual(working.position); expect(view.camera.zoom).toBe(working.zoom);
    }
  });

  it('ignores saved village offsets after leaving and keeps ordinary battle Tab behavior', () => {
    const {view, input} = viewAt(); input.pointer.wheel = -400; view.update(.05, player); input.pointer.wheel = 0;
    view.setVillageView(true); view.villageControl('in'); view.panVillage(-120, 60, 1280, 720); view.update(.05, player);
    view.setVillageView(false); view.camera.userData.battleZoom = .9; view.update(.05, player);
    const fit = villageFrame(view.camera, 'home_islet'); input.held.add('Tab'); view.update(.05, player);
    expect(view.camera.position.x).toBe(fit.x); expect(view.camera.position.y).toBe(fit.y); expect(view.camera.zoom).toBe(fit.zoom);
    input.held.delete('Tab'); view.update(.05, player); expect(view.camera.zoom).toBe(.9); expect(view.camera.position.x).toBe(player.x);
    delete view.camera.userData.battleZoom; view.update(.05, player); expect(view.camera.zoom).toBe(1.4);
  });

  it('keeps guided-tour priority and resumes the unchanged working view after Tab release', () => {
    const {view, input} = viewAt(); view.setVillageView(true); view.villageControl('in'); view.panVillage(-120, 60, 1280, 720); view.update(.05, player);
    const working = {zoom: view.camera.zoom, position: view.camera.position.clone()};
    input.held.add('Tab'); view.camera.userData.tour = {x: -7, z: 4}; view.update(.05, player);
    expect(view.camera.position.x).toBeCloseTo(-7, 12);
    delete view.camera.userData.tour; view.update(.05, player); expect(view.camera.position.x).toBe(0);
    input.held.delete('Tab'); view.update(.05, player); expect(view.camera.position).toEqual(working.position); expect(view.camera.zoom).toBe(working.zoom);
  });
});
