// Exact treasury amounts and ordering: a wrong run or old receipt cannot change a shared purchase budget.
import {describe, expect, it} from 'vitest';
import {canAffordCoins, cardFunds, createTreasuryProjection, economyContext, economySnapshot, exactCoinText,
  missingCoins, readEconomy} from '../../src/island/economy-view.js';
import {sharedEconomy} from './economy-fixture.js';

describe('the shared island treasury projection', () => {
  it('keeps amounts and revisions above JavaScript safe integers exact', () => {
    const money = '900719925474099312345678901234567890';
    const state = sharedEconomy({revision: money, treasury: {balanceCoins: money, committedCoins: '1', availableCoins: String(BigInt(money) - 1n)}});
    expect(readEconomy(state).revision).toBe(money);
    expect(exactCoinText(money)).toBe('🪙 900,719,925,474,099,312,345,678,901,234,567,890');
    expect(canAffordCoins(state.treasury.availableCoins, money)).toBe(false);
    expect(missingCoins(state.treasury.availableCoins, money)).toBe('1');
    expect(canAffordCoins(money, state.treasury.availableCoins)).toBe(true);
  });

  it('counts held principal once and refuses malformed or inconsistent envelopes', () => {
    expect(cardFunds(sharedEconomy(), 9999).coins).toBe('75');
    for (const treasury of [
      {balanceCoins: '100', committedCoins: '25', availableCoins: '50'},
      {balanceCoins: '20', committedCoins: '25', availableCoins: '0'},
      {balanceCoins: 100, committedCoins: '25', availableCoins: '75'},
      {balanceCoins: '0100', committedCoins: '25', availableCoins: '75'},
    ]) expect(cardFunds(sharedEconomy({treasury}), 9999)).toMatchObject({shared: true, coins: null});
    expect(readEconomy(sharedEconomy({version: 2}))).toBe(null);
    expect(readEconomy(sharedEconomy({revision: '1e2'}))).toBe(null);
    expect(cardFunds(undefined, 90)).toMatchObject({shared: false, coins: 90});
  });

  it('uses a refreshed snapshot instead of an immutable retry receipt balance', () => {
    const projection = createTreasuryProjection(sharedEconomy());
    const currentEconomy = sharedEconomy({revision: '4', treasury: {balanceCoins: '80', committedCoins: '30', availableCoins: '50'}});
    expect(projection.update({repeat: true, receipt: {balanceAtCommit: '9999'}, currentEconomy})).toBe('accepted');
    expect(projection.availableCoins).toBe('50');
    expect(economySnapshot({receipt: {economy: sharedEconomy()}})).toBe(null);
    expect(economySnapshot({currentEconomy: null, economy: sharedEconomy()})).toBe(null);
  });

  it('rejects a stale revision and every part of a different account scope', () => {
    const projection = createTreasuryProjection(sharedEconomy({revision: '9007199254740993'}));
    expect(projection.update({economy: sharedEconomy({revision: '9007199254740992'})})).toBe('older_revision');
    for (const field of ['islandOwner', 'accountId', 'runEpoch']) {
      expect(projection.update({economy: sharedEconomy({[field]: '44444444-4444-4444-8444-444444444444', revision: '9999999999999999'})})).toBe('scope_mismatch');
    }
    expect(projection.current.revision).toBe('9007199254740993');
    expect(projection.availableCoins).toBe('75');
  });

  it('accepts equal monetary revisions without claiming that card-domain state is unchanged', () => {
    const projection = createTreasuryProjection(sharedEconomy());
    expect(projection.update({economy: sharedEconomy(), crew: {guard: 2}})).toBe('accepted');
    expect(projection.update({economy: sharedEconomy(), skills: {points: 4}})).toBe('accepted');
    expect(projection.update({economy: sharedEconomy({treasury: {balanceCoins: '101', committedCoins: '25', availableCoins: '76'}})})).toBe('revision_conflict');
    expect(projection.availableCoins).toBe(null);
  });

  it('pins shared mode on an unreadable response instead of falling back to the private wallet', () => {
    const projection = createTreasuryProjection(sharedEconomy());
    expect(projection.update({coins: 9000})).toBe('unavailable');
    expect(projection.availableCoins).toBe(null);
    expect(projection.context()).toEqual({mode: 'island_shared', version: 1,
      islandOwner: sharedEconomy().islandOwner, runEpoch: sharedEconomy().runEpoch});
    expect(economyContext(sharedEconomy())).not.toHaveProperty('accountId');
    expect(projection.update({economy: sharedEconomy()})).toBe('accepted');
    expect(projection.availableCoins).toBe('75');
  });
});
