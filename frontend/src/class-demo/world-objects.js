// The demo's objects in Saltreach Harbor: the Keeper's Lock on the lighthouse path, three lamp posts,
// and the relight burst at the harbor light. Original pixel shapes drawn in code onto small canvases
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
function paintGlow(context) {
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,236,160,0.95)');gradient.addColorStop(0.4, 'rgba(255,214,110,0.45)');gradient.addColorStop(1, 'rgba(255,200,90,0)');
  context.fillStyle = gradient;context.fillRect(0, 0, 64, 64);
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
  const glowTexture = own(canvasTexture(64, 64, paintGlow));
  const lamps = LAMP_SPOTS.map(spot => {
    const post = sprite(lampTextures.dark, 16, 42, spot.x, spot.z, 0.03);post.name = spot.id;
    const glow = sprite(glowTexture, 64, 64, spot.x, spot.z, 0.5);glow.position.y += 2.2;glow.material.blending = THREE.AdditiveBlending;
    glow.visible = false;glow.renderOrder = post.renderOrder + 0.1;
    return {post, glow, lit: false};
  });
  const beacon = sprite(glowTexture, 64, 64, 0, 0, 0.5);beacon.position.set(BEAM.x, BEAM.y, 0);beacon.scale.setScalar(3);
  beacon.material.blending = THREE.AdditiveBlending;beacon.visible = false;beacon.renderOrder = 960;

  // The relight burst: a few hundred sparks that rise from the harbor light and fall away in 3 s.
  const SPARKS = 180, positions = new Float32Array(SPARKS * 3), velocities = new Float32Array(SPARKS * 2);
  const sparkGeometry = own(new THREE.BufferGeometry());sparkGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const sparkMaterial = own(new THREE.PointsMaterial({color: 0xffe08a, size: 3, sizeAttenuation: false, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending}));
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);sparks.visible = false;sparks.frustumCulled = false;sparks.renderOrder = 961;root.add(sparks);
  let burstLeft = 0, time = 0, relit = false;

  function burst() {
    if (reducedMotion()) return;
    for (let i = 0; i < SPARKS; i++) {
      positions[i * 3] = BEAM.x;positions[i * 3 + 1] = BEAM.y;positions[i * 3 + 2] = 0;
      const angle = Math.random() * Math.PI * 2, speed = 2 + Math.random() * 6;
      velocities[i * 2] = Math.cos(angle) * speed;velocities[i * 2 + 1] = Math.abs(Math.sin(angle)) * speed + 2;
    }
    sparkGeometry.attributes.position.needsUpdate = true;sparks.visible = true;burstLeft = 3;sparkMaterial.opacity = 1;
  }

  return {
    setVisible(value) { root.visible = value === true; },
    setLockOpen(open) { lock.material.map = open ? lockTextures.open : lockTextures.closed; lock.material.needsUpdate = true; },
    setLamps(litList) {
      lamps.forEach((lamp, index) => {
        const lit = litList[index] === true;
        if (lamp.lit === lit) return;
        lamp.lit = lit;lamp.post.material.map = lit ? lampTextures.lit : lampTextures.dark;lamp.post.material.needsUpdate = true;lamp.glow.visible = lit;
      });
    },
    setRelit(value, {celebrate = false} = {}) { relit = value === true; beacon.visible = relit; if (relit && celebrate) burst(); },
    update(delta) {
      if (!root.visible) return;
      time += delta;
      const still = reducedMotion();
      for (const lamp of lamps) if (lamp.lit) lamp.glow.material.opacity = still ? 0.9 : 0.75 + Math.sin(time * 5 + lamp.post.position.x) * 0.2;
      if (relit) beacon.material.opacity = still ? 0.9 : 0.7 + Math.sin(time * 2) * 0.25;
      if (burstLeft > 0) {
        burstLeft -= delta;
        for (let i = 0; i < SPARKS; i++) {
          velocities[i * 2 + 1] -= 6 * delta;
          positions[i * 3] += velocities[i * 2] * delta;positions[i * 3 + 1] += velocities[i * 2 + 1] * delta;
        }
        sparkGeometry.attributes.position.needsUpdate = true;sparkMaterial.opacity = Math.max(0, burstLeft / 3);
        if (burstLeft <= 0) sparks.visible = false;
      }
    },
    dispose() { root.removeFromParent(); for (const item of owned) item.dispose(); owned.length = 0; },
  };
}
