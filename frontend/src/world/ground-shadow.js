import * as THREE from 'three';
import {projectGround} from './projection.js';

const EDGE = Array.from({length: 16}, (_, index) => {
  const angle = index * Math.PI / 8;
  return [Math.cos(angle), Math.sin(angle)];
});

export function appendGroundShadow(vertex, indices, {x, z, width, depth, opacity, innerOpacity}) {
  const center = vertex(x, z, opacity), inner = [], outer = [];
  for (const [u, v] of EDGE) {
    inner.push(vertex(x + u * width * .6, z + v * depth * .6, innerOpacity));
    outer.push(vertex(x + u * width, z + v * depth, 0));
  }
  for (let index = 0; index < EDGE.length; index++) {
    const next = (index + 1) % EDGE.length;
    indices.push(center, inner[index], inner[next], inner[index], outer[index], outer[next], inner[index], outer[next], inner[next]);
  }
}

export function createGroundShadows(group, shadows) {
  const positions = [], colors = [], indices = [];
  const shade = new THREE.Color('#334329');
  const vertex = (x, z, opacity) => {
    const ground = projectGround(x, z), index = positions.length / 3;
    positions.push(ground.x, ground.y, 0);
    colors.push(shade.r, shade.g, shade.b, opacity);
    return index;
  };
  for (const shadow of shadows) appendGroundShadow(vertex, indices, shadow);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.DoubleSide, forceSinglePass: true,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false});
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'home-scenery-shadows';
  mesh.renderOrder = 20;
  mesh.raycast = () => {};
  group.add(mesh);
}
