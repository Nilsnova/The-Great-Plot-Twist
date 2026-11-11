// The practice desk: made-up questions, in-memory stakes, and the same refusals as the real server.
import { describe, expect, it } from 'vitest';
import { createFakeDeskAdapter } from '../../src/screens/predictions/adapter-fake.js';
import { CREDIT_LINE, PLAY_MONEY_LINE } from '../../src/screens/predictions/messages.js';

const START = Date.parse('2026-11-06T12:00:00Z');
const HOUR = 3600 * 1000;
let counter = 0;
const stakeId = () => `practice-id-${String(++counter).padStart(4, '0')}`;

function makeDesk(options = {}) {
  const clock = { now: START };
  const adapter = createFakeDeskAdapter({ now: () => clock.now, ...options });
  return { adapter, clock };
}

async function questionsByStatus(adapter) {
  const { data } = await adapter.list();
  const by = status => data.questions.filter(item => item.status === status);
  return { all: data.questions, open: by('open'), closed: by('closed'), settled: by('settled') };
}

const stakeOn = (adapter, question, extra = {}) =>
  adapter.stake({ questionId: question.id, side: 'yes', amount: 20, stakeId: stakeId(), ...extra });

describe('the practice label', () => {
  it('says it is a practice desk with no real coins', () => {
    expect(makeDesk().adapter.label).toBe('Practice desk: not real coins');
  });
});

describe('the list', () => {
  it('has three made-up questions: two open and one closed', async () => {
    const { all, open, closed } = await questionsByStatus(makeDesk().adapter);
    expect(all).toHaveLength(3);
    expect(open).toHaveLength(2);
    expect(closed).toHaveLength(1);
  });

  it('uses the fields of the real contract and never a probability', async () => {
    const { data } = await makeDesk().adapter.list();
    const keys = Object.keys(data.questions[0]);
    for (const key of ['id', 'text', 'topic', 'decidedBy', 'closesAt', 'status', 'canStake', 'outcome', 'settlement', 'settledAt', 'manifold', 'sides', 'totalCoins', 'source', 'fetchedAt']) {
      expect(keys).toContain(key);
    }
    expect(JSON.stringify(data)).not.toMatch(/probab/i);
    expect(data.rules).toMatchObject({ minStake: 1, maxStake: 50, dailyCap: 200, cutPercent: 5 });
    expect(data.attribution).toBe(CREDIT_LINE);
    expect(data.playMoney).toBe(PLAY_MONEY_LINE);
  });

  it('lets only open questions be staked', async () => {
    const { open, closed } = await questionsByStatus(makeDesk().adapter);
    expect(open.every(item => item.canStake)).toBe(true);
    expect(closed.every(item => item.canStake === false)).toBe(true);
  });

  it('marks every question as practice data, not as a real Manifold reading', async () => {
    const { all } = await questionsByStatus(makeDesk().adapter);
    expect(all.every(item => /practice/i.test(item.decidedBy))).toBe(true);
  });
});

describe('placing a stake', () => {
  it('takes the coins, shows the stake in mine and adds it to the pool', async () => {
    const { adapter } = makeDesk({ coins: 1000 });
    const { open } = await questionsByStatus(adapter);
    const before = open[0].sides.find(side => side.side === 'yes');
    const reply = await stakeOn(adapter, open[0]);
    expect(reply).toMatchObject({ kind: 'ok' });
    expect(reply.data).toMatchObject({ questionId: open[0].id, side: 'yes', amount: 20, coins: 980, stakedToday: 20, leftToday: 180 });

    const mine = (await adapter.mine()).data;
    expect(mine).toMatchObject({ coins: 980, stakedToday: 20, leftToday: 180, dailyCap: 200 });
    expect(mine.stakes[0]).toMatchObject({ questionId: open[0].id, side: 'yes', amount: 20, status: 'open', result: null });

    const after = (await questionsByStatus(adapter)).open[0].sides.find(side => side.side === 'yes');
    expect(after.coins).toBe(before.coins + 20);
    expect(after.players).toBe(before.players + 1);
  });

  it('refuses a second stake on the same question', async () => {
    const { adapter } = makeDesk();
    const { open } = await questionsByStatus(adapter);
    await stakeOn(adapter, open[0]);
    const reply = await stakeOn(adapter, open[0], { side: 'no', amount: 5 });
    expect(reply).toMatchObject({ kind: 'refused', code: 'already_staked' });
    expect(reply.message).toBe('You already staked 🪙 20 on YES for this question. One stake per question.');
    expect((await adapter.mine()).data.coins).toBe(980);
  });

  it('refuses a stake on a closed question', async () => {
    const { adapter } = makeDesk();
    const { closed } = await questionsByStatus(adapter);
    const reply = await stakeOn(adapter, closed[0]);
    expect(reply).toMatchObject({ kind: 'refused', code: 'pool_closed', message: 'Staking on this question has closed.' });
  });

  it('closes a question when the clock reaches its closing time', async () => {
    const { adapter, clock } = makeDesk();
    const { open } = await questionsByStatus(adapter);
    clock.now = Date.parse(open[1].closesAt);
    expect(await stakeOn(adapter, open[1])).toMatchObject({ kind: 'refused', code: 'pool_closed' });
  });

  it('refuses staking over the daily cap and says how much is left', async () => {
    const { adapter } = makeDesk({ dailyCap: 60 });
    const { open } = await questionsByStatus(adapter);
    await stakeOn(adapter, open[0], { amount: 50 });
    const reply = await stakeOn(adapter, open[1], { amount: 20 });
    expect(reply).toMatchObject({ kind: 'refused', code: 'daily_stake_cap' });
    expect(reply.message).toBe('You can stake at most 🪙 60 a day at the desk. You can still stake 🪙 10 today.');
  });

  it('refuses a stake when the player has too few coins', async () => {
    const { adapter } = makeDesk({ coins: 30 });
    const { open } = await questionsByStatus(adapter);
    const reply = await stakeOn(adapter, open[0], { amount: 50 });
    expect(reply).toMatchObject({ kind: 'refused', code: 'insufficient_funds' });
    expect((await adapter.mine()).data.coins).toBe(30);
  });

  it('lets a player stake exactly the whole balance', async () => {
    const { adapter } = makeDesk({ coins: 50 });
    const { open } = await questionsByStatus(adapter);
    expect(await stakeOn(adapter, open[0], { amount: 50 })).toMatchObject({ kind: 'ok' });
    expect((await adapter.mine()).data.coins).toBe(0);
  });

  it('answers a repeated stake id as already applied and changes nothing', async () => {
    const { adapter } = makeDesk();
    const { open } = await questionsByStatus(adapter);
    const id = stakeId();
    await stakeOn(adapter, open[0], { stakeId: id });
    const repeat = await stakeOn(adapter, open[1], { stakeId: id });
    expect(repeat).toMatchObject({ kind: 'done', alreadyApplied: true, code: 'already_applied' });
    const mine = (await adapter.mine()).data;
    expect(mine.coins).toBe(980);
    expect(mine.stakes).toHaveLength(1);
  });

  it('refuses 0, -3 and 51, and a stake that is not a whole number', async () => {
    const { adapter } = makeDesk();
    const { open } = await questionsByStatus(adapter);
    expect(await stakeOn(adapter, open[0], { amount: 0 })).toMatchObject({ kind: 'refused', code: 'stake_too_small' });
    expect(await stakeOn(adapter, open[0], { amount: -3 })).toMatchObject({ kind: 'refused', code: 'stake_too_small' });
    expect(await stakeOn(adapter, open[0], { amount: 51 })).toMatchObject({ kind: 'refused', code: 'stake_too_big' });
    expect(await stakeOn(adapter, open[0], { amount: 2.5 })).toMatchObject({ kind: 'refused', code: 'validation_error' });
    expect(await stakeOn(adapter, open[0], { amount: '5' })).toMatchObject({ kind: 'refused', code: 'validation_error' });
  });

  it('refuses an unknown question, a bad side and a bad stake id', async () => {
    const { adapter } = makeDesk();
    const { open } = await questionsByStatus(adapter);
    expect(await stakeOn(adapter, { id: 'no-such-question' })).toMatchObject({ kind: 'refused', code: 'no_such_question' });
    expect(await stakeOn(adapter, open[0], { side: 'maybe' })).toMatchObject({ kind: 'refused', code: 'validation_error' });
    expect(await stakeOn(adapter, open[0], { stakeId: 'short' })).toMatchObject({ kind: 'refused', code: 'validation_error' });
  });
});

describe('settling', () => {
  it('pays out a closed question so that the payouts and the cut add up to the pool', async () => {
    const { adapter } = makeDesk();
    const { closed } = await questionsByStatus(adapter);
    const reply = await adapter.settle({ questionId: closed[0].id, outcome: 'yes' });
    expect(reply.kind).toBe('ok');
    const { paidCoins, cutCoins, paidPlayers } = reply.data;
    expect(paidCoins + cutCoins).toBe(closed[0].totalCoins);
    expect(paidPlayers).toBeGreaterThan(0);
    expect(reply.data).toMatchObject({ questionId: closed[0].id, outcome: 'yes', settlement: 'winners' });
    const after = (await questionsByStatus(adapter)).settled[0];
    expect(after).toMatchObject({ id: closed[0].id, status: 'settled', outcome: 'yes', canStake: false });
  });

  it('answers a second settlement as already applied and says who won', async () => {
    const { adapter } = makeDesk();
    const { closed } = await questionsByStatus(adapter);
    await adapter.settle({ questionId: closed[0].id, outcome: 'yes' });
    const again = await adapter.settle({ questionId: closed[0].id, outcome: 'no' });
    expect(again).toMatchObject({ kind: 'done', alreadyApplied: true });
    expect(again.message).toBe('This question was settled already: YES won.');
  });

  it('refuses YES or NO while staking is open, but lets the host void', async () => {
    const { adapter } = makeDesk();
    const { open } = await questionsByStatus(adapter);
    const early = await adapter.settle({ questionId: open[0].id, outcome: 'yes' });
    expect(early).toMatchObject({ kind: 'refused', code: 'pool_open' });
    const voided = await adapter.settle({ questionId: open[0].id, outcome: 'void' });
    expect(voided.data).toMatchObject({ settlement: 'refund_void', cutCoins: 0, paidCoins: open[0].totalCoins });
  });

  it('refunds the player when the question is voided', async () => {
    const { adapter } = makeDesk({ coins: 1000 });
    const { open } = await questionsByStatus(adapter);
    await stakeOn(adapter, open[0]);
    await adapter.settle({ questionId: open[0].id, outcome: 'void' });
    const mine = (await adapter.mine()).data;
    expect(mine.coins).toBe(1000);
    expect(mine.stakes[0]).toMatchObject({ result: 'refunded', payout: 20, settlement: 'refund_void', status: 'settled' });
  });

  it('pays a winner at least the stake and takes it from nobody else', async () => {
    const { adapter, clock } = makeDesk({ coins: 1000 });
    const { open } = await questionsByStatus(adapter);
    await stakeOn(adapter, open[0], { side: 'yes', amount: 20 });
    clock.now = Date.parse(open[0].closesAt) + HOUR;
    await adapter.settle({ questionId: open[0].id, outcome: 'yes' });
    const mine = (await adapter.mine()).data;
    expect(mine.stakes[0]).toMatchObject({ result: 'won', outcome: 'yes' });
    expect(mine.stakes[0].payout).toBeGreaterThanOrEqual(20);
    expect(mine.coins).toBe(980 + mine.stakes[0].payout);
  });

  it('marks a losing stake as lost with no payout', async () => {
    const { adapter, clock } = makeDesk({ coins: 1000 });
    const { open } = await questionsByStatus(adapter);
    await stakeOn(adapter, open[0], { side: 'no', amount: 20 });
    clock.now = Date.parse(open[0].closesAt) + HOUR;
    await adapter.settle({ questionId: open[0].id, outcome: 'yes' });
    const mine = (await adapter.mine()).data;
    expect(mine.stakes[0]).toMatchObject({ result: 'lost', payout: 0, outcome: 'yes' });
    expect(mine.coins).toBe(980);
  });

  it('refuses a settlement from a player who is not a host', async () => {
    const { adapter } = makeDesk({ host: false });
    const { closed } = await questionsByStatus(adapter);
    expect((await adapter.mine()).data.host).toBe(false);
    expect(await adapter.settle({ questionId: closed[0].id, outcome: 'yes' })).toMatchObject({ kind: 'refused', code: 'forbidden' });
  });

  it('refuses a settlement of an unknown question', async () => {
    const { adapter } = makeDesk();
    expect(await adapter.settle({ questionId: 'nope', outcome: 'yes' })).toMatchObject({ kind: 'refused', code: 'no_such_question' });
  });

  it('is a host by default so the presenter tab can be tried', async () => {
    expect((await makeDesk().adapter.mine()).data.host).toBe(true);
  });
});
