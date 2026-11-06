// What happens after a click: the next step of the form, the notice, and the stake id that is kept or dropped.
import { describe, expect, it } from 'vitest';
import { afterSettle, afterStake, createDeskFlow } from '../../src/screens/predictions/flow.js';

const ask = { questionId: 'q-one', side: 'yes', amount: 20 };

// An adapter stand-in that records every stake and plays queued replies.
function fakeAdapter(...replies) {
  const sent = [];
  let counter = 0;
  return {
    sent,
    makeStakeId: () => `made-id-${++counter}`,
    stake: async body => (sent.push({ call: 'stake', ...body }), replies.shift()),
    settle: async body => (sent.push({ call: 'settle', ...body }), replies.shift()),
  };
}

const ok = data => ({ kind: 'ok', data });
const refused = (code, message) => ({ kind: 'refused', status: 409, code, message });

describe('after a stake', () => {
  it('a 200 is done, goes back to the plain form and drops the id', () => {
    const next = afterStake(ok({ questionId: 'q-one', side: 'yes', amount: 20 }));
    expect(next).toMatchObject({ done: true, step: 'edit', keepId: false });
    expect(next.notice).toBe('Your stake is in: 20 coins on YES.');
  });

  it('already_applied counts as done and still asks for fresh numbers', () => {
    const next = afterStake({ kind: 'done', alreadyApplied: true, code: 'already_applied', message: 'This stake was already placed.' });
    expect(next).toMatchObject({ done: true, keepId: false, refresh: true });
    expect(next.notice).toBe('This stake was already placed.');
  });

  it('shows the server message for a refusal and goes back to the form', () => {
    const next = afterStake(refused('daily_stake_cap', 'You can still stake 30 coins today.'));
    expect(next).toMatchObject({ done: false, step: 'edit', keepId: false });
    expect(next.notice).toBe('You can still stake 30 coins today.');
  });

  it('falls back to the sentence for the code when the refusal has no message', () => {
    const next = afterStake(refused('pool_closed', ''));
    expect(next.notice).toBe('Staking on this question has closed.');
  });

  it('keeps the id and the confirm step when the answer is unknown', () => {
    const next = afterStake({ kind: 'unknown', status: 0, code: 'network_error', message: 'No connection to the server.' });
    expect(next).toMatchObject({ done: false, step: 'confirm', keepId: true });
    expect(next.notice).toContain('counts only once');
  });

  it('keeps the id and the confirm step when the server asks to wait', () => {
    const next = afterStake({ kind: 'wait', code: 'too_many_requests', seconds: 4, message: 'Too many tries. Wait 4 seconds, then try again.' });
    expect(next).toMatchObject({ done: false, step: 'confirm', keepId: true });
    expect(next.notice).toBe('Too many tries. Wait 4 seconds, then try again.');
  });

  it('asks the player to sign in after a 401', () => {
    const next = afterStake({ kind: 'signin', message: 'Sign in with GitHub to stake coins.' });
    expect(next).toMatchObject({ done: false, step: 'edit', keepId: false });
    expect(next.notice).toBe('Sign in with GitHub to stake coins.');
  });

  it('says the desk is closed when the flag is off', () => {
    const next = afterStake({ kind: 'closed', message: 'The prediction desk is closed for now.' });
    expect(next.notice).toBe('The prediction desk is closed for now.');
  });

  it('always asks for fresh numbers', () => {
    const replies = [
      ok({}),
      { kind: 'done', alreadyApplied: true },
      refused('pool_closed', 'x'),
      { kind: 'unknown', code: 'timeout' },
      { kind: 'wait', seconds: 3 },
      { kind: 'signin' },
      { kind: 'closed' },
    ];
    for (const reply of replies) expect(afterStake(reply).refresh).toBe(true);
  });
});

describe('after a settlement', () => {
  const receipt = { questionId: 'q-one', outcome: 'yes', settlement: 'winners', paidPlayers: 4, paidCoins: 196, cutCoins: 4 };

  it('shows who won and the receipt', () => {
    const next = afterSettle(ok(receipt));
    expect(next).toMatchObject({ done: true, step: 'edit', refresh: true });
    expect(next.notice).toBe('Settled: YES won. Paid 4 captains 196 coins. 4 coins left the game.');
  });

  it('shows a void receipt in plain words', () => {
    const next = afterSettle(ok({ ...receipt, outcome: 'void', settlement: 'refund_void', paidCoins: 200, cutCoins: 0 }));
    expect(next.notice).toBe(
      'Settled: the question was cancelled or unclear on Manifold, so everybody got their coins back. Paid 4 captains 200 coins. 0 coins left the game.',
    );
  });

  it('leaves the receipt out when the numbers are missing', () => {
    expect(afterSettle(ok({ outcome: 'yes', settlement: 'winners' })).notice).toBe('Settled: YES won.');
    expect(afterSettle(ok(null)).notice).toBe('The question is settled.');
  });

  it('counts a settlement that was already done as done, with the server message', () => {
    const next = afterSettle({ kind: 'done', alreadyApplied: true, message: 'This question was settled already: YES won.' });
    expect(next).toMatchObject({ done: true, step: 'edit' });
    expect(next.notice).toBe('This question was settled already: YES won.');
  });

  it('shows the server message for a refusal such as outcome_conflict', () => {
    const message = 'Manifold decided this question as NO. Settle it as no, or void it.';
    const next = afterSettle(refused('outcome_conflict', message));
    expect(next).toMatchObject({ done: false, step: 'edit' });
    expect(next.notice).toBe(message);
  });

  it('stays on the confirm step when the answer is unknown, and says that a retry is safe', () => {
    const next = afterSettle({ kind: 'unknown', status: 0, code: 'timeout', message: 'x' });
    expect(next).toMatchObject({ done: false, step: 'confirm' });
    expect(next.notice).toContain('settles only once');
  });
});

describe('the stake flow', () => {
  it('makes the stake id once and sends the same one again after an unknown answer', async () => {
    const adapter = fakeAdapter({ kind: 'unknown', code: 'timeout' }, ok({ ...ask }));
    const flow = createDeskFlow({ adapter });
    const first = await flow.stake(ask);
    const second = await flow.stake(ask);
    expect(first.done).toBe(false);
    expect(second.done).toBe(true);
    expect(adapter.sent.map(call => call.stakeId)).toEqual(['made-id-1', 'made-id-1']);
  });

  it('makes a new stake id for a new click after the first stake went through', async () => {
    const adapter = fakeAdapter(ok({ ...ask }), ok({ ...ask }));
    const flow = createDeskFlow({ adapter });
    await flow.stake(ask);
    await flow.stake(ask);
    expect(adapter.sent.map(call => call.stakeId)).toEqual(['made-id-1', 'made-id-2']);
  });

  it('makes a new stake id after a refusal, because nothing was placed', async () => {
    const adapter = fakeAdapter(refused('daily_stake_cap', 'x'), ok({ ...ask }));
    const flow = createDeskFlow({ adapter });
    await flow.stake(ask);
    await flow.stake(ask);
    expect(adapter.sent.map(call => call.stakeId)).toEqual(['made-id-1', 'made-id-2']);
  });

  it('makes a new stake id when the side or the amount changed after an unknown answer', async () => {
    const adapter = fakeAdapter({ kind: 'unknown', code: 'timeout' }, { kind: 'unknown', code: 'timeout' }, ok({}));
    const flow = createDeskFlow({ adapter });
    await flow.stake(ask);
    await flow.stake({ ...ask, amount: 30 });
    await flow.stake({ ...ask, amount: 30, side: 'no' });
    expect(adapter.sent.map(call => call.stakeId)).toEqual(['made-id-1', 'made-id-2', 'made-id-3']);
  });

  it('keeps one pending stake per question', async () => {
    const adapter = fakeAdapter({ kind: 'unknown', code: 'timeout' }, { kind: 'unknown', code: 'timeout' }, ok({}), ok({}));
    const flow = createDeskFlow({ adapter });
    const other = { ...ask, questionId: 'q-two' };
    await flow.stake(ask);
    await flow.stake(other);
    await flow.stake(ask);
    await flow.stake(other);
    expect(adapter.sent.map(call => call.stakeId)).toEqual(['made-id-1', 'made-id-2', 'made-id-1', 'made-id-2']);
  });

  it('sends only the four stake fields to the adapter', async () => {
    const adapter = fakeAdapter(ok({}));
    await createDeskFlow({ adapter }).stake({ ...ask, playerId: 'nope' });
    expect(Object.keys(adapter.sent[0]).sort()).toEqual(['amount', 'call', 'questionId', 'side', 'stakeId']);
  });

  it('sends a settlement as { questionId, outcome } and returns the notice', async () => {
    const adapter = fakeAdapter(ok({ outcome: 'no', settlement: 'winners', paidPlayers: 1, paidCoins: 9, cutCoins: 1 }));
    const result = await createDeskFlow({ adapter }).settle({ questionId: 'q-one', outcome: 'no' });
    expect(adapter.sent[0]).toEqual({ call: 'settle', questionId: 'q-one', outcome: 'no' });
    expect(result.notice).toBe('Settled: NO won. Paid 1 captain 9 coins. 1 coin left the game.');
  });
});
