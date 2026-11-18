// A soft ground contact under the same wall artwork in the village and in battle.
import * as THREE from 'three';
import {projectPoint} from '../world/art.js';

const GROUND_ORDER = 20;
const CONTACT_COLOUR = 0x1a2a2a;
const SIDES = 12;

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
    return [x, z, carriesWidth ? .99 : .49, carriesDepth ? .99 : .51];
  });
}

function shadeGeometry(shades) {
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
      const shades = wallShades(posts, links), next = JSON.stringify(shades);
      if (next !== key) {
        const geometry = shadeGeometry(shades);
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
