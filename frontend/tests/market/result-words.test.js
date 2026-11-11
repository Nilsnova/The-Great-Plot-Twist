// What the status line says after an action, and the one-time notice when a position closes at zero.
import { describe, expect, it } from 'vitest';
import { openedWords, closedWords, zeroNotices } from '../../src/screens/market/result-words.js';

const harbor = { id: 'harbor-trust', name: 'Saltreach Harbor Trust', currency: 'USDT', priceDecimals: 2 };

describe('after opening a position', () => {
  const answer = { positionId: '2f0c', companyId: 'harbor-trust', side: 'rising', stake: 100, fee: 2, coinsChange: -102, coins: 838, entryPrice: 76159.21, zeroPrice: 68543.289 };

  it('shows the entry price and the zero point the server set, and what was paid', () => {
    expect(openedWords(answer, harbor)).toBe(
      'Opened your rising position in Saltreach Harbor Trust at 76,159.21 USDT. Zero point: 68,543.29 USDT. You paid 🪙 102 and have 🪙 838 left.');
  });

  it('rounds a falling zero point the other way', () => {
    const falling = { ...answer, side: 'falling', zeroPrice: 83775.131 };
    expect(openedWords(falling, harbor)).toContain('Zero point: 83,775.13 USDT.');
    expect(openedWords(falling, harbor)).toContain('Opened your falling position');
  });

  it('still says something useful when the company is not known to the board', () => {
    expect(openedWords(answer, null)).toBe(
      'Opened your rising position in harbor-trust at 76,159.21. Zero point: 68,543.29. You paid 🪙 102 and have 🪙 838 left.');
  });
});

describe('after closing a position', () => {
  it('says what was received', () => {
    const answer = { closedAs: 'closed', closePrice: 76159.21, value: 115, fee: 2, coinsChange: 113, coins: 951 };
    expect(closedWords(answer, harbor)).toBe('Closed your position in Saltreach Harbor Trust at 76,159.21 USDT. You received 🪙 113 and now have 🪙 951.');
  });

  it('says when nothing was paid out', () => {
    const answer = { closedAs: 'closed', closePrice: 45.03, value: 3, fee: 3, coinsChange: 0, coins: 940 };
    expect(closedWords(answer, harbor)).toBe('Closed your position in Saltreach Harbor Trust at 45.03 USDT. No coins were paid out. You have 🪙 940.');
  });

  it('explains a position that had already reached its zero point', () => {
    const answer = { closedAs: 'zeroed', closePrice: 68000, value: 0, fee: 0, coinsChange: 0, coins: 940 };
    expect(closedWords(answer, harbor)).toBe(
      'Your position in Saltreach Harbor Trust had already reached its zero point, so it closed at zero. No coins were paid out. You have 🪙 940.');
  });
});

describe('the notice when a position closes at zero', () => {
  const open = (id, extra) => ({ id, companyId: 'pier-post-courier', name: 'Pier Post Courier', side: 'falling', ...extra });
  const closedRow = (id, closedAs, extra) => ({ id, companyId: 'pier-post-courier', name: 'Pier Post Courier', side: 'falling', closedAs, ...extra });

  it('names the side and the company, once, when a position the panel knew has closed at zero', () => {
    const previous = { positions: [open('p1')], recentlyClosed: [] };
    const current = { positions: [], recentlyClosed: [closedRow('p1', 'zeroed')] };
    expect(zeroNotices(previous, current)).toEqual(['Your falling position in Pier Post Courier reached its zero point and closed at zero.']);
  });

  it('says nothing when the player closed it, when it is still open, or when it was never known', () => {
    const previous = { positions: [open('p1'), open('p2')], recentlyClosed: [] };
    const current = { positions: [open('p2')], recentlyClosed: [closedRow('p1', 'closed'), closedRow('p9', 'zeroed')] };
    expect(zeroNotices(previous, current)).toEqual([]);
  });

  it('says nothing the second time, because the position is no longer in the previous list', () => {
    const settled = { positions: [], recentlyClosed: [closedRow('p1', 'zeroed')] };
    expect(zeroNotices(settled, settled)).toEqual([]);
  });

  it('has one line per position when several closed at once', () => {
    const previous = { positions: [open('p1'), open('p2', { side: 'rising', name: 'Tidewright Works' })], recentlyClosed: [] };
    const current = { positions: [], recentlyClosed: [closedRow('p1', 'zeroed'), closedRow('p2', 'zeroed', { side: 'rising', name: 'Tidewright Works' })] };
    expect(zeroNotices(previous, current)).toEqual([
      'Your falling position in Pier Post Courier reached its zero point and closed at zero.',
      'Your rising position in Tidewright Works reached its zero point and closed at zero.',
    ]);
  });

  it('skips entries that are not objects', () => {
    expect(zeroNotices({ positions: [null, open('p1')] }, { positions: [null], recentlyClosed: [null, closedRow('p1', 'zeroed')] })).toHaveLength(1);
  });

  it('copes with missing lists', () => {
    expect(zeroNotices(null, { positions: [], recentlyClosed: [] })).toEqual([]);
    expect(zeroNotices({ positions: [open('p1')] }, {})).toEqual([]);
    expect(zeroNotices(undefined, undefined)).toEqual([]);
  });
});
