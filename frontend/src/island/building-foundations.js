// Ground contact at Home's existing building anchors. The whole layer is decorative.
import * as THREE from 'three';
import {appendGroundShadow} from '../world/ground-shadow.js';
import {projectGround, unprojectGround} from '../world/projection.js';
import {surfaceClass} from '../world/places/surfaces.js';
import {ISLAND_PLACE} from './spots.js';
import {padCorners as corners, TOWER_PAD} from './defense-display.js';

const FORMS = {
  house: {width: 1.36, depth: .86, rear: .46},
  watchtower: {width: 1.17, depth: .90, rear: .52},
  tower: TOWER_PAD,
  heart: {width: 2.03, depth: 1.20, rear: .59},
  island_cabin: {width: 1.55, depth: .98, rear: .52},
  island_bell: {width: .96, depth: .66, rear: .31},
  island_arsenal: {width: 1.56, depth: .94, rear: .50},
  island_harbor: {width: 1.52, depth: .95, rear: .48},
  island_techhub: {width: 1.72, depth: 1.16, rear: .58},
};
const SHADOW = new THREE.Color(0x313d25), CONTACT = new THREE.Color(0x25291c);
const RETAINING_STONE = [0xc3a47b, 0xb0916b, 0x9a7f61, 0x80694f, 0x726049].map(hex => new THREE.Color(hex));
const [SHOULDER, RETAINING_FRONT, RETAINING_SIDE, RETAINING_JOINT, EMBEDDED_STONE] = RETAINING_STONE;
const LIMESTONE = [0xcebea0, 0xdbcaac, 0xbeb094, 0xceb89b, 0xd5c3a5].map(hex => new THREE.Color(hex));
const GROUT = new THREE.Color(0x84765e), LIP = new THREE.Color(0xad9a7f);
const SIDE_STONE = [[0x8d826e, 0xb0a18a], [0x9b8d77, 0xb5a289]].map(pair => pair.map(hex => new THREE.Color(hex)));
const ROW_OFFSETS = [.19, .38, .10], BLOCK_WIDTHS = [.58, .52, .43, .60, .48];
const PAD_FACES = [2, 3, 4, 5, 6];
const onLand = (x, z) => surfaceClass(ISLAND_PLACE, x, z) !== 0;

function clipEdge(polygon, axis, limit, sign) {
  const clipped = [];
  for (let i = 0; i < polygon.length; i++) {
    const point = polygon[i], previous = polygon[(i + polygon.length - 1) % polygon.length];
    const inside = (point[axis] - limit) * sign >= 0, wasInside = (previous[axis] - limit) * sign >= 0;
    if (inside !== wasInside) {
      const t = (limit - previous[axis]) / (point[axis] - previous[axis]);
      clipped.push([THREE.MathUtils.lerp(previous[0], point[0], t), THREE.MathUtils.lerp(previous[1], point[1], t)]);
    }
    if (inside) clipped.push(point);
  }
  return clipped;
}

function pavedCap(outline, x, z, width, depth, tile) {
  // Staggered cuts keep the broad carriage deck legible at the mobile village zoom.
  for (const [row, offset] of ROW_OFFSETS.entries()) {
    const front = z - depth + row * depth * 2 / ROW_OFFSETS.length;
    const back = front + depth * 2 / ROW_OFFSETS.length;
    const alongRow = clipEdge(clipEdge(outline, 1, front + .023, 1), 1, back - .023, -1);
    for (let left = x - width - offset, column = 0; left < x + width; column++) {
      const right = left + BLOCK_WIDTHS[(row + column) % BLOCK_WIDTHS.length];
      const stone = clipEdge(clipEdge(alongRow, 0, left + .024, 1), 0, right - .024, -1);
      if (stone.length >= 3) tile(stone, LIMESTONE[(row * 3 + column * 7) % LIMESTONE.length]);
      left = right;
    }
  }
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
  function vertex(x, z, rise, color, alpha = 1, light = 1) {
    const point = projectGround(x, z), index = points.length / 3;
    points.push(point.x, point.y + rise, rise);
    colors.push(color.r * light, color.g * light, color.b * light, alpha);
    return index;
  }
  function quad(a, b, c, d) { indices.push(a, b, c, a, c, d); }

  // Ground shadows all go first, so a nearby occupied footing keeps its own highlights.
  for (const {x, z, slot, ruin} of foundations) {
    const {width, depth, rear} = FORMS[slot], scale = ruin ? .72 : 1;
    appendGroundShadow((gx, gz, alpha) => vertex(gx, gz, 0, SHADOW, slot === 'tower' && !onLand(gx, gz) ? 0 : alpha), indices, {
      x: x + .48, z: z - rear + .65, width: (width + .83) * scale, depth: (depth + 1.1) * scale,
      opacity: ruin ? .22 : .40, innerOpacity: ruin ? .12 : .26,
    });
    appendGroundShadow((gx, gz, alpha) => vertex(gx, gz, 0, CONTACT, slot === 'tower' && !onLand(gx, gz) ? 0 : alpha), indices, {
      x, z: z - rear + .15, width: (width + .11) * scale, depth: (depth + .26) * scale,
      opacity: ruin ? .20 : .50, innerOpacity: ruin ? .11 : .35,
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
      for (const edge of PAD_FACES) {
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
    const capWidth = width - .065, capDepth = depth - .065;
    const inset = corners(x, footZ, capWidth, capDepth);
    const top = inset.map(([gx, gz]) => vertex(gx, gz, height, LIP));
    // From this fixed ground projection the front and right cut faces carry the height.
    for (const edge of PAD_FACES) {
      const next = edge + 1, [ax, az] = outside[edge], [bx, bz] = outside[next];
      const [face, shoulder] = SIDE_STONE[edge < 4 ? 0 : 1];
      const footA = vertex(ax, az, 0, GROUT, 1, .79), footB = vertex(bx, bz, 0, GROUT, 1, .79);
      const lipA = vertex(ax, az, height * .76, shoulder), lipB = vertex(bx, bz, height * .76, shoulder);
      quad(footA, footB, lipB, lipA);
      quad(lipA, lipB, top[next], top[edge]);
      const length = Math.hypot(bx - ax, bz - az);
      if (length < .6) continue;
      const blocks = length > 1.2 ? 3 : 2;
      const side = (t, rise, tint) => vertex(ax + (bx - ax) * t, az + (bz - az) * t, height * rise, tint);
      for (let block = 0; block < blocks; block++) {
        const from = block / blocks + .022, to = (block + 1) / blocks - .022;
        quad(side(from, .12, face), side(to, .12, face), side(to, .68, shoulder), side(from, .68, shoulder));
      }
    }
    // The grout bed and all dressed stone stay inside the existing octagonal pad.
    const bed = inset.map(([gx, gz]) => vertex(gx, gz, height, GROUT));
    for (let i = 1; i < bed.length - 1; i++) indices.push(bed[0], bed[i], bed[i + 1]);
    pavedCap(inset, x, footZ, capWidth, capDepth, (polygon, tint) => {
      const [cx, cz] = polygon.reduce(([sx, sz], [gx, gz]) => [sx + gx / polygon.length, sz + gz / polygon.length], [0, 0]);
      const bevel = polygon.map(([gx, gz]) => [gx + (cx - gx) * .18, gz + (cz - gz) * .18]);
      const lit = ([gx, gz], rise, light) => {
        const underGun = 1 - Math.min(1, Math.hypot((gx - x) / .86, (gz - footZ - .05) / .50));
        return vertex(gx, gz, rise, tint, 1, light * (1 - .31 * underGun));
      };
      const rim = bevel.map(point => lit(point, height + .012, 1));
      for (let i = 1; i < rim.length - 1; i++) indices.push(rim[0], rim[i], rim[i + 1]);
      for (let i = 0; i < polygon.length; i++) {
        const next = (i + 1) % polygon.length, a = polygon[i], b = polygon[next];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const light = .97 + .24 * (dx - dz) / Math.max(.001, Math.hypot(dx, dz));
        quad(lit(a, height, light), lit(b, height, light), rim[next], rim[i]);
      }
    });
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
