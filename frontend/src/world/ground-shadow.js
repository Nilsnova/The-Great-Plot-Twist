import * as THREE from 'three';
import {surfaceClass} from './places/surfaces.js';
import {projectGround} from './projection.js';

const CAST_X = .66, CAST_Z = Math.sqrt(1 - CAST_X * CAST_X);
const CAST_SHADE = new THREE.Color('#34432c'), CONTACT_SHADE = new THREE.Color('#3b3425');
const OUTLINE = Array.from({length: 16}, (_, index) => index * Math.PI / 8);
const roundedCorner = value => Math.sign(value) * Math.abs(value) ** .71;

function hull(points) {
  const sorted = points.sort(([x1, z1], [x2, z2]) => x1 - x2 || z1 - z2);
  function edge(order) {
    const edge = [];
    for (const point of order) {
      while (edge.length > 1) {
        const [a, b] = edge.slice(-2);
        if ((b[0] - a[0]) * (point[1] - a[1]) > (b[1] - a[1]) * (point[0] - a[0])) break;
        edge.pop();
      }
      edge.push(point);
    }
    return edge.slice(0, -1);
  }
  return [...edge(sorted), ...edge(sorted.reverse())];
}

function roofOutline(width, depth, reach, profile) {
  // Project a low plinth, the eaves and the ridge from the same sun direction as the cliffs.
  const box = (w, d, height) => [[-w, -d, height], [w, -d, height], [w, d, height], [-w, d, height]];
  const base = box(width * .68, depth * .62, 0);
  const eaves = box(width, depth * .78, profile === 'tower' ? .86 : .48);
  const ridge = profile === 'gable' ? [[0, -.64 * depth, 1], [0, .46 * depth, 1]] : [[0, 0, 1]];
  return hull([...base, ...eaves, ...ridge].map(([x, z, height]) => [
    x + height * reach * CAST_X, z + height * reach * CAST_Z,
  ]));
}

// Leave room for the shadow's soft edge inside the natural top. Retaining stones and foam are separate.
const onShadowGround = (x, z) => surfaceClass('home_islet', x * 1.015, z * 1.015) > 0;

export function appendGroundShadow(vertex, indices, {x, z, width, depth, reach, roof, canopy = false, opacity = 1}) {
  if (!onShadowGround(x, z)) return;
  function dryVertex(gx, gz, tint, alpha, contact) {
    if (onShadowGround(gx, gz)) return vertex(gx, gz, tint, opacity * alpha, contact);
    // Fade a clipped end to zero instead of drawing the silhouette over the cove or cliff face.
    let from = 0, to = 1;
    for (let i = 0; i < 8; i++) {
      const middle = (from + to) * .5;
      if (onShadowGround(x + (gx - x) * middle, z + (gz - z) * middle)) from = middle;
      else to = middle;
    }
    return vertex(x + (gx - x) * from, z + (gz - z) * from, tint, 0, contact);
  }
  function gradient(cx, cz, tint, core, penumbra, softEdge, outline, contact = false) {
    const center = dryVertex(cx, cz, tint, core, contact), inner = [], outer = [];
    for (const angle of OUTLINE) {
      const [dx, dz] = outline(angle);
      inner.push(dryVertex(cx + dx * softEdge, cz + dz * softEdge, tint, penumbra, contact));
      outer.push(dryVertex(cx + dx, cz + dz, tint, 0, contact));
    }
    for (let index = 0; index < OUTLINE.length; index++) {
      const next = (index + 1) % OUTLINE.length;
      indices.push(center, inner[index], inner[next], inner[index], outer[index], outer[next], inner[index], outer[next], inner[next]);
    }
  }

  if (roof) {
    const sunReach = reach * .81;
    const outline = roofOutline(width, depth, sunReach, roof);
    const cx = sunReach * CAST_X * .46, cz = sunReach * CAST_Z * .46;
    const center = dryVertex(x + cx, z + cz, CAST_SHADE, .62, false), inner = [], outer = [];
    for (const [dx, dz] of outline) {
      const cast = (dx * CAST_X + dz * CAST_Z) / sunReach;
      const fade = THREE.MathUtils.smoothstep(cast, .04, 1.17);
      const spread = 1.09 + fade * .23;
      inner.push(dryVertex(x + dx, z + dz, CAST_SHADE, .55 - fade * .33, false));
      outer.push(dryVertex(x + cx + (dx - cx) * spread, z + cz + (dz - cz) * spread, CAST_SHADE, 0, false));
    }
    for (let i = 0; i < outline.length; i++) {
      const next = (i + 1) % outline.length;
      indices.push(center, inner[i], inner[next], inner[i], outer[i], outer[next], inner[i], outer[next], inner[next]);
    }
  } else {
    const center = reach * .68, length = reach * .62 + depth * .27, breadth = width * .86 + .09;
    if (canopy) {
      const trunk = reach * .31;
      gradient(x + trunk * CAST_X, z + trunk * CAST_Z, CAST_SHADE, .52, .34, .78, angle => {
        const along = Math.cos(angle) * reach * .48, across = Math.sin(angle) * width * .32;
        return [CAST_X * along - CAST_Z * across, CAST_Z * along + CAST_X * across];
      });
    }
    gradient(x + center * CAST_X, z + center * CAST_Z, CAST_SHADE, .46, .27, .8, angle => {
      const u = Math.cos(angle), v = Math.sin(angle);
      const crown = canopy ? 1 + Math.cos(5 * angle) * .13 + Math.sin(3 * angle) * .075 : 1;
      const along = length * (canopy ? u : roundedCorner(u)) * crown;
      const across = breadth * (canopy ? v * (.85 + .14 * u) : roundedCorner(v)) * crown;
      return [CAST_X * along - CAST_Z * across, CAST_Z * along + CAST_X * across];
    });
  }
  gradient(x, z, CONTACT_SHADE, .57, .39, .69, angle => [width * Math.cos(angle), depth * Math.sin(angle)], true);
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
  return mesh;
}
