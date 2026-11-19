import * as THREE from 'three';
import {surfaceClass} from './places/surfaces.js';
import {projectGround} from './projection.js';

const CAST_X = .66, CAST_Z = Math.sqrt(1 - CAST_X * CAST_X);
const CAST_SHADE = new THREE.Color('#344127'), CONTACT_SHADE = new THREE.Color('#2b2f1d');
const OUTLINE = Array.from({length: 16}, (_, index) => index * Math.PI / 8);
const roundedCorner = value => Math.sign(value) * Math.abs(value) ** .71;

// Leave room for the shadow's soft edge inside the natural top. Retaining stones and foam are separate.
const onShadowGround = (x, z) => surfaceClass('home_islet', x * 1.015, z * 1.015) > 0;

export function appendGroundShadow(vertex, indices, {x, z, width, depth, reach, canopy = false, opacity = 1}) {
  if (!onShadowGround(x, z)) return;
  function dryVertex(gx, gz, tint, alpha) {
    if (onShadowGround(gx, gz)) return vertex(gx, gz, tint, opacity * alpha);
    // Fade a clipped end to zero instead of drawing the silhouette over the cove or cliff face.
    let from = 0, to = 1;
    for (let i = 0; i < 8; i++) {
      const middle = (from + to) * .5;
      if (onShadowGround(x + (gx - x) * middle, z + (gz - z) * middle)) from = middle;
      else to = middle;
    }
    return vertex(x + (gx - x) * from, z + (gz - z) * from, tint, 0);
  }
  function gradient(cx, cz, tint, core, penumbra, softEdge, outline) {
    const center = dryVertex(cx, cz, tint, core), inner = [], outer = [];
    for (const angle of OUTLINE) {
      const [dx, dz] = outline(angle);
      inner.push(dryVertex(cx + dx * softEdge, cz + dz * softEdge, tint, penumbra));
      outer.push(dryVertex(cx + dx, cz + dz, tint, 0));
    }
    for (let index = 0; index < OUTLINE.length; index++) {
      const next = (index + 1) % OUTLINE.length;
      indices.push(center, inner[index], inner[next], inner[index], outer[index], outer[next], inner[index], outer[next], inner[next]);
    }
  }

  // The contact hugs the existing foot. The high part of a roof or canopy projects southeast.
  const center = reach * .62, length = reach * .66 + depth * .4, breadth = width * .94 + .16;
  gradient(x + center * CAST_X, z + center * CAST_Z, CAST_SHADE, .43, .3, .67, angle => {
    const u = Math.cos(angle), v = Math.sin(angle);
    const crown = canopy ? 1 + Math.cos(5 * angle) * .08 : 1;
    const along = length * (canopy ? u : roundedCorner(u)) * crown;
    const across = breadth * (canopy ? v * (.85 + .14 * u) : roundedCorner(v)) * crown;
    return [CAST_X * along - CAST_Z * across, CAST_Z * along + CAST_X * across];
  });
  gradient(x, z, CONTACT_SHADE, .5, .33, .58, angle => [width * Math.cos(angle), depth * Math.sin(angle)]);
}

export function createGroundShadows(group, shadows) {
  const positions = [], colors = [], indices = [];
  const vertex = (x, z, shade, opacity) => {
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
