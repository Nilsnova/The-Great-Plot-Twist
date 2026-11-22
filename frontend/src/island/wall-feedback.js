// Short, tile-anchored dust and brass glints for confirmed construction.
import * as THREE from 'three';
import {projectGround} from '../world/projection.js';

const SECONDS = .72, STILL_SECONDS = .55;
const MOTE_SECONDS = .46, LAST_MOTE = .55, LIGHT_SECONDS = .38;
const DUST_SIDES = 12, DUST_COLOR = new THREE.Color(0xffcd91), MOTE_COLOR = new THREE.Color(0xffdfab);
// [center x/z, radius x/z], kept close to the existing tile's ground contact.
const DUST_PUFFS = [
  [-.63, .19, .37, .32], [-.34, .43, .45, .35], [.09, .44, .47, .33],
  [.57, .26, .44, .36], [.46, -.23, .37, .31], [-.46, -.26, .38, .30],
];
// [origin x/z, launch delay, outward travel, height, width, length].
const MOTES = [
  [-.68, .30, 0, -.34, 1.04, .093, .38],
  [-.31, .51, .05, -.17, 1.32, .073, .35],
  [.06, .39, .02, .08, 1.61, .091, .48],
  [.41, .32, .09, .25, 1.28, .10, .39],
  [.67, -.10, .035, .37, 1.03, .084, .33],
].map(([x, z, delay, drift, rise, width, length]) => ({
  foot: projectGround(x, z), delay, drift, rise, width, length,
}));

function dustGeometry(front) {
  const positions = [], colors = [], indices = [];
  function vertex(x, z, alpha) {
    const point = projectGround(x, z + front);
    positions.push(point.x, point.y, 0);
    colors.push(DUST_COLOR.r, DUST_COLOR.g, DUST_COLOR.b, alpha);
  }
  for (const [x, z, rx, rz] of DUST_PUFFS) {
    const center = positions.length / 3;
    vertex(x, z, .82);
    for (const [radius, alpha] of [[.48, .48], [1, 0]]) {
      for (let side = 0; side < DUST_SIDES; side++) {
        const angle = side * Math.PI * 2 / DUST_SIDES;
        vertex(x + Math.cos(angle) * rx * radius, z + Math.sin(angle) * rz * radius, alpha);
      }
    }
    for (let side = 0; side < DUST_SIDES; side++) {
      const inner = center + 1 + side;
      const next = center + 1 + (side + 1) % DUST_SIDES;
      indices.push(center, next, inner, inner, next, inner + DUST_SIDES, next, next + DUST_SIDES, inner + DUST_SIDES);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  return geometry;
}

function moteGeometry() {
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.Float32BufferAttribute(MOTES.length * 15, 3).setUsage(THREE.DynamicDrawUsage);
  const colors = new THREE.Float32BufferAttribute(MOTES.length * 20, 4).setUsage(THREE.DynamicDrawUsage);
  const indices = [];
  for (let n = 0; n < MOTES.length; n++) {
    const center = n * 5;
    for (let i = 1; i <= 4; i++) {
      indices.push(center, center + i, center + i % 4 + 1);
      colors.setXYZW(center + i, MOTE_COLOR.r, MOTE_COLOR.g, MOTE_COLOR.b, 0);
    }
  }
  geometry.setAttribute('position', positions);
  geometry.setAttribute('color', colors);
  geometry.setIndex(indices);
  return geometry;
}

function paintMotes(geometry, elapsed, glintSize) {
  const positions = geometry.getAttribute('position'), colors = geometry.getAttribute('color');
  MOTES.forEach(({foot, delay, drift, rise, width, length}, n) => {
    const time = (elapsed - delay) / MOTE_SECONDS;
    const progress = Math.min(1, Math.max(0, time));
    const lift = 1 - (1 - progress) ** 2;
    const x = foot.x + drift * progress, y = foot.y + .40 + rise * lift;
    const alpha = Math.min(1, progress / .12) * (1 - progress) ** 1.45;
    const center = n * 5;
    positions.setXYZ(center, x, y, 0);
    positions.setXYZ(center + 1, x - drift * .3, y - length * glintSize, 0);
    positions.setXYZ(center + 2, x + width * glintSize, y - .035, 0);
    positions.setXYZ(center + 3, x + drift * .12, y + .13 * glintSize, 0);
    positions.setXYZ(center + 4, x - width * glintSize, y - .035, 0);
    colors.setXYZW(center, MOTE_COLOR.r, MOTE_COLOR.g, MOTE_COLOR.b, alpha);
  });
  positions.needsUpdate = colors.needsUpdate = true;
}

function feedbackMesh(root, geometry, name) {
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  root.add(mesh);
  return mesh;
}

function makePurchaseFeedback(root, name, {dustFront = 0, dustDepth = 1, stillOpacity = .36, glintSize = 1} = {}) {
  let dust = null, motes = null, current = null, elapsed = 0, light = 0, spread = 1;

  function clear() {
    current = null;
    light = 0;
    if (dust) dust.visible = motes.visible = false;
  }

  function update(dt, paused, reduced) {
    if (!current) return;
    dust.visible = !paused;
    if (paused) { motes.visible = false; light = 0; return; }
    elapsed += dt;
    const duration = reduced ? STILL_SECONDS : SECONDS;
    if (elapsed >= duration) { clear(); return; }
    const progress = elapsed / duration;
    const scale = reduced ? 1 : .90 + .28 * (1 - (1 - progress) ** 2);
    dust.scale.set(scale * spread, scale * dustDepth, 1);
    dust.material.opacity = reduced ? stillOpacity : .92 * (1 - progress) ** 1.2;
    light = reduced ? .24 : Math.max(0, 1 - elapsed / LIGHT_SECONDS) ** 1.5;
    motes.visible = !reduced && elapsed < LAST_MOTE;
    if (motes.visible) paintMotes(motes.geometry, elapsed, glintSize);
  }

  return {
    get current() { return current; },
    get light() { return light; },
    show(spotId, level, {x, z, kind}, reduced, width = 1, view = {x, z}) {
      if (!dust) {
        dust = feedbackMesh(root, dustGeometry(dustFront), name);
        // Airborne glints interleave with upright sprites while the dust stays under them.
        dust.renderOrder = 60;
        motes = feedbackMesh(root, moteGeometry(), `${name}-motes`);
        motes.material.blending = THREE.AdditiveBlending;
      }
      const point = projectGround(view.x, view.z);
      dust.position.set(point.x, point.y, 0);
      motes.position.copy(dust.position);
      motes.renderOrder = 100 + view.z + .05;
      spread = width;
      motes.scale.x = spread;
      current = {spotId, level, x, z, ...(kind ? {kind} : {})};
      elapsed = 0;
      update(0, false, reduced);
    },
    update, clear,
    dispose() {
      clear();
      for (const mesh of [dust, motes]) {
        if (!mesh) continue;
        mesh.removeFromParent();
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      dust = motes = null;
    },
  };
}

export const makeWallFeedback = root => makePurchaseFeedback(root, 'island-wall-feedback');
// Larger bases still leave open ground in front for the dust to read.
export const makeBuildingFeedback = root => makePurchaseFeedback(root, 'island-building-feedback',
  {dustFront: .38, dustDepth: 1.35, stillOpacity: .46, glintSize: 1.28});
