// Declared local legacy demo inputs; this is not the production V1 durable recovery protocol.
import {spotById} from '../island/spots.js';
import {CREW} from '../island/td-rules.js';
import {onGrid} from '../island/placement.js';
const TOWERS = new Set(['cannon', 'mortar', 'harpoon', 'culverin', 'swivel']);
const FIELDS = new Set(['id', 'kind', 'level', 'x', 'z', 'health', 'spec', 'bonus', 'tree']);
const TOP = new Set(['version', 'waveId', 'wave', 'seed', 'startsAt', 'islandEpoch', 'pathing', 'perimeterWalls', 'defenses', 'crew']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const time = value => typeof value === 'number' ? value : Date.parse(value);
export function canonicalWallId(id) {
  const match = typeof id === 'string' ? /^wall_([1-9][0-9]{0,2})$/.exec(id) : null, number = match ? Number(match[1]) : 0;
  return number >= 1 && number <= 128 && id === `wall_${number}`;
}
export function readPerimeterDemo(value, info) {
  if (!object(value) || Object.keys(value).some(key => !TOP.has(key)) || value.version !== 1
    || value.pathing !== true || value.perimeterWalls !== true || !info || info.flagship === true
    || (info.recoveryVersion ?? 0) !== 0 || (info.waveProtocol ?? 1) !== 1
    || typeof value.waveId !== 'string' || !value.waveId || value.waveId.length > 64
    || !Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff
    || !Number.isInteger(value.wave) || value.wave < 1 || value.wave > 100
    || value.waveId !== info.waveId || value.seed !== info.seed || value.wave !== info.wave
    || typeof value.startsAt !== 'string' || !Number.isFinite(time(value.startsAt))
    || time(value.startsAt) !== (info.startsAtMs ?? time(info.startsAt))
    || typeof value.islandEpoch !== 'string' || value.islandEpoch.length !== 36 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.islandEpoch)
    || !Array.isArray(value.defenses) || value.defenses.length > 142 || !object(value.crew)
    || Object.keys(value.crew).sort().join() !== Object.keys(CREW).sort().join()) return null;
  const crew = {};
  for (const [kind, rules] of Object.entries(CREW)) {
    const count = value.crew[kind];
    if (!Number.isSafeInteger(count) || count < 0 || count > rules.max) return null;
    crew[kind] = count;
  }
  const defenses = [], ids = new Set();
  for (const row of value.defenses) {
    const spot = spotById(row?.id);
    if (!object(row) || Object.keys(row).some(key => !FIELDS.has(key)) || !spot || spot.id !== row.id || ids.has(row.id)
      || (spot.slot === 'tower' ? !TOWERS.has(row.kind) : spot.slot !== row.kind)
      || !Number.isSafeInteger(row.level) || row.level < 1 || row.level > 5 || !onGrid(row.x) || !onGrid(row.z)
      || (row.health !== undefined && (!Number.isInteger(row.health) || row.health < 0 || row.health > 100))) return null;
    for (const field of ['spec', 'bonus']) if (row[field] !== undefined && (typeof row[field] !== 'string' || row[field].length > 40)) return null;
    if (row.tree !== undefined && (!object(row.tree) || Object.keys(row.tree).sort().join() !== 'a,b'
      || ![row.tree.a, row.tree.b].every(n => Number.isInteger(n) && n >= 0 && n <= 3))) return null;
    ids.add(row.id);
    defenses.push(Object.freeze({...row, ...(row.tree ? {tree: Object.freeze({...row.tree})} : {})}));
  }
  return Object.freeze({...value, defenses: Object.freeze(defenses), crew: Object.freeze(crew)});
}
