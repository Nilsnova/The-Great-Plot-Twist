// Read-only support at a confirmed house and, when still legal, its proposed Move position.
import {barracksPosts, inHouseReach} from '../campaign/houses.js';
import {LEGACY_RECOVERY_VERSION, STRUCTURE_RECOVERY_VERSION} from '../pirates/recovery-policy.js';
import {CONFIG, houseRoles} from '../pirates/sim.js';
import {checkMove, positionsOf} from './placement.js';
import {defenses} from './spots.js';

const {barracks, tavern, workshop} = CONFIG.houses;

function supportEffect(role, recoveryVersion) {
  if (role === 'workshop' && recoveryVersion !== LEGACY_RECOVERY_VERSION) {
    return {status: recoveryVersion === STRUCTURE_RECOVERY_VERSION ? 'inactive' : 'unknown-policy', effect: null};
  }
  if (role === 'tavern') {
    return {status: 'active', effect: {target: 'captain', phase: 'wave',
      hpPerSecond: tavern.heal, maximumHpPerSecond: tavern.max, islandReviveDiscountPercent: tavern.revive}};
  }
  return {status: 'active', effect: {target: role === 'barracks' ? 'boarder' : 'wall', phase: 'wave'}};
}

function supportAt(house, status, roles, installed, captains) {
  const {id, x, z, role} = house;
  if (status !== 'active') return {x, z, areas: [], beneficiaries: status === 'inactive' ? [] : null};
  if (role === 'barracks') {
    const sources = roles.filter(row => row.role === 'barracks').map(row => row.id === id ? house : row);
    const areas = [];
    for (const post of barracksPosts(sources, barracks)) {
      if (post.house.id !== id) continue;
      areas.push({x: post.x, z: post.z, radius: barracks.guard, leashRadius: barracks.leash});
    }
    return {x, z, areas, beneficiaries: [], militiaAtWaveStart: areas.length};
  }
  if (role === 'tavern') {
    const beneficiaries = Array.isArray(captains) ? captains
      .filter(captain => typeof captain?.id === 'string' && captain.present === true && captain.down === false
        && Number.isFinite(captain.x) && Number.isFinite(captain.z) && inHouseReach(house, captain, tavern.radius))
      .map(({id, x, z, hp, maxHp}) => ({id, kind: 'captain', x, z,
        needsHealing: Number.isFinite(hp) && Number.isFinite(maxHp) ? hp < maxHp : null})) : null;
    return {x, z, areas: [{x, z, radius: tavern.radius}], beneficiaries};
  }
  const beneficiaries = installed.filter(row => row.kind === 'wall' && inHouseReach(house, row, workshop.radius))
    .map(({id, kind, x, z}) => ({id, kind, x, z}));
  return {x, z, areas: [{x, z, radius: workshop.radius}], beneficiaries};
}

/**
 * Spots are the current accepted island rows. Optional captains carry known world coordinates,
 * presence and down state. A null beneficiary list means the source facts are unavailable.
 */
export function previewHouseSupport({houseId, spots = [], recoveryVersion = null, captains = null, move = null, phase = 'planning'} = {}) {
  if (!Array.isArray(spots)) return null;
  const installed = defenses(spots), roles = houseRoles(installed), house = roles.find(row => row.id === houseId);
  if (!house) return null;
  const {role, level} = house, {status, effect} = supportEffect(role, recoveryVersion);
  const current = supportAt(house, status, roles, installed, captains);
  let proposed = null, changes = null;
  if (status === 'active' && phase === 'planning' && move?.spotId === houseId && move.ok === true
    && !move.busy && !move.message && (move.x !== house.x || move.z !== house.z)
    && checkMove(houseId, move.x, move.z, positionsOf(spots)).ok) {
    proposed = supportAt({...house, x: move.x, z: move.z}, status, roles, installed, captains);
    if (current.beneficiaries && proposed.beneficiaries) {
      const before = new Set(current.beneficiaries.map(item => item.id));
      const after = new Set(proposed.beneficiaries.map(item => item.id));
      changes = {added: proposed.beneficiaries.filter(item => !before.has(item.id)),
        removed: current.beneficiaries.filter(item => !after.has(item.id))};
    }
  }
  return {id: houseId, role, level, status, effect, current, proposed, changes};
}
