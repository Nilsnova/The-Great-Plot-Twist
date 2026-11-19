import {campaignOf} from '../campaign/index.js';
import {blocksAsTower} from '../pirates/tower-obstacles.js';
import {prepareApproachTowers} from './coverage-model.js';
import {nextWaveNumber} from './preparation-model.js';
import {defenses} from './spots.js';

const FULL_HP = 1_000_000;

function acceptedHealth(defense, rows) {
  const row = rows.get(defense.id);
  if (!row || row.kind !== defense.kind || row.level !== defense.level
    || !Number.isInteger(row.hpUnits) || row.hpUnits < 0 || row.hpUnits > FULL_HP
    || !Number.isFinite(row.maxHP) || row.maxHP <= 0) return null;
  return {id: defense.id, hp: row.maxHP * row.hpUnits / FULL_HP, maxHp: row.maxHP};
}

/** Only a valid local Move can substitute a position. Health always belongs to the saved building. */
export function approachSnapshot({target, island, draft, recovery, needsRecovery, legacyWalls, needsLegacyWalls, defensesV2}) {
  const rows = new Map((recovery?.structures ?? []).map(row => [row.spot, row]));
  const statusById = new Map(), stateWalls = [], stateTowers = [];
  let routesKnown = true;
  const layout = defenses(island.spots ?? [], campaignOf(island).research.tiers).map(defense => {
    const health = acceptedHealth(defense, rows);
    const wall = defense.kind === 'wall';
    if (health) (wall ? stateWalls : stateTowers).push(health);
    statusById.set(defense.id, health ? (health.hp > 0 ? 'ready' : 'destroyed') : needsRecovery ? 'unknown' : 'ready');
    const legacy = wall ? legacyWalls?.get(defense.id)?.health : undefined;
    const legacyKnown = Number.isInteger(legacy) && legacy >= 0 && legacy <= 100;
    const missingRecoveryObstacle = needsRecovery && !health && (wall || blocksAsTower(defense.kind));
    if (missingRecoveryObstacle || (wall && needsLegacyWalls && !legacyKnown)) routesKnown = false;
    const moved = draft?.spotId === defense.id && draft.ok && !draft.message
      && Number.isFinite(draft.x) && Number.isFinite(draft.z);
    return {...defense, ...(moved ? {x: draft.x, z: draft.z} : {}), ...(legacyKnown ? {health: legacy} : {})};
  });
  const towers = prepareApproachTowers(layout, {defensesV2, statusById});
  const wave = nextWaveNumber(island.nextWave, island.waveBest);
  const complete = Array.isArray(island.spots) && (target === 'ships' || routesKnown);
  const version = JSON.stringify([island.code, island.islandEpoch ?? null, target, wave, layout, stateWalls, stateTowers, towers, complete]);
  return {target, wave, defenses: layout, stateWalls, stateTowers, towers, complete, version};
}
