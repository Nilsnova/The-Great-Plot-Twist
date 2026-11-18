// Exact shared repair affordability never falls back to a Captain's personal coins.
import {describe, expect, it} from 'vitest';
import {repairFunding} from '../../src/island/shared-combat-funds.js';

const economy = (available = '30') => ({mode: 'island_shared', version: 1,
  islandOwner: '11111111-1111-4111-8111-111111111111',
  accountId: '22222222-2222-4222-8222-222222222222', runEpoch: '33333333-3333-4333-8333-333333333333',
  revision: '4', treasury: {balanceCoins: available, committedCoins: '0', availableCoins: available}});

describe('shared repair funding', () => {
  it('uses all available island money exactly even above JavaScript safe integers', () => {
    const result = repairFunding({economy: economy('9007199254740993123456789')}, {coins: 0}, 40);
    expect(result).toMatchObject({shared: true, known: true, affordable: true,
      payerLabel: 'Paid from the island treasury.', reason: null});
  });

  it('does not spend committed bets or personal money on an unaffordable repair', () => {
    const value = economy('9');
    value.treasury = {balanceCoins: '100', committedCoins: '91', availableCoins: '9'};
    expect(repairFunding({economy: value}, {coins: 1000}, 10)).toMatchObject({
      shared: true, known: true, affordable: false, reason: 'Need 1 more available island coin.',
    });
  });

  it.each([null, {}, {...economy(), treasury: {balanceCoins: '100', committedCoins: '90', availableCoins: '11'}},
    {...economy(), treasury: {balanceCoins: 100, committedCoins: 0, availableCoins: 100}},
    {...economy(), treasury: {balanceCoins: '01', committedCoins: '0', availableCoins: '1'}}])(
    'disables malformed shared funds without using personal coins', value => {
      expect(repairFunding({economy: value}, {coins: 999}, 10)).toMatchObject({
        shared: true, known: false, affordable: false, reason: 'Island treasury is still loading.',
      });
    });

  it('rejects a different current island or epoch even when its balance is large', () => {
    const changed = {...economy('1000'), runEpoch: '44444444-4444-4444-8444-444444444444'};
    expect(repairFunding({economy: economy('1')}, {economy: changed, coins: 1000}, 10))
      .toMatchObject({shared: true, known: false, affordable: false});
  });

  it('preserves old rendering and explicit legacy funds without labeling them island money', () => {
    expect(repairFunding({}, {coins: 10}, 10)).toMatchObject({shared: false, affordable: true, payerLabel: null});
    expect(repairFunding({}, {economy: {mode: 'personal_legacy'}, coins: 9}, 10))
      .toMatchObject({shared: false, affordable: false, reason: 'Need 1 more coins.'});
  });
});
