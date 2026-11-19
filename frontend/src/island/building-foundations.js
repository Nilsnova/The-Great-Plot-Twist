// Ground contact at Home's existing building anchors. The whole layer is decorative.
import * as THREE from 'three';
import {appendGroundShadow} from '../world/ground-shadow.js';
import {projectGround} from '../world/projection.js';
import {surfaceClass} from '../world/places/surfaces.js';
import {ISLAND_PLACE} from './spots.js';

const FORMS = {
  house: {width: 1.36, depth: .86, rear: .46},
  watchtower: {width: 1.17, depth: .90, rear: .52},
  tower: {width: .93, depth: .60, rear: .40},
};
const PALETTE = [0x273121, 0x654e35, 0x92704a, 0xb99664, 0xc6a476, 0x594631].map(
  hex => new THREE.Color(hex),
);
const [SHADOW, EAST, FRONT, BEVEL, CAP, MORTAR] = PALETTE;

function corners(x, z, width, depth) {
  const clip = .24;
  return [
    [x-width+clip,z-depth], [x+width-clip,z-depth], [x+width,z-depth+clip],
    [x+width,z+depth-clip], [x+width-clip,z+depth], [x-width+clip,z+depth],
    [x-width,z+depth-clip], [x-width,z-depth+clip],
  ];
}

function geometryOf(foundations) {
  const points = [], colors = [], indices = [];
  function vertex(x, z, rise, color, alpha = 1) {
    const point = projectGround(x, z), index = points.length / 3;
    points.push(point.x, point.y + rise, rise);
    colors.push(color.r, color.g, color.b, alpha);
    return index;
  }
  function quad(a, b, c, d) { indices.push(a, b, c, a, c, d); }

  // Ground shadows all go first, so a nearby occupied footing keeps its own highlights.
  for (const {x, z, slot, ruin} of foundations) {
    const {width, depth, rear} = FORMS[slot], scale = ruin ? .72 : 1;
    appendGroundShadow((gx, gz, alpha) => vertex(gx, gz, 0, SHADOW, alpha), indices, {
      x: x + .48, z: z - rear + .65, width: (width + .83) * scale, depth: (depth + 1.1) * scale,
      opacity: ruin ? .24 : .53, innerOpacity: ruin ? .15 : .36,
    });
  }
  for (const {x, z, slot} of foundations) {
    // Houses and watchtowers have finished stonework in their own art.
    if (slot !== 'tower') continue;
    const {width, depth, rear} = FORMS.tower, footZ = z - rear, height = .10;
    // The gun carriage is painted just behind its selection anchor.
    const outside = corners(x, footZ, width, depth);
    if (outside.some(([gx, gz]) => surfaceClass(ISLAND_PLACE, gx, gz) === 0)) continue;
    const inset = corners(x, footZ, width - .10, depth - .10);
    const top = inset.map(([gx, gz]) => vertex(gx, gz, height, CAP));
    // From this fixed ground projection the front and right cut faces carry the height.
    for (const [edge, tint] of [[2, EAST], [3, EAST], [4, FRONT], [5, FRONT], [6, FRONT]]) {
      const next = edge + 1, [ax, az] = outside[edge], [bx, bz] = outside[next];
      const footA = vertex(ax, az, 0, tint), footB = vertex(bx, bz, 0, tint);
      const lipA = vertex(ax, az, height * .60, BEVEL), lipB = vertex(bx, bz, height * .60, BEVEL);
      quad(footA, footB, lipB, lipA);
      quad(lipA, lipB, top[next], top[edge]);
      // Mortar joints break the longest faces into blocks below the bevel.
      if (edge === 2 || edge === 4) {
        const joints = edge === 2 ? [.50] : [.34, .68];
        for (const start of joints) {
          const end = start + .018;
          const x1 = ax + (bx - ax) * start, z1 = az + (bz - az) * start;
          const x2 = ax + (bx - ax) * end, z2 = az + (bz - az) * end;
          quad(vertex(x1, z1, 0, MORTAR), vertex(x2, z2, 0, MORTAR),
            vertex(x2, z2, height * .58, MORTAR), vertex(x1, z1, height * .58, MORTAR));
        }
      }
    }
    for (let i = 1; i < top.length - 1; i++) indices.push(top[0], top[i], top[i + 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  return geometry;
}

export function makeBuildingFoundations(root) {
  let mesh = null, current = '';
  return {
    show(items) {
      const foundations = items.filter(({slot, x, z}) => Object.hasOwn(FORMS, slot)
        && Number.isFinite(x) && Number.isFinite(z));
      if (!foundations.length) {
        if (mesh) mesh.visible = false;
        return;
      }
      const key = JSON.stringify(foundations);
      if (key !== current) {
        const geometry = geometryOf(foundations);
        if (mesh) {
          mesh.geometry.dispose();
          mesh.geometry = geometry;
        } else {
          const material = new THREE.MeshBasicMaterial({vertexColors: true, transparent: true,
            side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false});
          material.forceSinglePass = true;
          mesh = new THREE.Mesh(geometry, material);
          mesh.name = 'island-building-foundations';
          mesh.renderOrder = 21;
          mesh.frustumCulled = false;
          mesh.raycast = () => {};
          root.add(mesh);
        }
        current = key;
      }
      mesh.visible = true;
    },
    dispose() {
      if (!mesh) return;
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh = null;
      current = '';
    },
  };
}
