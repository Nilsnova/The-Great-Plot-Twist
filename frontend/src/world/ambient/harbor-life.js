// Small, pooled ambient details for the home islet and Saltreach Harbor.
import * as THREE from 'three';
import { snapPixel } from '../../pixel/catalog.js';

const reduced = value => typeof value === 'function' ? value() : !!value;
const worldY = z => -z * .72;

function points(points, color, size, opacity) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.PointsMaterial({ color, size, transparent: true, opacity,
    depthTest: false, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Points(geometry, material); mesh.frustumCulled = false;
  return mesh;
}

function birds(color = '#e0dcc0', opacity = .82) {
  const shape = [-.44, 0, 0, -.2, .13, 0, -.2, .13, 0, 0, 0, 0,
    0, 0, 0, .22, .14, 0, .22, .14, 0, .46, 0, 0];
  const all = [];
  for (const [x, y, scale] of [[0, 0, 1], [1.1, .26, .75], [-.85, .18, .68]])
    for (let i = 0; i < shape.length; i += 3) all.push(x + shape[i] * scale, y + shape[i + 1] * scale, 0);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(all, 3));
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false,
    depthWrite: false, toneMapped: false });
  const mesh = new THREE.LineSegments(geometry, material); mesh.frustumCulled = false;
  return mesh;
}

function litWindow(group) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.48, .38), new THREE.MeshBasicMaterial({
    color: '#f1c76e', transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  mesh.position.set(snapPixel(-7.45), snapPixel(worldY(6) + 1.85), .02); mesh.renderOrder = 111; group.add(mesh);
  return mesh;
}

export function createHarborLife({ place, art, ctx } = {}) {
  const isletState = ctx?.isletState;
  const reducedMotion = ctx?.reducedMotion;
  const group = place?.group;
  if (!group || !['home_islet', 'saltreach_harbor'].includes(place.id)) return { update() {}, dispose() {} };
  let built = new Set(isletState?.getBuilt?.() ?? ['plot_1']);
  const unsubscribe = isletState?.subscribe?.(ids => { built = new Set(ids); });
  let smoke, greenhouseBirds, windowLight, harborGulls;
  if (place.id === 'home_islet') {
    // Fixed particles drift as one mesh. The geometry is allocated once with the place.
    smoke = points([-.08, 0, 0, .05, .28, 0, -.04, .58, 0, .07, .9, 0], '#b5b7a7', 1.2, .22);
    smoke.userData.ambientLife = 'cabin-smoke';
    smoke.position.set(snapPixel(-8.15), snapPixel(worldY(6) + 5.1), .03); smoke.renderOrder = 112; group.add(smoke);
    windowLight = litWindow(group);
    windowLight.userData.ambientLife = 'cabin-window';
    greenhouseBirds = birds('#d7d1b7', .75); greenhouseBirds.position.set(7, snapPixel(worldY(-7) + 4.55), .03);
    greenhouseBirds.userData.ambientLife = 'greenhouse-birds';
    greenhouseBirds.renderOrder = 114; greenhouseBirds.visible = built.has('plot_4'); group.add(greenhouseBirds);
  } else {
    harborGulls = birds('#e5dfca', .7); harborGulls.position.set(snapPixel(-1.5), snapPixel(worldY(16.5)), .03);
    harborGulls.userData.ambientLife = 'harbor-gulls';
    harborGulls.renderOrder = 126; group.add(harborGulls);
  }
  let elapsed = 0, disposed = false;
  return {
    update(dt, state = {}) {
      if (disposed) return;
      elapsed += Math.max(0, Number.isFinite(dt) ? dt : 0);
      const still = reduced(reducedMotion);
      if (smoke) {
        smoke.visible = built.has('plot_1');
        if (!still) smoke.position.y = snapPixel(worldY(6) + 5.1 + (elapsed % 2.8) * .22);
      }
      if (greenhouseBirds) {
        greenhouseBirds.visible = built.has('plot_4');
        if (!still && greenhouseBirds.visible) greenhouseBirds.position.x = snapPixel(7 + Math.sin(elapsed * .7) * .18);
      }
      if (windowLight) windowLight.material.opacity = built.has('plot_1') ? Math.max(0, Math.min(.48, (state.night ?? 0) * .48)) : 0;
      if (harborGulls) {
        harborGulls.visible = (state.weather?.fog ?? 0) <= .65;
        if (!still) harborGulls.position.y = snapPixel(worldY(16.5) + Math.sin(elapsed * .45) * .12);
      }
    },
    dispose() { if (disposed) return; disposed = true; unsubscribe?.(); },
  };
}
