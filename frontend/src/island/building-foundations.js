// Ground contact at Home's existing building anchors. The whole layer is decorative.
import * as THREE from 'three';
import {appendGroundShadow} from '../world/ground-shadow.js';
import {projectGround, unprojectGround} from '../world/projection.js';
import {surfaceClass} from '../world/places/surfaces.js';
import {ISLAND_PLACE} from './spots.js';

const FORMS = {
  house: {width: 1.36, depth: .86, rear: .46},
  watchtower: {width: 1.17, depth: .90, rear: .52},
  tower: {width: .98, depth: .64, rear: .31},
  heart: {width: 2.03, depth: 1.20, rear: .59},
  island_cabin: {width: 1.55, depth: .98, rear: .52},
  island_bell: {width: .96, depth: .66, rear: .31},
  island_arsenal: {width: 1.56, depth: .94, rear: .50},
  island_harbor: {width: 1.52, depth: .95, rear: .48},
  island_techhub: {width: 1.72, depth: 1.16, rear: .58},
};
const PALETTE = [0x283021, 0x666960, 0x96917a, 0xc4b185, 0xcbb68c, 0x655f51, 0xdec99f, 0xa7a38b].map(
  hex => new THREE.Color(hex),
);
const [SHADOW, EAST, FRONT, BEVEL, CAP, MORTAR, SUNLIT, LEE] = PALETTE;
const RETAINING_STONE = [0xc3a47b, 0xb0916b, 0x9a7f61, 0x80694f, 0x726049].map(hex => new THREE.Color(hex));
const [SHOULDER, RETAINING_FRONT, RETAINING_SIDE, RETAINING_JOINT, EMBEDDED_STONE] = RETAINING_STONE;
const PAD_FACES = [[2, EAST], [3, EAST], [4, FRONT], [5, FRONT], [6, FRONT]];
const onLand = (x, z) => surfaceClass(ISLAND_PLACE, x, z) !== 0;

function corners(x, z, width, depth) {
  const clip = .24;
  return [
    [x-width+clip,z-depth], [x+width-clip,z-depth], [x+width,z-depth+clip],
    [x+width,z+depth-clip], [x+width-clip,z+depth], [x-width+clip,z+depth],
    [x-width,z+depth-clip], [x-width,z-depth+clip],
  ];
}

// The pad stays under the original gun. Only its masonry below the rim tucks inland.
function retainingToe(outside, x, z, footZ) {
  if (outside.every(([gx, gz]) => onLand(gx, gz))) return null;
  const length = Math.hypot(x, z), shoreX = x / length, shoreZ = z / length;
  const base = outside.map(([gx, gz]) => [x + (gx - x) * .83, footZ + (gz - footZ) * .83]);
  let inshore = .19;
  // Shift the whole lower course together, so its corners never fold into the tower pin.
  while (base.some(([gx, gz]) => !onLand(gx - shoreX * inshore, gz - shoreZ * inshore)) && inshore < 2.4) inshore += .13;
  const height = -.9 - .35 * inshore;
  return base.map(([gx, gz], i) => {
    const [capX, capZ] = outside[i];
    return onLand(capX, capZ) ? {x: capX, z: capZ, height: 0}
      : {x: gx - shoreX * inshore, z: gz - shoreZ * inshore, height};
  });
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
    appendGroundShadow((gx, gz, alpha) => vertex(gx, gz, 0, SHADOW, slot === 'tower' && !onLand(gx, gz) ? 0 : alpha), indices, {
      x: x + .48, z: z - rear + .65, width: (width + .83) * scale, depth: (depth + 1.1) * scale,
      opacity: ruin ? .24 : .53, innerOpacity: ruin ? .15 : .36,
    });
  }
  for (const {x, z, slot} of foundations) {
    // Houses and watchtowers have finished stonework in their own art.
    if (slot !== 'tower') continue;
    const {width, depth, rear} = FORMS.tower, footZ = z - rear, height = .145;
    // The gun carriage is painted just behind its selection anchor.
    if (!onLand(x, z)) continue;
    const outside = corners(x, footZ, width, depth);
    const toes = retainingToe(outside, x, z, footZ);
    if (toes) {
      const {lerp} = THREE.MathUtils;
      for (const [edge] of PAD_FACES) {
        const next = edge + 1, stone = edge < 4 ? RETAINING_SIDE : RETAINING_FRONT;
        const [ax, az] = outside[edge], [bx, bz] = outside[next], a = toes[edge], b = toes[next];
        if (a.height === 0 && b.height === 0) continue;
        const course = (across, fraction, tint) => {
          const gx = lerp(lerp(ax, bx, across), lerp(a.x, b.x, across), fraction);
          const gz = lerp(lerp(az, bz, across), lerp(a.z, b.z, across), fraction);
          const rise = lerp(a.height, b.height, across) * fraction;
          const projected = projectGround(gx, gz), behind = unprojectGround(projected.x, projected.y + rise);
          // The farther end embeds into the existing earth as the projected stone meets the top.
          const alpha = onLand(behind.x, behind.z) ? 1 - .85 * THREE.MathUtils.smoothstep(fraction, .36, 1) : 1;
          return vertex(gx, gz, rise, tint, alpha);
        };
        const panel = (from, to, upper, lower, upperTint, lowerTint = upperTint) => quad(
          course(from, upper, upperTint), course(to, upper, upperTint), course(to, lower, lowerTint), course(from, lower, lowerTint),
        );
        panel(0, 1, 0, .41, SHOULDER, stone);
        panel(0, 1, .41, .46, RETAINING_JOINT);
        panel(0, 1, .46, 1, stone, EMBEDDED_STONE);
        if (Math.hypot(bx - ax, bz - az) > .55) {
          panel(.64, .689, .08, .41, RETAINING_JOINT, EMBEDDED_STONE);
          panel(.34, .384, .46, .94, RETAINING_JOINT, EMBEDDED_STONE);
        }
      }
    }
    const inset = corners(x, footZ, width - .10, depth - .10);
    const top = inset.map(([gx, gz], i) => vertex(gx, gz, height, i < 3 ? LEE : SUNLIT));
    // From this fixed ground projection the front and right cut faces carry the height.
    for (const [edge, tint] of PAD_FACES) {
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
    // Cut the cap into readable limestone blocks around the carriage. All corners and joints
    // stay inside the tower's existing 2 × 2 footprint, including beside joined walls.
    const inner = corners(x, footZ, width - .28, depth - .25);
    const cut = inner.map(([gx, gz]) => vertex(gx, gz, height, CAP));
    for (let edge = 0; edge < top.length; edge++) {
      const next = (edge + 1) % top.length;
      quad(top[edge], top[next], cut[next], cut[edge]);
      const [ax, az] = inset[edge], [bx, bz] = inner[edge];
      quad(vertex(ax, az, height, MORTAR, .72), vertex(ax + .022, az, height, MORTAR, .72),
        vertex(bx + .018, bz, height, MORTAR, .60), vertex(bx, bz, height, MORTAR, .60));
    }
    for (let i = 1; i < cut.length - 1; i++) indices.push(cut[0], cut[i], cut[i + 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  return geometry;
}

export function makeBuildingFoundations(root, name = 'island-building-foundations') {
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
          mesh.name = name;
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
