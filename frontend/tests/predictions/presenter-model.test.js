// The presenter tab: the Manifold line, which buttons follow the public fields, the confirm text and the receipt.
import { describe, expect, it } from 'vitest';
import {
  manifoldLine,
  poolLine,
  receiptText,
  settleConfirmText,
  settleLabel,
  settleOptions,
} from '../../src/screens/predictions/presenter-model.js';
import { question } from './sample-answers.js';

const UTC = { timeZone: 'UTC' };
const manifold = (state, decidedAs = null, decidedAt = null) => ({ state, decidedAs, decidedAt });

describe('the Manifold line', () => {
  it('says what Manifold decided and when', () => {
    expect(manifoldLine(manifold('decided', 'yes', '2026-11-20T14:02:00Z'), UTC)).toBe('Manifold: decided YES at 14:02');
    expect(manifoldLine(manifold('decided', 'no', '2026-11-20T09:05:00Z'), UTC)).toBe('Manifold: decided NO at 09:05');
  });

  it('copes with a decision that has no time', () => {
    expect(manifoldLine(manifold('decided', 'yes'), UTC)).toBe('Manifold: decided YES');
  });

  it('explains a void decision', () => {
    expect(manifoldLine(manifold('decided', 'void', '2026-11-20T14:02:00Z'), UTC)).toBe(
      'Manifold: decided as void (cancelled or unclear) at 14:02',
    );
  });

  it('says open, closed and cannot be reached', () => {
    expect(manifoldLine(manifold('open'), UTC)).toBe('Manifold: open');
    expect(manifoldLine(manifold('closed'), UTC)).toBe('Manifold: closed, waiting');
    expect(manifoldLine(manifold('unknown'), UTC)).toBe('Manifold: cannot be reached');
  });

  it('says cannot be reached when the field is missing', () => {
    expect(manifoldLine(undefined, UTC)).toBe('Manifold: cannot be reached');
  });
});

describe('our pool line', () => {
  it('says open until the closing time, with the total', () => {
    expect(poolLine(question(), UTC)).toBe('Our pool: open until Thu 17 Dec, 12:00 UTC. 200 coins in total.');
  });

  it('says closed and waiting for the result', () => {
    expect(poolLine(question({ status: 'closed' }), UTC)).toBe('Our pool: closed, waiting for the result. 200 coins in total.');
  });

  it('says settled and who won', () => {
    const settled = question({ status: 'settled', outcome: 'yes', settlement: 'winners' });
    expect(poolLine(settled, UTC)).toBe('Our pool: settled. YES won. 200 coins in total.');
  });

  it('says settled as void', () => {
    const settled = question({ status: 'settled', outcome: 'void', settlement: 'refund_void' });
    expect(poolLine(settled, UTC)).toBe('Our pool: settled. Everybody got their coins back. 200 coins in total.');
  });
});

describe('which buttons the presenter gets', () => {
  it('offers only Void while staking is still open', () => {
    const options = settleOptions(question(), UTC);
    expect(options).toMatchObject({ yes: false, no: false, void: true });
    expect(options.hint).toBe('Settle YES or NO after staking closes (Thu 17 Dec, 12:00 UTC). Void works at any time.');
  });

  it('offers YES, NO and Void after closing', () => {
    const options = settleOptions(question({ status: 'closed', canStake: false }), UTC);
    expect(options).toMatchObject({ yes: true, no: true, void: true });
  });

  it('offers only the side Manifold decided, and Void', () => {
    const decided = question({ status: 'closed', canStake: false, manifold: manifold('decided', 'no') });
    const options = settleOptions(decided, UTC);
    expect(options).toMatchObject({ yes: false, no: true, void: true });
    expect(options.hint).toBe('Manifold decided NO. Settle it as NO, or void it.');
  });

  it('offers only Void when Manifold decided void', () => {
    const decided = question({ status: 'closed', canStake: false, manifold: manifold('decided', 'void') });
    const options = settleOptions(decided, UTC);
    expect(options).toMatchObject({ yes: false, no: false, void: true });
    expect(options.hint).toBe('Manifold decided this as void, so only Void is possible.');
  });

  it('offers nothing once the pool is settled', () => {
    const settled = question({ status: 'settled', outcome: 'yes', settlement: 'winners' });
    expect(settleOptions(settled, UTC)).toMatchObject({ yes: false, no: false, void: false, hint: 'This question is settled.' });
  });
});

describe('the buttons and their confirm text', () => {
  it('labels the three buttons', () => {
    expect(settleLabel('yes')).toBe('Settle YES');
    expect(settleLabel('no')).toBe('Settle NO');
    expect(settleLabel('void')).toBe('Void');
  });

  it('says what a settlement will do', () => {
    expect(settleConfirmText('yes')).toBe(
      'Settle as YES: the captains who picked YES share the pool. This cannot be undone.',
    );
    expect(settleConfirmText('no')).toBe(
      'Settle as NO: the captains who picked NO share the pool. This cannot be undone.',
    );
  });

  it('says what a void will do', () => {
    expect(settleConfirmText('void')).toBe('Void: everybody gets their coins back. This cannot be undone.');
  });
});

describe('the receipt', () => {
  it('says who was paid and how many coins left the game', () => {
    expect(receiptText({ paidPlayers: 4, paidCoins: 196, cutCoins: 4 })).toBe('Paid 4 captains 196 coins. 4 coins left the game.');
  });

  it('uses the singular', () => {
    expect(receiptText({ paidPlayers: 1, paidCoins: 1, cutCoins: 1 })).toBe('Paid 1 captain 1 coin. 1 coin left the game.');
  });

  it('writes zeros', () => {
    expect(receiptText({ paidPlayers: 0, paidCoins: 0, cutCoins: 0 })).toBe('Paid 0 captains 0 coins. 0 coins left the game.');
  });
});
