import {describe, expect, it} from 'vitest';
import {allIn, coinInteger, shareOf, validEconomy} from '../../src/harbor/shared-stakes.js';

describe('exact shared Harbor amounts', () => {
  it('uses every available coin without old caps or Number rounding', () => {
    const value = '1' + '0'.repeat(4999) + '7';
    expect(allIn(value)).toBe(value);
    expect(coinInteger(value)).toBe(10n ** 5000n + 7n);
    expect(shareOf('123456789012345678901', 50)).toBe('61728394506172839450');
  });
  it('includes upward-rounded fees in all-in quotes when a supported product has them', () => {
    expect(allIn('102', 200)).toBe('100');
    expect(allIn('1', 200)).toBe('0');
  });
  it.each([true, 1, 1.5, '01', '-1', '1e3', 'NaN', null])('rejects noncanonical amount %s', value => {
    expect(() => coinInteger(value)).toThrow();
  });
  it('does not infer a treasury from a personal coin field', () => {
    expect(validEconomy({coins: 100})).toBe(false);
  });
});
