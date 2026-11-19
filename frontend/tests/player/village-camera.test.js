import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {createCamera, villageFrame} from '../../src/player/camera.js';
import {worldViewport} from '../../src/pixel/display.js';
import {projectPoint} from '../../src/world/art.js';
import {surfaceClass, surfaces} from '../../src/world/places/surfaces.js';
import {projectedCoastBounds,projectLegacyGround} from '../../src/world/projection.js';
import {cliffProfile} from '../../src/art/coast-cliffs.js';

const player = {x: 12, z: -8};
function viewAt(width = 1280, height = 720, reduced = true) {
  const input = {pointer: {wheel: 0}}, view = createCamera(input);
  Object.assign(view.camera, worldViewport(width, height, 22, 16));
  view.camera.updateProjectionMatrix(); view.setPlace('home_islet', player); view.start(reduced);
  return {view, input};
}
const onScreen = (camera, x, z, lift = 0) => {
  camera.updateMatrixWorld(); // The real renderer updates this before every draw.
  const p = projectPoint(x, z);
  return new THREE.Vector3(p.x, p.y + lift, 0).project(camera);
};

describe('village camera overview', () => {
  it.each([[1280, 720], [375, 812]])('fits actual land cells at %s × %s without moving the captain', (width, height) => {
    const {view} = viewAt(width, height), before = {...player};
    view.setVillageView(true); view.villageControl('fit'); view.update(.05, player);
    for (let x = -24; x <= 24; x++) for (let z = -26; z <= 26; z++) {
      if (!surfaceClass('home_islet', x, z)) continue;
      const point = onScreen(view.camera, x, z);
      expect(Math.abs(point.x)).toBeLessThan(.99);
      expect(Math.abs(point.y)).toBeLessThan(.99);
    }
    expect(onScreen(view.camera, 0, -14, 0).y).toBeLessThan(.99); // Actual interactive feet; ornamental crowns are not Fit bounds.
    expect(view.camera.zoom).toBeGreaterThan(0);
    expect(view.camera.zoom).toBeLessThan(1);
    expect(player).toEqual(before);
  });

  it('returns to the captain and previous exploration zoom, ignoring wheel input in fit view', () => {
    const {view, input} = viewAt();
    input.pointer.wheel = -500; view.update(.05, player); input.pointer.wheel = 0;
    const oldZoom = view.camera.zoom;
    view.setVillageView(true); view.villageControl('fit'); input.pointer.wheel = 900; view.update(.05, player);
    expect(view.camera.position.x).toBe(villageFrame(view.camera,'home_islet').x);
    input.pointer.wheel = 0; view.setVillageView(false); view.update(.05, player);
    expect(view.camera.position.x).toBe(projectPoint(player.x, player.z).x);
    expect(view.camera.zoom).toBe(oldZoom);
  });

  it.each([[1280,720,90,240],[375,812,180,310]])('keeps the island between real overlay insets at %s × %s', (width,height,top,bottom) => {
    const {view}=viewAt(width,height);
    view.setVillageView(true,{height,top,bottom});view.villageControl('fit');view.update(.05,player);
    for(let x=-24;x<=24;x++)for(let z=-26;z<=26;z++){
      if(!surfaceClass('home_islet',x,z))continue;
      const y=(1-onScreen(view.camera,x,z).y)*height/2;
      expect(y).toBeGreaterThan(top);expect(y).toBeLessThan(height-bottom);
    }
    expect((1-onScreen(view.camera,0,-14,0).y)*height/2).toBeGreaterThan(top);
  });

  it.each([[1280, 720], [375, 812], [320, 568]])('keeps the same art proportions in Fit and Work at %s × %s', (width, height) => {
    const {view} = viewAt(width, height);
    view.setVillageView(true, {width, height, top: 96, bottom: 156});
    for (const mode of ['fit', 'work']) {
      view.villageControl(mode);
      view.update(.05, player);
      const camera = view.camera;
      camera.updateMatrixWorld();
      const center = new THREE.Vector3(0, 0, 0).project(camera);
      const right = new THREE.Vector3(1, 0, 0).project(camera);
      const up = new THREE.Vector3(0, 1, 0).project(camera);
      expect((right.x - center.x) * width).toBeCloseTo((up.y - center.y) * height, 8);
    }
  });

  it('fits the canonical coastline above a real panel exceeding sixty percent of the phone', () => {
    const {view} = viewAt(375, 812), top = 180, bottom = 516;
    view.setVillageView(true, {height: 812, top, bottom}); view.villageControl('fit'); view.update(.05, player);
    for (const point of cliffProfile(surfaces.home_islet)) {
      const base=projectLegacyGround(point.x,-point.y-point.depth);view.camera.updateMatrixWorld();
      const corners=[onScreen(view.camera,point.x,point.z),new THREE.Vector3(base.x,base.y,0).project(view.camera)];
      for(const displayed of corners){const y=(1-displayed.y)*812/2;
        expect(y).toBeGreaterThan(top);expect(y).toBeLessThan(812-bottom);expect(Math.abs(displayed.x)).toBeLessThan(1);
      }
    }
  });

  it('declines an impossible fit, holds a finite view and recovers without consuming wheel input', () => {
    const {view, input} = viewAt(375, 812);
    view.setVillageView(true, {height: 812, top: 180, bottom: 340}); view.update(.05, player);
    const before = {position: view.camera.position.clone(), zoom: view.camera.zoom};
    const blocked = {height: 812, top: 300, bottom: 600};
    expect(villageFrame(view.camera, 'home_islet', blocked)).toBeNull();
    view.setVillageView(true, blocked); input.pointer.wheel = -500; view.update(.05, player);
    expect(view.camera.position).toEqual(before.position); expect(view.camera.zoom).toBe(before.zoom);
    view.setVillageView(true, {height: 812, top: 180, bottom: 340}); input.pointer.wheel = 0; view.update(.05, player);
    expect(view.camera.position).toEqual(before.position); expect(view.camera.zoom).toBe(before.zoom);
    view.setVillageView(false); view.update(.05, player); expect(view.camera.zoom).toBe(1);
  });

  it('keeps combat and guided-tour camera requests in control', () => {
    const {view} = viewAt(); view.setVillageView(true); view.villageControl('fit');
    view.camera.userData.battleZoom = .7; view.update(.05, player);
    expect(view.camera.zoom).toBe(.7);
    expect(view.camera.position.x).toBe(projectPoint(player.x,player.z).x);
    delete view.camera.userData.battleZoom;
    view.camera.userData.tour = {x: -7, z: 4}; view.update(.05, player);
    expect(view.camera.position.x).toBe(projectPoint(-7,4).x);
    expect(view.camera.userData.tour).toEqual({x: -7, z: 4});
    delete view.camera.userData.tour; view.update(.05, player);
    expect(view.camera.position.x).toBe(villageFrame(view.camera,'home_islet').x);
  });

  it('recalculates fit after resize and resets overview on travel', () => {
    const {view} = viewAt(); view.setVillageView(true); view.villageControl('fit'); view.update(.05, player);
    const wide = view.camera.zoom;
    Object.assign(view.camera, worldViewport(375, 812, 22, 16)); view.camera.updateProjectionMatrix(); view.update(.05, player);
    expect(view.camera.zoom).toBeLessThan(wide);
    view.setPlace('saltreach_harbor', player); view.update(.05, player);
    expect(view.camera.zoom).toBe(1);
    expect(view.camera.position.x).toBe(projectPoint(player.x,player.z).x);
    view.setVillageView(true); view.update(.05, player);
    expect(view.camera.position.x).toBe(projectPoint(player.x,player.z).x);
  });

  it('eases normally, snaps for reduced motion and leaves invalid or paused updates alone', () => {
    const {view} = viewAt(1280, 720, false); view.setVillageView(true); view.villageControl('fit');
    const start = view.camera.position.x; view.update(.05, player);
    expect(view.camera.position.x).toBeGreaterThan(0); expect(view.camera.position.x).toBeLessThan(start);
    for (let i = 0; i < 60; i++) view.update(.1, player);
    expect(view.camera.position.x).toBeCloseTo(villageFrame(view.camera,'home_islet').x, 5);
    const position = view.camera.position.clone(); view.update(NaN, player); view.pause(); view.update(.1, player);
    expect(view.camera.position).toEqual(position);
    expect(villageFrame({left: 0, right: NaN, top: 1, bottom: -1}, 'home_islet')).toBeNull();
    expect(villageFrame(view.camera, 'unknown')).toBeNull();
  });
});

describe('working village zoom and pan', () => {
  it.each([[1280,720],[375,812]])('zooms, pans within land bounds and returns to exact Fit at %s×%s', (width,height) => {
    const {view} = viewAt(width,height); view.setVillageView(true,{height,top:150,bottom:220}); view.villageControl('fit'); view.update(.05,player);
    const fit = {zoom: view.camera.zoom, position: view.camera.position.clone()};
    view.villageControl('in'); view.update(.05,player); expect(view.camera.zoom).toBeCloseTo(fit.zoom * 1.4);
    view.panVillage(-100000,100000,width,height); view.update(.05,player);
    const bounds=projectedCoastBounds(cliffProfile(surfaces.home_islet));
    expect(view.camera.position.x).toBe(bounds.maxX);expect(view.camera.position.y).toBeLessThan(bounds.maxY+1);
    for (let i = 0; i < 20; i++) view.villageControl('in');
    view.update(.05,player); expect(view.camera.zoom).toBe(2);
    view.villageControl('fit'); view.update(.05,player);
    expect(view.camera.zoom).toBe(fit.zoom); expect(view.camera.position).toEqual(fit.position);
    view.villageControl('out'); view.panVillage(300,200,width,height); view.update(.05,player);
    expect(view.camera.zoom).toBe(fit.zoom); expect(view.camera.position).toEqual(fit.position);
  });
  it('preserves exploration zoom, safe-area centering and valid state across travel and resize', () => {
    const {view,input} = viewAt(); input.pointer.wheel = -400; view.update(.05,player); input.pointer.wheel = 0;
    view.setVillageView(true,{height:720,top:90,bottom:200}); view.villageControl('in'); view.villageControl('in'); view.update(.05,player);
    view.panVillage(70,40,1280,720); view.update(.05,player); const x = view.camera.position.x;
    view.setVillageView(true,{height:720,top:90,bottom:300}); view.update(.05,player);
    expect(view.camera.position.x).toBe(x); expect(Number.isFinite(view.camera.position.y)).toBe(true);
    view.panVillage(NaN,10,0,720); view.update(.05,player); expect(view.camera.position.x).toBe(x);
    view.setVillageView(false); view.update(.05,player); expect(view.camera.zoom).toBe(1.4);
    view.setVillageView(true); view.villageControl('fit'); view.update(.05,player); expect(view.camera.position.x).toBe(villageFrame(view.camera,'home_islet').x);
    view.setPlace('home_islet',player); view.setVillageView(true); view.villageControl('fit'); view.update(.05,player);
    expect(view.camera.zoom).toBe(villageFrame(view.camera,'home_islet').zoom);
  });
});
