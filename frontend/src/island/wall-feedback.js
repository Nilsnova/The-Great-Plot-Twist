// Short, tile-anchored dust, grit and brass glints for confirmed construction.
import * as THREE from 'three';
import {projectGround} from '../world/projection.js';

const SECONDS = .72, STILL_SECONDS = .55;
const GLINT_SECONDS = .44, CHIP_SECONDS = .33, LAST_MOTE = .55, LIGHT_SECONDS = .38;
const DUST_BURST_SECONDS = .29;
const DUST_SIDES = 12;
const DUST_COLOR = new THREE.Color(0xffe4bc), DUST_SHADE = new THREE.Color(0xb2865e), DUST_LIGHT = new THREE.Color(0xffedcd);
const BRASS = new THREE.Color(0xffedb1), BRASS_EDGE = new THREE.Color(0xc48b47);
const GRIT = new THREE.Color(0xd19b64), GRIT_EDGE = new THREE.Color(0x8f6545);
const easeOut = progress => 1 - (1 - progress) ** 2;
// [center x/z, radius x/z], kept close to the existing tile's ground contact.
const DUST_PUFFS = [
  [-.72, .34, .29, .30], [-.48, .47, .36, .32], [-.12, .50, .45, .30],
  [.37, .47, .40, .31], [.70, .33, .31, .28], [.48, -.22, .35, .31],
];
// [origin x/z, delay, outward travel, height, width, length, stone chip].
const MOTES = [
  [-.58, .34, 0, -.24, 1.02, .108, .29],
  [-.34, .49, .025, -.43, .32, .088, .11, true],
  [.08, .42, .045, .10, 1.12, .108, .31],
  [.49, .39, .095, .23, .89, .102, .27],
  [.52, .36, .06, .39, .28, .088, .11, true],
].map(([x, z, delay, drift, rise, width, length, chip = false]) => ({
  foot: projectGround(x, z), delay, drift, rise, width, length, chip,
  color: chip ? GRIT : BRASS, edge: chip ? GRIT_EDGE : BRASS_EDGE,
}));

function dustGeometry(front) {
  const positions = [], colors = [], indices = [];
  const tint = new THREE.Color();
  function vertex(x, z, alpha, colour) {
    const point = projectGround(x, z + front);
    positions.push(point.x, point.y, 0);
    colors.push(colour.r, colour.g, colour.b, alpha);
  }
  for (const [x, z, rx, rz] of DUST_PUFFS) {
    const center = positions.length / 3;
    vertex(x, z, .88, DUST_COLOR);
    for (const [radius, alpha] of [[.48, .55], [1, 0]]) {
      for (let side = 0; side < DUST_SIDES; side++) {
        const angle = side * Math.PI * 2 / DUST_SIDES;
        const across = Math.cos(angle), down = Math.sin(angle);
        tint.copy(DUST_SHADE).lerp(DUST_LIGHT, .5 - down * .36 - across * .14);
        vertex(x + across * rx * radius, z + down * rz * radius, alpha, tint);
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
    const {color, edge} = MOTES[n];
    for (let i = 1; i <= 4; i++) {
      indices.push(center, center + i, center + i % 4 + 1);
      const tint = i === 1 ? edge : color;
      colors.setXYZW(center + i, tint.r, tint.g, tint.b, 0);
    }
  }
  geometry.setAttribute('position', positions);
  geometry.setAttribute('color', colors);
  geometry.setIndex(indices);
  return geometry;
}

function paintMotes(geometry, elapsed, glintSize) {
  const positions = geometry.getAttribute('position'), colors = geometry.getAttribute('color');
  MOTES.forEach(({foot, delay, drift, rise, width, length, chip, color}, n) => {
    const seconds = chip ? CHIP_SECONDS : GLINT_SECONDS;
    const progress = Math.min(1, Math.max(0, (elapsed - delay) / seconds));
    // Stone rises and falls back to the contact plane. The brass catches the light for a short lift.
    const lift = chip ? 4 * progress * (1 - progress) : easeOut(progress);
    const x = foot.x + drift * easeOut(progress);
    const y = foot.y + (chip ? .1 : .35) + rise * lift;
    const alpha = Math.min(1, progress / .11) * (1 - progress) ** (chip ? .78 : 1.32);
    const center = n * 5;
    positions.setXYZ(center, x, y, 0);
    positions.setXYZ(center + 1, x - drift * .3, y - length * glintSize, 0);
    positions.setXYZ(center + 2, x + width * glintSize, y - .035, 0);
    positions.setXYZ(center + 3, x + drift * .12, y + (chip ? .055 : .13) * glintSize, 0);
    positions.setXYZ(center + 4, x - width * glintSize, y - .035, 0);
    colors.setXYZW(center, color.r, color.g, color.b, alpha);
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
    const burst = easeOut(Math.min(1, elapsed / DUST_BURST_SECONDS));
    const settle = easeOut(Math.min(1, Math.max(0, elapsed - .13) / .35));
    const across = reduced ? 1 : .78 + .4 * burst;
    const depth = reduced ? 1 : .94 + .23 * burst - .07 * settle;
    dust.scale.set(across * spread, depth * dustDepth, 1);
    dust.material.opacity = reduced ? stillOpacity : .96 * (1 - progress) ** .88;
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
