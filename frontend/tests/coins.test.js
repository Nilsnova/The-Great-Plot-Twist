// formatCoins and friends: the one coin format of the game (BUILD-PLAN 3.2).
import {describe, expect, it} from 'vitest';
import {coinsSpoken, formatCoinDelta, formatCoins, formatDelta, wholeCoins} from '../src/lib/coins.js';

describe('formatCoins', () => {
  it('writes whole coins with the coin in front', () => {
    expect(formatCoins(120)).toBe('🪙 120');
    expect(formatCoins(0)).toBe('🪙 0');
    expect(formatCoins(5)).toBe('🪙 5');
  });
  it('groups thousands with a comma', () => {
    expect(formatCoins(1250)).toBe('🪙 1,250');
    expect(formatCoins(1000000)).toBe('🪙 1,000,000');
  });
  it('puts a real minus sign before the coin for a loss', () => {
    expect(formatCoins(-10)).toBe('−🪙 10');
    expect(formatCoins(-1250)).toBe('−🪙 1,250');
  });
  it('never shows decimals', () => {
    expect(formatCoins(10.4)).toBe('🪙 10');
    expect(formatCoins(10.6)).toBe('🪙 11');
    expect(formatCoins(-0.2)).toBe('🪙 0');
  });
  it('shows anything that is not a number as zero coins', () => {
    for (const value of [null, undefined, NaN, Infinity, -Infinity, 'ten', '', {}, [], true]) expect(formatCoins(value)).toBe('🪙 0');
    expect(formatCoins('25')).toBe('🪙 25');
  });
});

describe('formatDelta and formatCoinDelta', () => {
  it('signs gains and losses', () => {
    expect(formatDelta(25)).toBe('+25');
    expect(formatDelta(-4)).toBe('−4');
    expect(formatDelta(0)).toBe('0');
    expect(formatDelta(1500)).toBe('+1,500');
    expect(formatDelta(NaN)).toBe('0');
  });
  it('puts the coin in front of a signed amount', () => {
    expect(formatCoinDelta(10)).toBe('🪙 +10');
    expect(formatCoinDelta(-10)).toBe('🪙 −10');
  });
});

describe('wholeCoins and coinsSpoken', () => {
  it('rounds to whole coins and treats junk as zero', () => {
    expect(wholeCoins(2.5)).toBe(3);
    expect(wholeCoins('x')).toBe(0);
  });
  it('reads well for a screen reader', () => {
    expect(coinsSpoken(1)).toBe('1 coin');
    expect(coinsSpoken(1250)).toBe('1,250 coins');
    expect(coinsSpoken(-3)).toBe('minus 3 coins');
  });
});
