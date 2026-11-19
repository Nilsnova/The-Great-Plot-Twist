// Classify geometric reach at supplied approach samples. This does not choose routes or predict combat.
import { CONFIG, coastPoint, previewDefenseCoverages } from '../pirates/sim.js';

const SAMPLE_TARGETS = new Set(['boarders', 'sailing-ships', 'anchored-ships']);
const MATCH_RANK = {uncovered: 0, unknown: 1, conditional: 2, covered: 3};
const SEA_LANES = 4;
const SEA_SAMPLES_PER_LANE = 8;

/** Clear-weather geometry with independently confirmed availability for the current or drafted layout. */
export function prepareApproachTowers(defenses, {defensesV2 = false, statusById} = {}) {
  return previewDefenseCoverages(defenses, {defensesV2}).map(tower => {
    const status = statusById?.get(tower.id);
    return {...tower, status: status === 'ready' || status === 'destroyed' ? status : 'unknown'};
  });
}

function match(sample, tower) {
  if (tower.status === 'destroyed' || tower.status === 'locked') return null;
  if (!tower.targets.includes(sample.target) && (sample.target === 'boarders' || !tower.targets.includes('ships'))) return null;

  const dx = sample.x - tower.x, dz = sample.z - tower.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  const direct = distance >= tower.minRange && distance <= tower.range;
  const lit = Number.isFinite(tower.litRange) && distance >= tower.minRange && distance <= tower.litRange;
  if (!direct && !lit) return null;

  if (tower.status === 'ready') return direct && !(tower.reload > 1e-9) ? 'covered' : 'conditional';
  if (tower.status === 'jammed' || tower.status === 'silenced' || tower.status === 'disabled') return 'conditional';
  return 'unknown';
}

/**
 * Inspect known sample points against planning or live BASE-15 records. A gap requires complete data.
 * Only the defenses supporting the selected status are returned. Geometry and route metadata are preserved.
 */
export function classifyApproach(samples, towers, {complete = false} = {}) {
  return samples.map(sample => {
    let status = complete ? 'uncovered' : 'unknown';
    let towerIds = [];
    if (sample.unresolved || !SAMPLE_TARGETS.has(sample.target) || ![sample.x, sample.z].every(Number.isFinite)) {
      return {...sample, status: 'unknown', towerIds};
    }
    for (const tower of towers) {
      const next = match(sample, tower);
      if (!next || MATCH_RANK[next] < MATCH_RANK[status]) continue;
      if (next !== status) {
        status = next;
        towerIds = [];
      }
      towerIds.push(tower.id);
    }
    return {...sample, status, towerIds};
  });
}

/** Points on the standard sailing centerlines. Wave jitter and special ships may use different routes. */
export function sampleSeaApproaches(lanes = CONFIG.lanes, coast = CONFIG.coast) {
  if (!Array.isArray(lanes) || !coast) return [];
  const samples = [], laneIds = new Set();
  for (const lane of lanes.slice(0, SEA_LANES)) {
    if (!lane?.id || !Number.isFinite(lane.bearing) || laneIds.has(lane.id)) continue;
    const angle = lane.bearing * Math.PI / 180;
    const from = coastPoint(angle, CONFIG.spawnRadius, coast), to = coastPoint(angle, CONFIG.stopRadius, coast);
    if (![from.x, from.z, to.x, to.z].every(Number.isFinite)) continue;

    laneIds.add(lane.id);
    for (let i = 0; i < SEA_SAMPLES_PER_LANE; i++) {
      const share = (i + .5) / SEA_SAMPLES_PER_LANE;
      samples.push({id: `${lane.id}:${i}`, laneId: lane.id, target: 'sailing-ships',
        x: from.x + (to.x - from.x) * share, z: from.z + (to.z - from.z) * share});
    }
  }
  return samples;
}
