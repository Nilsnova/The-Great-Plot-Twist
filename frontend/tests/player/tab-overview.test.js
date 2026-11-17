// Hold Tab: the camera shows the whole island for a moment, also during a wave; letting go eases back.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createCamera} from '../../src/player/camera.js';
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
