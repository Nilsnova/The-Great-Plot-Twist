// Draws only server-announced home-islet buildings; plot clicks remain intent events.
import * as THREE from 'three';
import { placeArt } from '../art.js';
import { homeBuildings } from './layouts.js';

const FOOTPRINTS = Object.freeze({
  cabin: { width: 4.8, depth: 3.6 }, workshop: { width: 5.4, depth: 3.7 },
  windmill: { width: 3.5, depth: 3.8 }, greenhouse: { width: 5, depth: 3.5 },
  'islet-signal-station': { width: 3.3, depth: 3.2 },
});
const isReduced = value => typeof value === 'function' ? value() : !!value;

function addDust(group, x, z) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([-1, 0, 0, -.5, .15, 0, 0, 0, 0, .5, .12, 0, 1, 0, 0]);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: '#c9b78a', size: 1.4, transparent: true,
    opacity: .82, depthTest: false, depthWrite: false, toneMapped: false });
  const points = new THREE.Points(geometry, material);
  points.position.set(x, -z * .72 + 2, 0); points.renderOrder = 119; points.visible = false; group.add(points);
  return points;
}

function makeBuilding(place, art, item, asset) {
  if (item.plot === 'islet_signal_station') {
    const unlit = placeArt(place.group, art, 'islet-signal-station', item.x, item.z);
    const lit = placeArt(place.group, art, 'islet-signal-station-lit', item.x, item.z);
    lit.visible = false;
    return { meshes: [unlit, lit], refresh(night, built) {
      unlit.visible = built && night <= .12; lit.visible = built && night > .12;
    } };
  }
  const mesh = placeArt(place.group, art, asset, item.x, item.z);
  return { meshes: [mesh], refresh() {} };
}

export function decorateHome(place, art, cleanups, ctx) {
  const pads = new Map(), markers = new Map(), buildings = new Map(), dust = new Map();
  const state = ctx.isletState;
  let active = new Set(state?.getBuilt?.() ?? ['plot_1']);
  let animating = false;
  for (const item of homeBuildings) {
    const pad = placeArt(place.group, art, 'build-plot', item.x, item.z + .5);
    pad.renderOrder = 6; pad.userData.plot = item.plot; pads.set(item.plot, pad);
    const marker = placeArt(place.group, art, item.locked ? 'islet-locked-sign' : 'islet-empty-plot', item.x, item.z);
    marker.userData.plot = item.plot; markers.set(item.plot, marker);
    dust.set(item.plot, addDust(place.group, item.x, item.z));
    const asset = item.plot === 'islet_signal_station' ? 'islet-signal-station' : item.asset;
    buildings.set(item.plot, makeBuilding(place, art, item, asset));
  }
  let stationNight = .12;
  const baseY = new Map();
  for (const item of homeBuildings) for (const mesh of buildings.get(item.plot).meshes) baseY.set(mesh, mesh.position.y);
  const baseColliders = place.colliders.filter(collider => !collider.isletPlot);
  function applyBuilt(next, allowRaise = false, meta = {}) {
    const coming = new Set(next);
    for (const item of homeBuildings) {
      const wasBuilt = active.has(item.plot), isBuilt = coming.has(item.plot);
      const group = buildings.get(item.plot);
      group.meshes.forEach(mesh => { mesh.visible = isBuilt; });
      group.refresh(stationNight, isBuilt);
      markers.get(item.plot).visible = !isBuilt;
      if (isBuilt && !wasBuilt && allowRaise) {
        if (!isReduced(ctx.reducedMotion)) {
          const cloud = dust.get(item.plot); cloud.visible = true; cloud.userData.age = 0;
          cloud.material.opacity = .82; cloud.position.y = -item.z * .72 + 2;
          for (const mesh of group.meshes) mesh.position.y = baseY.get(mesh) + 5;
          animating = true;
        }
        ctx.emit({ type: 'islet_build_raised', plot: item.plot, preview: meta.preview === true });
      }
    }
    active = coming;
    place.colliders.splice(0, place.colliders.length, ...baseColliders,
      ...homeBuildings.filter(item => active.has(item.plot)).map(item => ({
        x: item.x, z: item.z - FOOTPRINTS[item.plot === 'islet_signal_station' ? 'islet-signal-station' : item.asset].depth / 2,
        ...FOOTPRINTS[item.plot === 'islet_signal_station' ? 'islet-signal-station' : item.asset], isletPlot: true,
      })));
  }
  applyBuilt(active);
  const stopState = state?.subscribe?.((next, meta) => applyBuilt(next, true, meta));
  if (stopState) cleanups.push(stopState);
  if (state?.dispose) { /* The app owns the store and disposes it with the game. */ }
  const originalUpdate = place.update;
  place.update = (dt, frame) => {
    originalUpdate(dt, frame);
    stationNight = frame?.night ?? stationNight;
    buildings.get('islet_signal_station')?.refresh(stationNight, active.has('islet_signal_station'));
    if (!animating) return;
    if (isReduced(ctx.reducedMotion)) {
      for (const item of homeBuildings) {
        const cloud = dust.get(item.plot), group = buildings.get(item.plot);
        if (cloud.userData.age === undefined) continue;
        delete cloud.userData.age; cloud.visible = false; cloud.position.y = -item.z * .72 + 2; cloud.material.opacity = .82;
        group.meshes.forEach(mesh => { mesh.position.y = baseY.get(mesh); });
      }
      animating = false;
      return;
    }
    let running = false;
    for (const item of homeBuildings) {
      const cloud = dust.get(item.plot), group = buildings.get(item.plot);
      const age = cloud.userData.age;
      if (age === undefined) continue;
      const next = age + Math.max(0, dt);
      cloud.userData.age = next; cloud.visible = next < .46;
      cloud.material.opacity = Math.max(0, .82 * (1 - next / .46));
      cloud.position.y += dt * 2.5;
      const lift = next < .18 ? 5 * (1 - next / .18) : 0;
      group.meshes.forEach(mesh => { mesh.position.y = baseY.get(mesh) + lift; });
      if (next < .46) running = true;
      else { delete cloud.userData.age; cloud.visible = false; }
    }
    animating = running;
  };
  cleanups.push(() => { place.update = originalUpdate; });

  const choose = plot => ctx.emit({ type: 'plot_clicked', plot });
  cleanups.push(ctx.on('interact', event => {
    if (event.place === place.id && homeBuildings.some(item => item.plot === event.id)) choose(event.id);
  }));
  if (!ctx.canvas || !ctx.camera) return;
  let down = null;
  const start = event => { if (event.button === 0) down = [event.clientX, event.clientY]; };
  const click = event => {
    if (!down || event.button !== 0 || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 6) { down = null; return; }
    down = null; if (!ctx.isActive?.()) return;
    const rect = ctx.canvas.getBoundingClientRect();
    const point = new THREE.Vector3((event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2, 0).unproject(ctx.camera);
    const z = -point.y / .72;
    const plot = homeBuildings.find(item => Math.abs(item.x - point.x) <= 4.5 && z >= item.z - 7 && z <= item.z + .7);
    if (plot) choose(plot.plot);
  };
  ctx.canvas.addEventListener('pointerdown', start); ctx.canvas.addEventListener('pointerup', click);
  cleanups.push(() => { ctx.canvas.removeEventListener('pointerdown', start); ctx.canvas.removeEventListener('pointerup', click); down = null; });
}
