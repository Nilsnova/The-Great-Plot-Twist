// Explicit wire fixtures for shared arsenal component tests; never runtime authority.
export const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const ACTOR = id(1), OWNER = id(2);
export function economy(epoch = id(4)) {
  return {mode: 'island_shared', version: 1, islandOwner: OWNER, accountId: id(3), runEpoch: epoch,
    revision: '1', treasury: {balanceCoins: '999999999999999999999', committedCoins: '0', availableCoins: '999999999999999999999'}};
}
export function data() {
  return {arsenalVersion: 1, economy: economy(), arsenalRevision: '1', code: 'ISLE-K7Q2M', capacity: 20,
    total: 1, stored: 0, mine: id(5), carried: 'pistols', waveRunning: false, unlockWave: 4,
    copies: [{id: id(5), no: 1, weapon: 'pistols', name: 'Pistols', holder: ACTOR, holderName: 'Captain Gull',
      away: false, you: true, holderGeneration: '1', pendingReturnWaveId: null, disconnectedUntil: null}],
    types: [{id: 'musket', name: 'Musket', priceCoins: '0', unlockWave: 0, unlocked: true},
      {id: 'pistols', name: 'Pistols', priceCoins: '60', unlockWave: 2, unlocked: true},
      {id: 'blunderbuss', name: 'Blunderbuss', priceCoins: '100', unlockWave: 4, unlocked: true},
      {id: 'long_rifle', name: 'Long rifle', priceCoins: '160', unlockWave: 6, unlocked: false},
      {id: 'fire_bombs', name: 'Fire bombs', priceCoins: '200', unlockWave: 8, unlocked: false}]};
}
