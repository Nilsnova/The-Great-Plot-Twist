// A soft ground contact under the same wall artwork in the village and in battle.
import * as THREE from 'three';
import {projectPoint} from '../world/art.js';

const GROUND_ORDER = 20;
const CONTACT_COLOUR = 0x1a2a2a;
const SIDES = 12;
const STRIP_EDGES = [-.70, -.34, .38, .72];
const STRIP_ALPHA = [0, .22, .26, 0];

function wallShades(posts, links) {
  const alongX = new Set(), alongZ = new Set();
  for (const {a, b, x0, x1} of links) {
    const axis = x0 === x1 ? alongZ : alongX;
    axis.add(a);
    axis.add(b);
  }
  return posts.map(({id, x, z, look}) => {
    if (look === 'broken') return [x, z, .5, .4];
    const carriesDepth = alongZ.has(id), carriesWidth = alongX.has(id) || !carriesDepth;
    return [x, z, carriesWidth ? .99 : .70, carriesDepth ? .99 : .72];
  });
}

function shadeGeometry(shades, links) {
  const positions = [], colours = [], indices = [];
  function vertex(x, z, alpha) {
    const p = projectPoint(x, z);
    positions.push(p.x, p.y, 0);
    colours.push(1, 1, 1, alpha);
  }
  for (const [x, z, width, depth] of shades) {
    const centre = positions.length / 3;
    vertex(x, z, .26);
    for (let side = 0; side < SIDES; side++) {
      const angle = side * Math.PI * 2 / SIDES;
      vertex(x + width * Math.cos(angle), z + depth * Math.sin(angle), 0);
      indices.push(centre, centre + side + 1, centre + (side + 1) % SIDES + 1);
    }
  }
  // The center-to-center shadow strip grounds the actual connectors, including mixed tiers.
  // Endpoint ellipses cover the short free ends and leave broken cells open.
  for (const {x0, z0, x1, z1} of links) {
    const start = positions.length / 3, vertical = x0 === x1;
    for (const [x,z] of [[x0,z0],[x1,z1]]) {
      for (const [index, edge] of STRIP_EDGES.entries()) {
        vertex(x + (vertical ? edge : 0), z + (vertical ? 0 : edge), STRIP_ALPHA[index]);
      }
    }
    const width = STRIP_EDGES.length;
    for (let i = 0; i < width - 1; i++) {
      const a = start + i, b = a + width;
      indices.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 4));
  geometry.setIndex(indices);
  return geometry;
}

export function makeWallFooting(root) {
  let mesh = null, key = null;
  return {
    show(posts, links) {
      if (!posts.length) {
        if (mesh) mesh.visible = false;
        return;
      }
      const shades = wallShades(posts, links);
      const joins = links.map(({x0, z0, x1, z1}) => [x0, z0, x1, z1]);
      const next = JSON.stringify([shades, joins]);
      if (next !== key) {
        const geometry = shadeGeometry(shades, links);
        if (!mesh) {
          const material = new THREE.MeshBasicMaterial({color: CONTACT_COLOUR, vertexColors: true,
            transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false});
          material.forceSinglePass = true;
          mesh = new THREE.Mesh(geometry, material);
          mesh.name = 'wall-ground-contact';
          mesh.renderOrder = GROUND_ORDER;
          mesh.frustumCulled = false;
          mesh.raycast = () => {};
          root.add(mesh);
        } else {
          mesh.geometry.dispose();
          mesh.geometry = geometry;
        }
        key = next;
      }
      mesh.visible = true;
    },
    dispose() {
      if (!mesh) return;
      mesh.geometry.dispose();
      mesh.material.dispose();
      root.remove(mesh);
      mesh = null;
      key = null;
    },
  };
}
