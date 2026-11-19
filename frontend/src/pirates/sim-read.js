// The wave simulation's small pure helpers (sim.js): the seeded dice (mulberry32), the canonical coast, and the
// readers that turn createWave's options (defenses, coast, lanes, heart, crew) into checked values. No state.

import { CONFIG } from './sim-config.js';
import { readBonus, readSpec } from '../campaign/tech.js';
import { readHealth } from './wall-health.js';
import { readTree } from './tower-trees.js';

const KINDS = new Set(['wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel', 'watchtower', 'house']);
const PRIMARY_TARGETS = {
  cannon: ['ships', 'boarders'],
  mortar: ['ships', 'boarders'],
  harpoon: ['sailing-ships'],
  culverin: ['ships'],
  swivel: ['boarders'],
};
export const isAttackTower = kind => Object.hasOwn(PRIMARY_TARGETS, kind);
export const finite = value => typeof value === 'number' && Number.isFinite(value);
export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const round2 = value => Math.round(value * 100) / 100;
export const distance = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };

// mulberry32: a tiny, well-mixed 32-bit generator.
export function createRandom(seed) {
  let state = seedNumber(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seedNumber(seed) {
  if (finite(seed)) return Math.trunc(seed);
  let hash = 2166136261; // FNV-1a over the text, so a string seed works too
  for (const char of String(seed ?? '')) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return hash;
}

// A point on the canonical coast (surfaces.js), `radius` coast radii out at angle `a`.
export function coastPoint(a, radius = 1, coast = CONFIG.coast) {
  const edge = 1 + .055 * Math.sin(a * 5 + coast.seed) + .035 * Math.cos(a * 7);
  return { x: coast.rx * edge * radius * Math.cos(a), z: coast.rz * edge * radius * Math.sin(a) };
}

// culverin: false (the default) drops every culverin, as a sim that does not know the kind would (T43: only a wave
// whose rules say "defenses_v2" fights with one, so every client of a wave fights the same island).
export function readDefenses(list, { culverin = false } = {}) {
  const seen = new Set(), out = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || seen.has(item.id)) continue;
    if (!KINDS.has(item.kind) || !finite(item.x) || !finite(item.z)) continue;
    if (item.kind === 'culverin' && !culverin) continue;
    const levels = CONFIG.levels[item.kind].length, level = Number.isInteger(item.level) ? clamp(item.level, 1, levels) : 1;
    const spec = readSpec(item.kind, item.spec); // a skill of another kind is no skill
    const bonus = readBonus(item.kind, item.bonus); // the island's tier-2 pick for this kind (GAME-V3.md §5.1)
    const health = item.kind === 'wall' ? readHealth(item.health) : 100; // D039: 0..100, whole without one
    const tree = level === levels ? readTree(item.kind, item.tree) : null; // D055: a tree grows on a level-5 tower only
    const recoveredHp = Number.isInteger(item.hpUnits) && item.hpUnits >= 0 && item.hpUnits <= 1_000_000
      && finite(item.maxHP) && item.maxHP > 0 && typeof item.instanceId === 'string'
      && Number.isInteger(item.repairSeq) && item.repairSeq >= 0
      ? { hpUnits: item.hpUnits, maxHP: item.maxHP, instanceId: item.instanceId, repairSeq: item.repairSeq } : {};
    seen.add(item.id); out.push({ id: item.id, kind: item.kind, level, x: item.x, z: item.z, ...(spec ? { spec } : {}), ...(bonus ? { bonus } : {}), ...(health < 100 ? { health } : {}),
      ...recoveredHp,
      ...(tree ? { tree } : {}) });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// The numbers of a defense's skill: its tier-1 skill (or capstone) as CONFIG.specs says, or as its island's
// drill (tier 2) replaces them. {} for no skill.
export function skillOf(item, C = CONFIG) {
  return { ...(C.specs[item?.spec] ?? {}), ...(C.research[item?.bonus]?.[item?.spec] ?? {}) };
}
export const bonusOf = (item, key, C = CONFIG) => C.research[item?.bonus]?.[key] ?? 1;

export const lookoutsOf = defenses => defenses.filter(item => item.kind === 'watchtower');
export const lookoutsWith = (lookouts, spec) => lookouts.filter(item => item.spec === spec).map(item => ({ ...item, skill: skillOf(item) }));
export const reach = (list, item) => list.find(tower => distance(tower.x, tower.z, item.x, item.z) <= tower.skill.radius);

export function attackRanges(lookouts) {
  const towerBonus = Math.max(0, ...lookouts.map(item => round2(CONFIG.levels.watchtower[item.level - 1].range * bonusOf(item, 'range'))));
  const eagles = lookoutsWith(lookouts, 'eagle_eye');
  return { towerBonus, rangeFor(item, baseRange, specRange) {
    const eagle = reach(eagles, item)?.skill.range ?? 1;
    // Culverins and swivels receive nearby Eagle eye but omit the global Watchtower bonus.
    if (item.kind === 'culverin' || item.kind === 'swivel') return round2(baseRange * eagle + specRange);
    const upgraded = item.kind === 'cannon' ? baseRange * bonusOf(item, 'range') : baseRange;
    return round2((upgraded + towerBonus) * eagle + specRange);
  } };
}

export function coverageProfile({ id, kind, level, x, z }, range) {
  return { id, kind, level, x, z, range, minRange: CONFIG[kind]?.minRange ?? 0, targets: [...PRIMARY_TARGETS[kind]] };
}

function clearWeatherCoverage(item, rangeFor) {
  const { kind, level } = item;
  const range = rangeFor(item, CONFIG.levels[kind][level - 1].range, skillOf(item).range ?? 0);
  return coverageProfile(item, range);
}

/** The selected defense's clear-weather primary acquisition geometry. Actual sight and target eligibility are wave rules. */
export function previewDefenseCoverage(defenses, selectedId, { defensesV2 = false } = {}) {
  const items = readDefenses(defenses, { culverin: defensesV2 === true });
  const item = items.find(row => row.id === selectedId && isAttackTower(row.kind));
  return item ? clearWeatherCoverage(item, attackRanges(lookoutsOf(items)).rangeFor) : null;
}

/** Clear-weather acquisition geometry for the same installed defenses as the selected preview. */
export function previewDefenseCoverages(defenses, { defensesV2 = false } = {}) {
  const items = readDefenses(defenses, { culverin: defensesV2 === true });
  const { rangeFor } = attackRanges(lookoutsOf(items));
  return items.filter(item => isAttackTower(item.kind)).map(item => clearWeatherCoverage(item, rangeFor));
}

// Another island's coast (Pirate Point on lighthouse_isle): {rx, rz, seed}, else the home_islet coast.
export function readCoast(coast) {
  if (!coast || typeof coast !== 'object') return CONFIG.coast;
  const { rx, rz, seed } = coast;
  if (![rx, rz].every(value => finite(value) && value >= 5 && value <= 60) || !finite(seed)) return CONFIG.coast;
  return { rx, rz, seed };
}
// Other sea lanes: 1 to 4 of {id, bearing in degrees}, else CONFIG.lanes.
export function readLanes(lanes) {
  if (!Array.isArray(lanes) || lanes.length < 1 || lanes.length > 4) return CONFIG.lanes;
  const out = lanes.filter(lane => lane && typeof lane.id === 'string' && lane.id && finite(lane.bearing))
    .map(lane => ({ id: lane.id, bearing: lane.bearing }));
  return out.length === lanes.length && new Set(out.map(lane => lane.id)).size === out.length ? out : CONFIG.lanes;
}

// The island's heart the boarders walk to: {x, z, ring?} in island-local units, else CONFIG.boarding.heart.
export function readHeart(heart) {
  const fallback = CONFIG.boarding.heart;
  if (!heart || typeof heart !== 'object' || ![heart.x, heart.z].every(value => finite(value) && Math.abs(value) <= 60)) return fallback;
  const ring = finite(heart.ring) && heart.ring >= 0 && heart.ring <= 40 ? heart.ring : fallback.ring;
  return { x: heart.x, z: heart.z, ring };
}
export const angleGap = (a, b) => Math.abs(((a - b) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);

const count01 = (value, max) => (Number.isInteger(value) ? clamp(value, 0, max) : 0);
export function readCrew(crew) {
  const C = CONFIG.crew;
  // Guards (D052) only appear in the crew when hired, so a wave without guards keeps its exact old state.
  const guard = count01(crew?.guard, C.guard.max);
  return { gunner: count01(crew?.gunner, C.gunner.max), carpenter: count01(crew?.carpenter, C.carpenter.max),
    lookout: count01(crew?.lookout, C.lookout.max), ...(guard ? { guard } : {}) };
}
