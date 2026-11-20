// Boat-specific receipt/result checks. Common economy projection stays with the island owner.
import {BOAT, coinsFor} from '../pirates/boat/rules.js';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const games = new Set(['broadside', 'dash']);
const coins = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) <= 78n;
export const sameBoatOrigin = (a, b) => !!a && !!b && ['mode', 'version', 'islandOwner', 'accountId', 'runEpoch'].every(key => a[key] === b[key]);
export function boatOrigin(value) {
  if (!value || value.mode !== 'island_shared' || value.version !== 1 || !['islandOwner', 'accountId', 'runEpoch'].every(key => uuid(value[key]))) return null;
  return Object.fromEntries(['mode', 'version', 'islandOwner', 'accountId', 'runEpoch'].map(key => [key, value[key]]));
}
export const boatIntent = origin => ({mode: origin.mode, version: origin.version, islandOwner: origin.islandOwner, runEpoch: origin.runEpoch});
export function isBoatStatus(value) {
  if (!value || typeof value.open !== 'boolean' || !Number.isSafeInteger(value.wave) || value.wave < 0 || !Array.isArray(value.games) || value.games.length !== 2) return false;
  if (new Set(value.games.map(game => game.id)).size !== 2 || !value.games.every(game => games.has(game.id) && typeof game.paid === 'boolean' && Number.isSafeInteger(game.best) && game.best >= 0)) return false;
  if (value.rewardScope === 'player') return value.economy === undefined;
  return value.rewardScope === 'island' && !!boatOrigin(value.economy) && value.games.every(game =>
    [game.claimedCoins, game.remainingCoins, game.maximumCoins].every(coins) &&
    BigInt(game.claimedCoins) + BigInt(game.remainingCoins) === BigInt(game.maximumCoins) &&
    BigInt(game.maximumCoins) === BigInt(game.best) && game.paid === (game.remainingCoins === '0'));
}
export function readBoatReceipt(reply, {action, actionUid, actorId, origin, game, roundId, stars}) {
  const receipt = reply?.receipt, result = receipt?.result;
  if (typeof reply?.repeat !== 'boolean' || !uuid(receipt?.receiptId) || receipt.action !== action || receipt.actionUid !== actionUid || receipt.actorId !== actorId || !sameBoatOrigin(receipt.origin, origin) || !result) return null;
  if (action === 'boat:start') {
    const round = result.round;
    return reply.status === 'started' && uuid(round?.id) && round.actorId === actorId && round.game === game &&
      sameBoatOrigin({...round, mode: origin.mode, version: origin.version}, origin) &&
      Number.isSafeInteger(round.recordWave) && round.recordWave >= 30 && coins(round.maximumCoins) && Number(round.maximumCoins) === coinsFor(BOAT.stars, round.recordWave) ? receipt : null;
  }
  if (reply.status !== 'done' || result.roundId !== roundId || result.stars !== stars || !games.has(result.game) || !Number.isSafeInteger(result.recordWave) || result.recordWave < 30 || ![result.coins, result.cumulativeCoins, result.maximumCoins].every(coins)) return null;
  if (Number(result.maximumCoins) !== coinsFor(BOAT.stars, result.recordWave) || Number(result.coins) > coinsFor(stars, result.recordWave) || BigInt(result.coins) > BigInt(result.cumulativeCoins) || BigInt(result.cumulativeCoins) > BigInt(result.maximumCoins) || (result.coins === '0') !== (result.treasuryReceiptId === null) || (result.treasuryReceiptId !== null && !uuid(result.treasuryReceiptId))) return null;
  if ((reply.repeat && reply.currentEconomy !== null) || (!reply.repeat && !sameBoatOrigin(reply.currentEconomy, origin))) return null;
  return receipt;
}
