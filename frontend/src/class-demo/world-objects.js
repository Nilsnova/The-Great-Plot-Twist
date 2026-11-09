// The demo's objects in Saltreach Harbor: the Keeper's Lock on the lighthouse path, three lamp posts,
// and the relight at the harbor light. Original pixel shapes drawn in code onto small canvases
// (no outside asset, no data: URL). Shown only while the player stands in the harbor on the demo path.
// Every texture, material and geometry is owned here and released by dispose().
import * as THREE from 'three';
import {projectPoint} from '../world/art.js';
import {LOCK_SPOT, LAMP_SPOTS} from './harbor.js';

const UNIT = 16; // pixels per world unit, like the pixel art
const BEAM = {x: 9, y: -1.6675}; // the harbor light's lamp (registry.js beamOrigin)

function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');canvas.width = width;canvas.height = height;
  const context = canvas.getContext('2d');context.imageSmoothingEnabled = false;paint(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;texture.minFilter = THREE.NearestFilter;texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const rects = (context, list) => { for (const [x, y, w, h, colour] of list) { context.fillStyle = colour; context.fillRect(x, y, w, h); } };

const paintLock = context => rects(context, [
  [3, 14, 18, 10, '#6f6a5a'], [2, 22, 20, 2, '#4d4a3f'], [4, 15, 16, 2, '#8a8470'], // stone pedestal
  [6, 6, 12, 9, '#c9a13f'], [7, 7, 10, 1, '#efcf6f'], [6, 14, 12, 1, '#8a6a22'], // brass body
  [8, 1, 2, 6, '#9aa0a0'], [14, 1, 2, 6, '#9aa0a0'], [8, 0, 8, 2, '#b8bdbd'], // shackle
  [11, 9, 2, 3, '#3a2a12'], [11, 12, 2, 1, '#3a2a12'], // keyhole
]);
const paintLockOpen = context => rects(context, [
  [3, 14, 18, 10, '#6f6a5a'], [2, 22, 20, 2, '#4d4a3f'], [4, 15, 16, 2, '#8a8470'],
  [6, 6, 12, 9, '#c9a13f'], [7, 7, 10, 1, '#efcf6f'], [6, 14, 12, 1, '#8a6a22'],
  [14, 1, 2, 6, '#9aa0a0'], [14, 0, 6, 2, '#b8bdbd'], [18, 0, 2, 4, '#9aa0a0'], // shackle swung open
  [11, 9, 2, 3, '#f3d58c'],
]);
function paintLamp(lit) {
  return context => rects(context, [
    [7, 14, 2, 26, '#2f3633'], [5, 38, 6, 2, '#252b28'], [4, 40, 8, 2, '#1d2220'], // post and foot
    [3, 4, 10, 10, '#2f3633'], [4, 5, 8, 8, lit ? '#ffe28a' : '#56605a'], [6, 7, 4, 4, lit ? '#fff7d6' : '#6c776f'],
    [2, 2, 12, 2, '#2f3633'], [6, 0, 4, 2, '#2f3633'],
  ]);
}
// A stepped, dithered glow (no smooth gradient): four light levels with an ordered-dither seam.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function paintGlow(size) {
  return context => {
    const half = size / 2, tones = ['', 'rgba(232,160,66,0.42)', 'rgba(246,198,104,0.62)', 'rgba(255,224,150,0.8)', 'rgba(255,240,200,0.95)'];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + .5 - half, (y + .5 - half) * 1.08) / half;
      if (r >= 1) continue;
      const level = Math.floor((1 - r) ** 1.5 * 4 + (BAYER[(y % 4) * 4 + (x % 4)] + .5) / 16 - .2);
      if (level <= 0) continue;
      context.fillStyle = tones[Math.min(4, level)]; context.fillRect(x, y, 1, 1);
    }
  };
}

export function createDemoObjects({scene, reducedMotion = () => false}) {
  const root = new THREE.Group();root.name = 'class-demo-objects';root.visible = false;scene.add(root);
  const owned = [];
  const own = (...items) => { owned.push(...items); return items[0]; };
  function sprite(texture, widthPx, heightPx, x, z, anchor = 0) {
    const material = own(new THREE.MeshBasicMaterial({map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false}));
    const geometry = own(new THREE.PlaneGeometry(widthPx / UNIT, heightPx / UNIT));
    geometry.translate(0, heightPx / UNIT * (0.5 - anchor), 0);
    const mesh = new THREE.Mesh(geometry, material), point = projectPoint(x, z);
    mesh.position.set(point.x, point.y, 0);mesh.renderOrder = 100 + z;mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  }
  const lockTextures = {closed: own(canvasTexture(24, 24, paintLock)), open: own(canvasTexture(24, 24, paintLockOpen))};
  const lock = sprite(lockTextures.closed, 24, 24, LOCK_SPOT.x, LOCK_SPOT.z, 0.05);lock.name = 'keepers-lock';
  const lampTextures = {dark: own(canvasTexture(16, 42, paintLamp(false))), lit: own(canvasTexture(16, 42, paintLamp(true)))};
  const glowTexture = own(canvasTexture(48, 48, paintGlow(48))), beaconTexture = own(canvasTexture(96, 96, paintGlow(96)));
  const lamps = LAMP_SPOTS.map(spot => {
    const post = sprite(lampTextures.dark, 16, 42, spot.x, spot.z, 0.03);post.name = spot.id;
    const glow = sprite(glowTexture, 48, 48, spot.x, spot.z, 0.5);glow.position.y += 2.2;glow.material.blending = THREE.AdditiveBlending;
    glow.visible = false;glow.renderOrder = post.renderOrder + 0.1;
    return {post, glow, lit: false, spot};
  });
  const beacon = sprite(beaconTexture, 96, 96, 0, 0, 0.5);beacon.position.set(BEAM.x, BEAM.y, 0);
  beacon.material.blending = THREE.AdditiveBlending;beacon.visible = false;beacon.renderOrder = 960;

  // Moments: lamp ignition, the lock's pulse and the relight, drawn by the shared pixel effects.
  const fx = () => scene.userData?.pixelFx ?? null, pools = () => scene.userData?.lightPools ?? null;
  let time = 0, relit = false, raysAt = 0, shown = false, lockOpen = false;
  const head = lamp => ({x: lamp.post.position.x, y: lamp.post.position.y + 2.2});
  function syncPools() {
    const list = [];
    if (shown) {
      for (const lamp of lamps) if (lamp.lit) { const at = head(lamp); list.push({x: at.x, y: lamp.post.position.y, r: 2.6, kind: 0, min: .55}, {x: at.x, y: at.y, r: 1.2, kind: 1, min: .7}); }
      if (lockOpen) list.push({x: lock.position.x, y: lock.position.y + .7, r: 1.6, kind: 1, min: .45});
      if (relit) list.push({x: BEAM.x, y: BEAM.y, r: 2.4, kind: 1, min: .8});
    }
    pools()?.extra('class-demo', list);
  }
  function ignite(lamp) {
    const effects = fx(), at = head(lamp);
    if (!effects) return;
    effects.bloom(at.x, at.y, {radius: 1.8, life: 1.3});
    if (reducedMotion()) return;
    effects.burst(at.x, at.y, {count: 28, speed: [1.2, 3.6], angle: Math.PI / 2, spread: 1.9, gravity: 4.5, life: [.6, 1.3], colour: '#ffd77a'});
    effects.burst(at.x, at.y, {count: 10, speed: [.4, 1.2], angle: Math.PI / 2, spread: .8, gravity: -.6, life: [1.2, 2], colour: '#fff3c8', size: [1, 1]});
    effects.ring(at.x, lamp.post.position.y + .1, {radius: 2.4, life: .8, colour: '#f6d27a'});
  }
  // The Keeper's Lock opens: a cinematic pulse, three rings and a shockwave across the harbor.
  function pulseLock() {
    const effects = fx(), x = lock.position.x, y = lock.position.y + .75;
    if (!effects) return;
    effects.bloom(x, y, {radius: 3, life: 2.6});
    if (reducedMotion()) return;
    effects.rays(x, y, {radius: 5.5, life: 3.2});
    [0, .18, .36].forEach((delay, i) => effects.ring(x, y, {radius: 2.2 + i * 2.4, life: .9, delay, colour: i ? '#f3e4b0' : '#ffe08a'}));
    effects.ring(x, y, {radius: 19, life: 1.5, delay: .25, colour: '#e9d39a'});
    effects.burst(x, y, {count: 60, speed: [2, 6.5], angle: Math.PI / 2, spread: Math.PI * 1.6, gravity: 7, life: [.8, 1.6]});
  }
  // The lighthouse burns again: bloom, slow rays, sparks and a ring at the harbor light.
  function celebrate() {
    const effects = fx();
    if (!effects) return;
    effects.bloom(BEAM.x, BEAM.y, {radius: 2.8, life: 3.2});
    if (reducedMotion()) return;
    effects.rays(BEAM.x, BEAM.y, {radius: 9, life: 6.5}); raysAt = time;
    effects.ring(BEAM.x, BEAM.y, {radius: 6, life: 1.1}); effects.ring(BEAM.x, BEAM.y, {radius: 14, life: 1.6, delay: .2, colour: '#e9d39a'});
    effects.burst(BEAM.x, BEAM.y, {count: 150, speed: [2, 7.5], angle: Math.PI / 2, spread: Math.PI * 2, gravity: 6, life: [1, 2.6]});
    effects.burst(BEAM.x, BEAM.y, {count: 40, speed: [.5, 1.6], angle: Math.PI / 2, spread: Math.PI, gravity: -.4, life: [2, 3.2], colour: '#fff3c8', size: [1, 1]});
  }

  return {
    setVisible(value) { const next = value === true; root.visible = next; if (next !== shown) { shown = next; syncPools(); } },
    setLockOpen(open) { lock.material.map = open ? lockTextures.open : lockTextures.closed; lock.material.needsUpdate = true; lockOpen = open === true; syncPools(); },
    pulseLock,celebrate,
    setLamps(litList) {
      let changed = false;
      lamps.forEach((lamp, index) => {
        const lit = litList[index] === true;
        if (lamp.lit === lit) return;
        lamp.lit = lit;lamp.post.material.map = lit ? lampTextures.lit : lampTextures.dark;lamp.post.material.needsUpdate = true;lamp.glow.visible = lit;
        changed = true; if (lit && root.visible) ignite(lamp);
      });
      if (changed) syncPools();
    },
    setRelit(value, {celebrate: party = false} = {}) { const next = value === true; if (next === relit) return; relit = next; beacon.visible = relit; syncPools(); if (relit && party) celebrate(); },
    update(delta) {
      if (!root.visible) return;
      time += delta;
      const still = reducedMotion();
      for (const lamp of lamps) if (lamp.lit) lamp.glow.material.opacity = still ? 0.9 : 0.75 + Math.sin(time * 5 + lamp.post.position.x) * 0.2;
      if (relit) beacon.material.opacity = still ? 0.9 : 0.7 + Math.sin(time * 2) * 0.25;
      // While relit, the slow rays come back every few seconds.
      if (relit && !still && time - raysAt > 6) { raysAt = time; fx()?.rays(BEAM.x, BEAM.y, {radius: 6.5, life: 6.8, colour: '#a87f3c'}); }
    },
    dispose() { pools()?.extra('class-demo', []); root.removeFromParent(); for (const item of owned) item.dispose(); owned.length = 0; },
  };
}
