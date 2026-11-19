// Presentation only. The saved spot still owns placement, reach and combat.
import {surfaceClass} from '../world/places/surfaces.js';
import {FOOTPRINTS, KEEP_OUT, overlaps} from './placement.js';
import {ISLAND_PLACE, spotById} from './spots.js';
import {WALL_OBSTACLES} from './wall-obstacles.js';

export const TOWER_PAD = Object.freeze({width: .98, depth: .64, rear: .31});
const CLEARANCE = .86, INCREMENT = .125, MAX_INSET = 2.75;
const BEARINGS = [0, -.39, .39, -.79, .79, -1.18, 1.18];
const isGun = kind => ['cannon', 'mortar', 'harpoon', 'culverin', 'swivel'].includes(kind);

export function padCorners(x, z, width, depth) {
  const clip = .24;
  return [
    [x-width+clip,z-depth], [x+width-clip,z-depth], [x+width,z-depth+clip], [x+width,z+depth-clip],
    [x+width-clip,z+depth], [x-width+clip,z+depth], [x-width,z+depth-clip], [x-width,z-depth+clip],
  ];
}

function hasShoreGap(x, z) {
  const {width, depth, rear} = TOWER_PAD;
  return padCorners(x, z - rear, width + CLEARANCE, depth + CLEARANCE)
    .every(([gx, gz]) => surfaceClass(ISLAND_PLACE, gx, gz));
}

function padAt(x, z) {
  const {width, depth, rear} = TOWER_PAD;
  return {x, z: z - rear, w: 2 * width, d: 2 * depth};
}

function clearOf({x, z, w, d}, obstacle) {
  if (!obstacle.radius) return !overlaps({x, z, w, d}, obstacle);
  return Math.hypot(Math.max(0, Math.abs(x - obstacle.x) - w / 2),
    Math.max(0, Math.abs(z - obstacle.z) - d / 2)) >= obstacle.radius;
}

export function defenseDisplayAnchors(place, structures) {
  const anchors = new Map();
  if (place !== ISLAND_PLACE) return anchors;

  const buildings = structures.filter(item => Number.isFinite(item.x) && Number.isFinite(item.z))
    .map(item => {
      const size = FOOTPRINTS[spotById(item.id)?.slot ?? item.kind];
      return {...item, w: size ?? FOOTPRINTS.tower, d: size ?? FOOTPRINTS.tower};
    });
  const obstacles = [...KEEP_OUT, ...WALL_OBSTACLES, ...buildings];
  const guns = buildings.filter(item => isGun(item.kind)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const gun of guns) {
    const {x, z} = gun;
    if (!surfaceClass(ISLAND_PLACE, x, z) || hasShoreGap(x, z)) continue;
    const inward = Math.atan2(-z, -x);
    let point;
    for (let shift = INCREMENT; shift <= MAX_INSET && !point; shift += INCREMENT) {
      for (const turn of BEARINGS) {
        const gx = x + Math.cos(inward + turn) * shift, gz = z + Math.sin(inward + turn) * shift;
        if (!hasShoreGap(gx, gz)) continue;
        const pad = padAt(gx, gz);
        if (obstacles.every(item => item.id === gun.id || clearOf(pad, item))) {
          point = {x: gx, z: gz}; obstacles.push(pad); break;
        }
      }
    }
    if (point) anchors.set(gun.id, point);
  }
  return anchors;
}
