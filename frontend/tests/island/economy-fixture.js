// Public synthetic treasury fixtures for shared-economy display and request tests.
import {sharedFixture} from './shared-core-fixture.js';
export const sharedEconomy = (change = {}) => ({mode: 'island_shared', version: 1,
  islandOwner: '11111111-1111-4111-8111-111111111111', accountId: '22222222-2222-4222-8222-222222222222',
  runEpoch: '33333333-3333-4333-8333-333333333333', revision: '1',
  treasury: {balanceCoins: '100', committedCoins: '25', availableCoins: '75'}, ...change});

export const sharedIsland = (change = {}) => ({...sharedFixture(), waveBest: 9, flags: 2, economy: sharedEconomy(), ...change});

export const personalCaptain = (change = {}) => ({progressionVersion: 1, level: 3, personalBestWave: 8, role: 'engineer', revision: '1',
  assignmentWaveId: null, engineerCommitment: null, canRespec: true, respecBlockedReason: null, roleLockedReason: null, ...change});

export const personalReply = (change = {}) => ({captain: personalCaptain(), skills: {points: 3, earned: 4, spent: 1, known: ['steady_aim']}, ...change});
