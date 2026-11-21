// Ground contact at Home's existing building anchors. The whole layer is decorative.
import * as THREE from 'three';
import {appendGroundShadow} from '../world/ground-shadow.js';
import {projectGround, unprojectGround} from '../world/projection.js';
import {surfaceClass} from '../world/places/surfaces.js';
import {ISLAND_PLACE} from './spots.js';
import {padCorners as corners, TOWER_PAD} from './defense-display.js';
import {foundationMaterial, FOOTING} from './foundation-finish.js';

const FORMS = {
  house: {width: 1.36, depth: .86, rear: .46, reach: 1.61, roof: 'gable', plinth: .068},
  watchtower: {width: 1.17, depth: .90, rear: .52, reach: 2.53, roof: 'tower', plinth: .098, cornerInset: .10},
  tower: {...TOWER_PAD, reach: .81, plinth: .145},
  heart: {width: 2.03, depth: 1.20, rear: .59, reach: 1.89, roof: 'gable', plinth: .044, cornerInset: .15},
  island_cabin: {width: 1.55, depth: .98, rear: .52, reach: 1.92, roof: 'gable', plinth: .062},
  island_bell: {width: .96, depth: .66, rear: .31, reach: 1.31, roof: 'gable', plinth: .070},
  island_arsenal: {width: 1.56, depth: .94, rear: .50, reach: 2.16, roof: 'gable', plinth: .054, cornerInset: .17},
  island_harbor: {width: 1.52, depth: .95, rear: .48, reach: 1.85, roof: 'gable', plinth: .048, cornerInset: .15},
  island_techhub: {width: 1.72, depth: 1.16, rear: .58, reach: 2.28, roof: 'hip', plinth: .051, cornerInset: .38},
};
const RETAINING_STONE = [0xc3a47b, 0xb0916b, 0x9a7f61, 0x80694f, 0x726049].map(hex => new THREE.Color(hex));
const [SHOULDER, RETAINING_FRONT, RETAINING_SIDE, RETAINING_JOINT, EMBEDDED_STONE] = RETAINING_STONE;
const LIMESTONE = [0xded0ad, 0xe8d6b1, 0xc7b89d, 0xd7c09c, 0xe1cca8].map(hex => new THREE.Color(hex));
const GROUT = new THREE.Color(0x74654e), LIP = new THREE.Color(0xdbc39c);
const SIDE_STONE = [[0x867661, 0xa99a7e], [0xb0906f, 0xcbb18a]].map(pair => pair.map(hex => new THREE.Color(hex)));
const ROW_OFFSETS = [.19, .38, .10], BLOCK_WIDTHS = [.58, .52, .43, .60, .48];
const PAD_FACES = [2, 3, 4, 5, 6];
const onLand = (x, z) => surfaceClass(ISLAND_PLACE, x, z) !== 0;
const MORTAR_FINISH = [0, 0, FOOTING.joint];
const APRON_BED = new THREE.Color(0x91876c);
const HEART_SHADE = new THREE.Color(0x354d42);
// The entry is sheltered under the roof and opens back into sun across the lowest step.
const HEART_SHADE_ROWS = [
  [-2.66, .97, 0], [-2.06, 1.07, .37], [-1.14, 1.14, .59], [-.1, .96, .41], [.47, .84, 0],
];

function clippedCorners(x, z, width, depth, trim) {
  // Widen the cut corners of the service aprons to follow their painted masonry.
  return corners(x, z, width, depth).map(([gx, gz], index) => {
    if (index % 4 < 2) return [gx + (gx < x ? trim : -trim), gz];
    return [gx, gz + (gz < z ? trim : -trim)];
  });
}

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
  const points = [], colors = [], finishes = [], indices = [];
  function vertex(x, z, rise, color, alpha = 1, light = 1, finish = MORTAR_FINISH) {
    const point = projectGround(x, z), index = points.length / 3;
    points.push(point.x, point.y + rise, rise);
    colors.push(color.r * light, color.g * light, color.b * light, alpha);
    finishes.push(...finish);
    return index;
  }
  function quad(a, b, c, d) { indices.push(a, b, c, a, c, d); }
  function shadePassage(x, z) {
    const crossSection = [-1, -.58, .58, 1];
    const rows = HEART_SHADE_ROWS.map(([depth, halfWidth, alpha]) => crossSection.map(across => vertex(
      x + halfWidth * across, z + depth, 0, HEART_SHADE, Math.abs(across) === 1 ? 0 : alpha, 1, [0, 0, FOOTING.shadow],
    )));
    for (let row = 1; row < rows.length; row++) for (let section = 1; section < crossSection.length; section++) {
      const rear = rows[row - 1], front = rows[row];
      quad(rear[section - 1], rear[section], front[section], front[section - 1]);
    }
  }

  // Ground shadows all go first, so a nearby occupied footing keeps its own highlights.
  for (const {x, z, slot, ruin} of foundations) {
    const {width, depth, rear, reach, roof} = FORMS[slot], scale = ruin ? .72 : 1;
    const footZ = z - rear + .13, halfWidth = (width + .08) * scale, halfDepth = (depth + .24) * scale;
    appendGroundShadow((gx, gz, tint, alpha, contact) => vertex(gx, gz, 0, tint, alpha, 1,
      [(gx - x) / halfWidth, (gz - footZ) / halfDepth, contact ? FOOTING.contact : FOOTING.shadow]), indices, {
      x, z: footZ, width: halfWidth, depth: halfDepth,
      reach: reach * (ruin ? .22 : 1), roof: ruin ? null : roof, opacity: ruin ? .51 : 1,
    });
    if (slot === 'heart' && !ruin) shadePassage(x, z);
  }
  for (const {x, z, slot, ruin} of foundations) {
    const {width, depth, rear, plinth: height, cornerInset = 0} = FORMS[slot], footZ = z - rear;
    const apron = slot !== 'tower';
    // A low dry apron gives the painted architecture a visible edge at the existing foot.
    if (!height || !onLand(x, z) || (ruin && apron)) continue;
    const outside = clippedCorners(x, footZ, width, depth, cornerInset);
    if (apron && outside.some(([gx, gz]) => !onLand(gx, gz))) continue;
    const toes = apron ? null : retainingToe(outside, x, z, footZ);
    if (toes) {
      const {lerp} = THREE.MathUtils;
      for (const edge of PAD_FACES) {
        const next = edge + 1, stone = edge < 4 ? RETAINING_SIDE : RETAINING_FRONT;
        const [ax, az] = outside[edge], [bx, bz] = outside[next], a = toes[edge], b = toes[next];
        if (a.height === 0 && b.height === 0) continue;
        const course = (across, fraction, tint, material) => {
          const gx = lerp(lerp(ax, bx, across), lerp(a.x, b.x, across), fraction);
          const gz = lerp(lerp(az, bz, across), lerp(a.z, b.z, across), fraction);
          const rise = lerp(a.height, b.height, across) * fraction;
          const projected = projectGround(gx, gz), behind = unprojectGround(projected.x, projected.y + rise);
          // The farther end embeds into the existing earth as the projected stone meets the top.
          const alpha = onLand(behind.x, behind.z) ? 1 - .85 * THREE.MathUtils.smoothstep(fraction, .36, 1) : 1;
          return vertex(gx, gz, rise, tint, alpha, 1, [across, 1 - fraction, material]);
        };
        const panel = (from, to, upper, lower, upperTint, lowerTint = upperTint, material = FOOTING.retaining) => quad(
          course(from, upper, upperTint, material), course(to, upper, upperTint, material),
          course(to, lower, lowerTint, material), course(from, lower, lowerTint, material),
        );
        panel(0, 1, 0, .41, SHOULDER, stone);
        panel(0, 1, .41, .46, RETAINING_JOINT, RETAINING_JOINT, FOOTING.joint);
        panel(0, 1, .46, 1, stone, EMBEDDED_STONE);
        if (Math.hypot(bx - ax, bz - az) > .55) {
          panel(.64, .689, .08, .41, RETAINING_JOINT, EMBEDDED_STONE, FOOTING.joint);
          panel(.34, .384, .46, .94, RETAINING_JOINT, EMBEDDED_STONE, FOOTING.joint);
        }
      }
    }
    const capWidth = width - .065, capDepth = depth - .065;
    const inset = clippedCorners(x, footZ, capWidth, capDepth, cornerInset);
    const lipAlpha = apron ? .78 : 1, footAlpha = apron ? .43 : 1;
    const top = inset.map(([gx, gz]) => vertex(gx, gz, height, LIP, lipAlpha, 1, [.5, 1, FOOTING.riser]));
    // From this fixed ground projection the front and right cut faces carry the height.
    for (const edge of PAD_FACES) {
      const next = edge + 1, [ax, az] = outside[edge], [bx, bz] = outside[next];
      const [face, shoulder] = SIDE_STONE[edge < 4 ? 0 : 1];
      const footA = vertex(ax, az, 0, GROUT, footAlpha, .79, [0, 0, FOOTING.riser]);
      const footB = vertex(bx, bz, 0, GROUT, footAlpha, .79, [1, 0, FOOTING.riser]);
      const lipA = vertex(ax, az, height * .76, shoulder, lipAlpha, 1, [0, .76, FOOTING.riser]);
      const lipB = vertex(bx, bz, height * .76, shoulder, lipAlpha, 1, [1, .76, FOOTING.riser]);
      quad(footA, footB, lipB, lipA);
      quad(lipA, lipB, top[next], top[edge]);
      const length = Math.hypot(bx - ax, bz - az);
      if (apron || length < .6) continue;
      const blocks = length > 1.2 ? 3 : 2;
      const side = (t, rise, tint, end) => vertex(ax + (bx - ax) * t, az + (bz - az) * t, height * rise, tint,
        1, 1, [end, rise, FOOTING.riser]);
      for (let block = 0; block < blocks; block++) {
        const from = block / blocks + .022, to = (block + 1) / blocks - .022;
        quad(side(from, .12, face, 0), side(to, .12, face, 1), side(to, .68, shoulder, 1), side(from, .68, shoulder, 0));
      }
    }
    // The grout bed and all dressed stone stay inside the existing octagonal pad.
    const bed = inset.map(([gx, gz]) => vertex(gx, gz, height, apron ? APRON_BED : GROUT, apron ? .77 : 1));
    for (let i = 1; i < bed.length - 1; i++) indices.push(bed[0], bed[i], bed[i + 1]);
    pavedCap(inset, x, footZ, capWidth, capDepth, (polygon, tint) => {
      const [cx, cz] = polygon.reduce(([sx, sz], [gx, gz]) => [sx + gx / polygon.length, sz + gz / polygon.length], [0, 0]);
      const bevel = polygon.map(([gx, gz]) => [gx + (cx - gx) * .18, gz + (cz - gz) * .18]);
      const xs = polygon.map(([gx]) => gx), zs = polygon.map(([, gz]) => gz);
      const minX = Math.min(...xs), minZ = Math.min(...zs);
      const width = Math.max(.025, Math.max(...xs) - minX), depth = Math.max(.025, Math.max(...zs) - minZ);
      const lit = ([gx, gz], rise, light) => {
        const contact = 1 - Math.min(1, Math.hypot((gx - x) / .86, (gz - footZ - .05) / .50));
        const edge = Math.max(Math.abs(gx - x) / capWidth, Math.abs(gz - footZ) / capDepth);
        // Irregular stones at the outer edge blend into the foot-worn grass of the same landing.
        const alpha = apron ? .96 - .22 * THREE.MathUtils.smoothstep(edge, .68, 1) : 1;
        return vertex(gx, gz, rise, tint, alpha, light * (1 - .31 * contact), [(gx - minX) / width, (gz - minZ) / depth, FOOTING.tread]);
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
  geometry.setAttribute('footingFinish', new THREE.Float32BufferAttribute(finishes, 3));
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
          mesh = new THREE.Mesh(geometry, foundationMaterial());
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
