// Real Three.js consumer checks: effects and visual picking share the new ground projection.
import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {projectGround} from '../src/world/projection.js';
import {createHarborLife} from '../src/world/ambient/harbor-life.js';
import {decorateHome} from '../src/world/places/home.js';
import {createSettlement} from '../src/world/places/settlement.js';
import {places} from '../src/world/places/registry.js';
import {anchors, cameraAnchors, createLighthouse} from '../src/world/lighthouse.js';
import {createDemoObjects} from '../src/class-demo/world-objects.js';
import {createTutorialHooks} from '../src/tutorial/game-hooks.js';
import {decorateProgress} from '../src/island/decorations.js';
import {layout} from '../src/config.js';

afterEach(() => vi.unstubAllGlobals());
const material = () => new THREE.MeshBasicMaterial({map: new THREE.Texture()});
const at = (mesh, base, dx = 0, dy = 0) => {
  expect(mesh.position.x).toBeCloseTo(base.x + dx);
  expect(mesh.position.y).toBeCloseTo(base.y + dy);
};

function home() {
  let listener, reduced = false;
  const events = [], cleanups = [], canvas = new EventTarget();
  canvas.getBoundingClientRect = () => ({left: 20, top: 30, width: 1280, height: 720});
  const camera = new THREE.OrthographicCamera(-25, 25, 15, -15, .1, 200);
  camera.position.set(2, -1, 100); camera.zoom = 1.25;
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const place = {id: 'home_islet', group: new THREE.Group(), colliders: [], update() {}};
  const ids = ['build-plot', 'islet-locked-sign', 'islet-empty-plot', 'cabin', 'workshop',
    'windmill', 'greenhouse', 'islet-signal-station', 'islet-signal-station-lit'];
  decorateHome(place, Object.fromEntries(ids.map(id => [id, material()])), cleanups, {
    canvas, camera, isActive: () => true, emit: event => events.push(event), on: () => () => {},
    reducedMotion: () => reduced,
    isletState: {getBuilt: () => ['plot_1'], subscribe(fn) { listener = fn; return () => {}; }},
  });
  return {place, events, setBuilt: ids => listener(ids), setReduced: value => { reduced = value; }, cleanups,
    tap(x, y) {
      const p = new THREE.Vector3(x, y, 0).project(camera), rect = canvas.getBoundingClientRect();
      for (const type of ['pointerdown', 'pointerup']) {
        const event = new Event(type);
        Object.assign(event, {button: 0, clientX: rect.left + (p.x + 1) * rect.width / 2,
          clientY: rect.top + (1 - p.y) * rect.height / 2});
        canvas.dispatchEvent(event);
      }
    }};
}

describe('projected world anchors', () => {
  it('keeps upright cabin and greenhouse effects attached during pooled animation', () => {
    const group = new THREE.Group(), cabin = projectGround(-8, 6), greenhouse = projectGround(7, -7);
    const life = createHarborLife({place: {id: 'home_islet', group}, ctx: {
      reducedMotion: false, isletState: {getBuilt: () => ['plot_1', 'plot_4']},
    }});
    const find = id => group.children.find(mesh => mesh.userData.ambientLife === id);
    at(find('cabin-smoke'), cabin, -.15, 5.1); at(find('cabin-window'), cabin, .55, 1.85);
    at(find('greenhouse-birds'), greenhouse, 0, 4.55);
    const geometry = find('cabin-smoke').geometry;
    life.update(.5, {night: 1}); at(find('cabin-smoke'), cabin, -.15, 5.21);
    at(find('greenhouse-birds'), greenhouse, Math.sin(.35) * .18, 4.55);
    expect(find('cabin-smoke').geometry).toBe(geometry); life.dispose();
  });

  it('uses a complete projected gull base while reduced motion holds the flock still', () => {
    const group = new THREE.Group(), base = projectGround(-1.5, 16.5);
    const life = createHarborLife({place: {id: 'saltreach_harbor', group}, ctx: {reducedMotion: true}});
    at(group.children[0], base); life.update(1, {weather: {fog: 0}}); at(group.children[0], base); life.dispose();
  });

  it('picks the upright cabin at its visual left and upper edges after camera pan and zoom', () => {
    const f = home(), base = projectGround(-8, 6);
    const before = f.place.colliders.map(row => ({...row}));
    f.tap(base.x - 4.4, base.y + 3); f.tap(base.x, base.y + 5);
    expect(f.events).toEqual([{type: 'plot_clicked', plot: 'plot_1'}, {type: 'plot_clicked', plot: 'plot_1'}]);
    f.tap(base.x - 4.6, base.y + 3); expect(f.events).toHaveLength(2);
    expect(f.place.colliders).toEqual(before); f.cleanups.forEach(fn => fn());
  });

  it('restores build dust to the projected foot when reduced motion interrupts a raise', () => {
    const f = home(), base = projectGround(7, 6);
    f.setBuilt(['plot_1', 'plot_2']);
    const cloud = f.place.group.children.find(mesh => mesh.isPoints && mesh.visible);
    at(cloud, base, 0, 2); f.place.update(.1, {});
    at(cloud, base, 0, 2.25); f.setReduced(true); f.place.update(.1, {});
    at(cloud, base, 0, 2); expect(cloud.visible).toBe(false); f.cleanups.forEach(fn => fn());
  });

  it('positions beacon origins from actual building feet while leaving logical zones untouched', () => {
    for (const [id, x, z, lift] of [['saltreach_harbor', 9, 9, 4.8125], ['home_islet', 0, -14, 6.1875], ['the_teeth', -5, -5, 4.9]]) {
      const base = projectGround(x, z), origin = places[id].lights[0].beamOrigin;
      expect(origin).toEqual({x: base.x, y: base.y + lift, z: 0});
    }
    expect(places.home_islet.zones.find(zone => zone.id === 'islet_signal_station')).toMatchObject({x: 0, z: -12});
    expect(places.saltreach_harbor.spawn).toEqual([0, 19]);
  });

  it('attaches lighthouse camera and beam X to the projected tower without altering story anchors', () => {
    const group = new THREE.Group(), base = projectGround(layout.lighthouse.x, layout.lighthouse.z + 2.6);
    expect(cameraAnchors.lamp_room).toEqual({x: base.x, y: base.y + 8.61, z: 100});
    const tower = createLighthouse(group, {lighthouse: material()});
    const beam = group.children.find(mesh => mesh.material?.uniforms?.uOrigin);
    at(beam, base, 0, 8.61);
    expect(tower.collider).toEqual({...layout.lighthouse, radius: 2.25});
    expect(anchors.lamp_room).toMatchObject(layout.lighthouse);
  });

  it('keeps the harbor flag upright and its cloth offset fixed relative to the projected pole', async () => {
    const place = await createSettlement({id: 'saltreach_harbor', loadArt: async ids => Object.fromEntries(ids.map(id => [id, material()])), loadBackdrop: async () => new THREE.Texture()});
    const flag = place.group.getObjectByName('storm-warning-flag'), base = projectGround(17, 13);
    at(flag.children[0], base, 0, 1.5); at(flag.children[1], base, .5625, 2.625);
    expect(flag.children[1].geometry.parameters.width).toBe(1); place.dispose();
  });

  it('reuses the registry harbor beacon anchor for class-demo celebration artwork', () => {
    vi.stubGlobal('document', {createElement: () => ({width: 0, height: 0, getContext: () => ({fillRect() {}})})});
    const scene = new THREE.Scene(), objects = createDemoObjects({scene, lampSpots: [], lock: false});
    const beacon = scene.children[0].children.find(mesh => mesh.material.map.image.width === 96);
    at(beacon, projectGround(9, 9), 0, 4.8125);
    at(beacon, places.saltreach_harbor.lights[0].beamOrigin);
    expect(beacon.geometry.parameters.width).toBe(6); objects.dispose();
  });

  it('locates tutorial targets at projected feet plus an undistorted upright lift', () => {
    const point = {x: 7, z: -7, lift: 2}, base = projectGround(point.x, point.z);
    const camera = new THREE.OrthographicCamera(-25, 25, 15, -15, .1, 200);
    camera.position.set(2, -1, 100); camera.zoom = 1.25; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const rect = {left: 20, top: 30, width: 1280, height: 720};
    const hooks = createTutorialHooks({island: () => ({anchor: () => point}), camera, canvas: {getBoundingClientRect: () => rect}, container: null});
    const p = new THREE.Vector3(base.x, base.y + point.lift * .45, 0).project(camera), target = hooks.locate('cannon');
    expect(target.x).toBeCloseTo(rect.left + (p.x + 1) * rect.width / 2);
    expect(target.y).toBeCloseTo(rect.top + (1 - p.y) * rect.height / 2);
    expect(hooks.anchor('cannon')).toEqual({x: 7, z: -7});
  });

  it('keeps milestone artwork anchored without changing its painter depth', () => {
    const place = {group: new THREE.Group()}, progress = decorateProgress(place);
    const flag = place.group.getObjectByName('island-best-wave');
    at(flag, projectGround(-3.5, 2.5)); expect(flag.renderOrder).toBe(102.5);
    at(place.group.getObjectByName('island-wave-25'), projectGround(4, 5.5)); progress.dispose();
  });
});
