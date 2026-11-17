// Local fake builder transactions. PostgreSQL locking and V1 recovery are independent proofs.
import {checkMove, onGrid, positionsOf} from './placement.js';
import {wallPolicy} from './wall-policy.js';
import {ENGINEER_DISCOUNT} from '../pirates/captain-ids.js';
const POLICY = Object.freeze({wallRuleVersion: 1, wallCapacity: 128});
const UID = /^[A-Za-z0-9_-]{8,64}$/;
export const fakeEngineerPrice = (price, role) => role === 'engineer' ? Math.max(1, Math.floor((price * (100 - ENGINEER_DISCOUNT) + 50) / 100)) : price;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const epochOf = island => island.wallEpoch ??= globalThis.crypto.randomUUID();
const copy = rows => rows.map(row => ({...row}));
const exact = (row, fields) => row && typeof row === 'object' && !Array.isArray(row) && Object.keys(row).sort().join() === [...fields].sort().join();

export function createFakeWallRuns({player, target, rows, answer, isOwner, guard, canBuild, unitPrice, paidFor, refuse, layout}) {
  const bad = message => refuse(422, 'validation_error', message);
  function policyOf(island) {
    const policy = wallPolicy(island.wallPolicy);
    if (!policy) refuse(503, 'layout_unavailable', 'Wall placement rules could not be read. Reload the island.');
    return policy;
  }
  function quoteOn(island, cells) {
    if (policyOf(island).wallRuleVersion !== 1) refuse(409, 'wall_policy_required', 'Open wall construction first.');
    guard(island);
    if (!Array.isArray(cells) || cells.length < 1 || cells.length > 32) bad('Build from 1 to 32 wall pieces at a time.');
    const free = Array.from({length: 128}, (_, i) => `wall_${i + 1}`).filter(id => !island.built.has(id));
    if (free.length < cells.length) refuse(409, 'wall_capacity', 'There are not enough wall pieces left.');
    const placements = cells.map((cell, index) => {
      if (!exact(cell, ['x', 'z']) || !onGrid(cell.x) || !onGrid(cell.z)) bad('Pick exact squares of the build grid.');
      if (index) {
        const before = cells[index - 1], dx = Math.abs(cell.x - before.x), dz = Math.abs(cell.z - before.z);
        if (!((dx === 2 && dz === 0) || (dx === 0 && dz === 2))) refuse(409, 'disconnected_run', 'Each wall must share an edge with the previous piece.');
      }
      const spot = free[index];
      if (!canBuild(island, spot)) refuse(409, 'locked', 'Win more waves to unlock these wall pieces.');
      return {spot, x: cell.x, z: cell.z};
    });
    const occupied = positionsOf(rows(island));
    // Original empty sites selected by this run cease reserving their former cells together.
    for (const {spot} of placements) delete occupied[spot];
    for (const {spot, x, z} of placements) {
      const verdict = checkMove(spot, x, z, occupied, layout(island));
      if (!verdict.ok) refuse(verdict.code === 'off_grid' ? 422 : 409, verdict.code, verdict.message);
      occupied[spot] = {x, z};
    }
    const unitCost = unitPrice(island);
    return {placements, unitCost, totalCost: unitCost * placements.length, remaining: free.length - placements.length, islandEpoch: epochOf(island), ...POLICY};
  }
  return {
    enable({code} = {}) {
      const island = target(code); // Target resolves current membership before any state or receipt read.
      if (!isOwner(island)) refuse(403, 'not_owner', 'Only the owner can open perimeter construction.');
      guard(island); epochOf(island);
      if (policyOf(island).wallRuleVersion === 0) {
        island.positions = new Map([...(island.positions ?? []), ...Object.entries(positionsOf(rows(island)))]);
        island.wallPolicy = {...POLICY};
      }
      return answer(island);
    },
    quote({code, cells} = {}) { return quoteOn(target(code), cells); },
    build({code, placements, quotedTotal, islandEpoch, actionUid} = {}) {
      const island = target(code), payer = player();
      if (typeof islandEpoch !== 'string' || !UUID.test(islandEpoch) || typeof actionUid !== 'string' || !UID.test(actionUid) || !Number.isSafeInteger(quotedTotal) || quotedTotal < 1 || !Array.isArray(placements)
          || placements.length < 1 || placements.length > 32 || placements.some(row => !exact(row, ['spot', 'x', 'z']) || typeof row.spot !== 'string' || !onGrid(row.x) || !onGrid(row.z))) bad('Send the quoted wall positions, total and action id.');
      placements = placements.map(({spot, x, z}) => ({spot, x, z}));
      const intent = JSON.stringify({code: island.code, placements, quotedTotal, islandEpoch}), key = `wall-run:${actionUid}`, previous = payer.actions.get(key);
      if (previous) {
        if (previous.intent !== intent) refuse(409, 'action_uid_reused', 'That action id belongs to another wall build.');
        return {receipt: {...previous.receipt, placements: copy(previous.receipt.placements), repeat: true}, island: answer(island)};
      }
      if (islandEpoch !== epochOf(island)) refuse(409, 'stale_island_epoch', 'The island was reset. Get the price again.');
      const quote = quoteOn(island, placements.map(({x, z}) => ({x, z})));
      if (quote.totalCost !== quotedTotal || JSON.stringify(quote.placements) !== JSON.stringify(placements)) refuse(409, 'stale_wall_quote', 'Wall positions or prices changed. Get the price again.');
      if (payer.coins < quote.totalCost) refuse(409, 'insufficient_funds', 'You need more coins to build these walls.');
      // All validation precedes the synchronous mutation; the shared fake store serializes requests.
      payer.coins -= quote.totalCost;
      if (!(island.positions instanceof Map)) island.positions = new Map();
      for (const {spot, x, z} of placements) {
        island.built.add(spot); island.levels.set(spot, 1); island.kinds.set(spot, 'wall');
        island.positions.set(spot, {x, z}); island.walls?.delete(spot); paidFor(island, spot, 1, quote.unitCost);
      }
      const receipt = {actionUid, islandEpoch, totalCost: quote.totalCost, placements: copy(placements), repeat: false};
      payer.actions.set(key, {intent, receipt: {...receipt, placements: copy(placements)}});
      return {receipt, island: answer(island)};
    },
  };
}
