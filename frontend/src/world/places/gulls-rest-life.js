// A few pixel-grid coastal details. The place lifetime owns every returned mesh resource.
import * as THREE from 'three';
import { snapPixel } from '../../pixel/catalog.js';

const pixel = 1 / 16;

function waveGeometry() {
  const quads = [
    [-11, 13.5, .625], [-8, 16, .5], [-5, 14.5, .5],
    [5, 15, .5], [8, 17, .5], [11, 13.5, .625],
  ];
  const positions = [];
  for (const [x, z, width] of quads) {
    const left = x - width / 2, right = x + width / 2;
    const y = snapPixel(-z * .72);
    positions.push(left, y, 0, right, y, 0, right, y + pixel, 0,
      left, y, 0, right, y + pixel, 0, left, y + pixel, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function gullGeometry() {
  const geometry = new THREE.BufferGeometry();
  const points = [
    -.25, 0, 0, -.0625, .0625, 0, -.0625, .0625, 0, .125, 0, 0,
    .25, .0625, 0, .4375, .125, 0, .4375, .125, 0, .625, .0625, 0,
    .75, 0, 0, .9375, .0625, 0, .9375, .0625, 0, 1.125, 0, 0,
  ];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

export function createGullsRestLife(group, lanternString, { reducedMotion } = {}) {
  const waves = new THREE.Mesh(waveGeometry(), new THREE.MeshBasicMaterial({
    color: '#a8c5af', transparent: true, opacity: .42,
    depthTest: false, depthWrite: false, toneMapped: false,
  }));
  waves.renderOrder = 12;
  group.add(waves);

  const birds = new THREE.LineSegments(gullGeometry(), new THREE.LineBasicMaterial({
    color: '#e0dcc0', transparent: true, opacity: .8,
    depthTest: false, depthWrite: false, toneMapped: false,
  }));
  birds.position.set(snapPixel(-4), snapPixel(-5.4), 0);
  birds.renderOrder = 130;
  group.add(birds);

  let time = 0, disposed = false;
  const motionIsReduced = () => {
    if (typeof reducedMotion === 'function') return reducedMotion();
    if (typeof reducedMotion === 'boolean') return reducedMotion;
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  return {
    waves,
    birds,
    update(dt, worldTime) {
      if (disposed || motionIsReduced()) return;
      if (Number.isFinite(worldTime)) time = worldTime;
      else if (Number.isFinite(dt)) time += Math.max(0, dt);
      const step = Math.round(Math.sin(time * 1.7) * 1) * pixel;
      waves.position.x = step;
      birds.position.x = snapPixel(-4 + Math.sin(time * .24) * .75);
      birds.position.y = snapPixel(-5.4 + Math.sin(time * .4) * .13);
      if (lanternString) lanternString.material.opacity = .88 + (Math.round((Math.sin(time * 4.2) + 1) * 2) / 2) * .03;
    },
    dispose() { disposed = true; },
  };
}
