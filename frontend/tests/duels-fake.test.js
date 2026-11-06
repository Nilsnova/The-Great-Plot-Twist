// Lantern Duels, the local practice ring (?arena=local): a stand-in server in memory with a
// seeded rival. It must play by the server's rules: stakes held once, payouts once, the same
// refusals, and the other captain's sealed signals never shown before the reveal.
// A fake clock and fake timers stand in for time; nothing touches the network.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seededRandom } from '../src/core/math.js';
import { createRing, PRACTICE_NAME } from '../src/screens/duels/fake-ring.js';
import { createFakeAdapter } from '../src/screens/duels/fake-adapter.js';
import { sequenceCost, winnerTakes } from '../src/screens/duels/logic.js';

const START = Date.parse('2026-11-06T10:00:00Z');
const HOUR = 3600 * 1000;
const FLAT = ['shade', 'shade', 'shade'];
let clock;
const makeRing = (options = {}) => createRing({ now: () => clock, random: seededRandom(3), ...options });
const challengeInput = (extra = {}) => ({
  opponentName: 'Captain-3fa85f', rounds: 3, stake: 50, signals: ['flash', 'mirror', 'shade'], actionUid: 'uid-challenge-1', ...extra,
});
const byName = (list, name) => list.find(duel => duel.challengerName === name);
const idOf = (ring, name) => byName(ring.list().incoming.concat(ring.list().openChallenges), name).id;

beforeEach(() => { clock = START; });

describe('the practice ring at the start', () => {
  it('begins with 500 coins and nothing held', () => {
    const list = makeRing().list();
    expect([list.coins, list.heldCoins]).toEqual([500, 0]);
  });

  it('has one named challenge from Brave Puffin 17: 3 rounds, friendly', () => {
    const [incoming] = makeRing().list().incoming;
    expect([incoming.challengerName, incoming.rounds, incoming.stake, incoming.canAnswer, incoming.canDecline])
      .toEqual(['Brave Puffin 17', 3, 0, true, true]);
  });

  it('has one open challenge from Captain-7c41d2: 5 rounds, stake 25, winner takes 47', () => {
    const [open] = makeRing().list().openChallenges;
    expect([open.challengerName, open.rounds, open.stake, open.winnerTakes, open.you]).toEqual(['Captain-7c41d2', 5, 25, 47, 'visitor']);
  });

  it('has two past duels: a win worth +90 and an expired challenge', () => {
    const recent = makeRing().list().recent;
    expect(recent.map(duel => duel.status).sort()).toEqual(['expired', 'finished']);
    expect(recent.find(duel => duel.status === 'finished')).toMatchObject({ yourResult: 'won', coinsChange: 90, score: { you: 3, them: 1 } });
  });

  it('keeps the signals out of every summary', () => {
    const { incoming, openChallenges, yours, recent } = makeRing().list();
    const leaked = [...incoming, ...openChallenges, ...yours, ...recent].filter(duel => 'reveal' in duel || 'yourSignals' in duel);
    expect(leaked).toEqual([]);
  });

  it('shows the same lists and details whatever the other captains sealed', () => {
    const one = makeRing({ random: seededRandom(1) }), other = makeRing({ random: seededRandom(2) });
    const incomingId = one.list().incoming[0].id;
    expect(JSON.stringify(one.list())).toBe(JSON.stringify(other.list()));
    expect(JSON.stringify(one.detail(incomingId))).toBe(JSON.stringify(other.detail(incomingId)));
  });

  it('replays the worked example from the stored win', () => {
    const ring = makeRing(), won = ring.list().recent.find(duel => duel.status === 'finished');
    const reveal = ring.detail(won.id).duel.reveal;
    expect(reveal.map(entry => entry.point)).toEqual(['you', 'you', 'even', 'you', 'them']);
  });
});

describe('sending a challenge', () => {
  it('holds the stake once and lists the challenge as waiting', () => {
    const ring = makeRing(), result = ring.challenge(challengeInput());
    expect([result.ok, result.coins]).toEqual([true, 450]);
    expect([ring.list().coins, ring.list().heldCoins]).toEqual([450, 50]);
    expect(ring.list().yours[0]).toMatchObject({ status: 'open', heldStake: 50, canWithdraw: true });
  });

  it('answers with the sealed signals of the challenger only', () => {
    const result = makeRing().challenge(challengeInput());
    expect(result.duel.yourSignals).toEqual(['flash', 'mirror', 'shade']);
    expect(result.duel.reveal).toBe(null);
  });

  it('creates one challenge when the same actionUid arrives twice', () => {
    const ring = makeRing();
    ring.challenge(challengeInput());
    const again = ring.challenge(challengeInput());
    expect([again.ok, again.code]).toEqual([false, 'already_applied']);
    expect([ring.list().yours.length, ring.list().coins]).toEqual([1, 450]);
  });

  it('takes no coins for an open friendly challenge', () => {
    const ring = makeRing();
    ring.challenge(challengeInput({ opponentName: null, stake: 0 }));
    expect(ring.list().coins).toBe(500);
    expect(ring.list().yours[0].isOpen).toBe(true);
  });

  it.each([
    ['rounds other than 3 or 5', { rounds: 4 }, 'bad_rounds'],
    ['a stake that is not one of the five', { stake: 30 }, 'bad_stake'],
    ['fewer than 3 signals', { signals: ['flash', 'shade'] }, 'validation_error'],
    ['more signals than rounds', { signals: ['shade', 'shade', 'shade', 'shade'] }, 'wrong_signal_count'],
    ['signals that burn too much oil', { signals: ['flash', 'flash', 'mirror'] }, 'not_enough_oil'],
    ['a captain nobody knows', { opponentName: 'Nobody Here' }, 'no_such_captain'],
    ['your own name, in any letter case', { opponentName: PRACTICE_NAME.toUpperCase() }, 'cannot_duel_yourself'],
    ['a name that breaks the display-name rule', { opponentName: 'bad<name>' }, 'validation_error'],
  ])('refuses %s', (_label, change, code) => {
    const ring = makeRing(), result = ring.challenge(challengeInput(change));
    expect([result.ok, result.code]).toEqual([false, code]);
    expect(ring.list().coins).toBe(500);
  });

  it('finds a named captain whatever the letter case', () => {
    expect(makeRing().challenge(challengeInput({ opponentName: ' brave puffin 17 ' })).ok).toBe(true);
  });

  it('refuses a fourth waiting challenge', () => {
    const ring = makeRing();
    for (const uid of ['uid-a-001', 'uid-b-002', 'uid-c-003']) ring.challenge(challengeInput({ actionUid: uid, stake: 0 }));
    expect(ring.challenge(challengeInput({ actionUid: 'uid-d-004' })).code).toBe('too_many_waiting');
  });

  it('refuses a stake the coins cannot pay', () => {
    const ring = makeRing({ coins: 40 });
    expect(ring.challenge(challengeInput({ stake: 50 })).code).toBe('insufficient_funds');
    expect(ring.list().coins).toBe(40);
  });
});

describe('withdrawing, declining and expiring', () => {
  it('gives the stake back once when the challenger withdraws', () => {
    const ring = makeRing(), id = ring.challenge(challengeInput()).duel.id;
    const result = ring.cancel(id);
    expect([result.ok, result.coins, result.duel.status]).toEqual([true, 500, 'withdrawn']);
    expect(ring.cancel(id).code).toBe('already_applied');
    expect(ring.list().coins).toBe(500);
  });

  it('lets the named captain decline, without a coin change for the decliner', () => {
    const ring = makeRing(), result = ring.cancel(idOf(ring, 'Brave Puffin 17'));
    expect([result.ok, result.coins, result.duel.status]).toEqual([true, null, 'declined']);
  });

  it('refuses a visitor who tries to withdraw an open challenge', () => {
    const ring = makeRing();
    expect(ring.cancel(idOf(ring, 'Captain-7c41d2')).code).toBe('not_your_duel');
  });

  it('refuses to cancel a duel that is already decided', () => {
    const ring = makeRing(), won = ring.list().recent.find(duel => duel.status === 'finished');
    expect(ring.cancel(won.id).code).toBe('duel_closed');
  });

  it('returns the stake of a challenge nobody answered within 24 hours, once', () => {
    const ring = makeRing(), id = ring.challenge(challengeInput()).duel.id;
    clock += 24 * HOUR + 1000;
    const list = ring.list();
    expect([list.coins, list.heldCoins, list.yours.length]).toEqual([500, 0, 0]);
    expect(list.recent.find(duel => duel.id === id).status).toBe('expired');
    expect(ring.list().coins).toBe(500);
  });

  it('refuses a late answer to an expired challenge', () => {
    const ring = makeRing(), id = idOf(ring, 'Captain-7c41d2');
    clock += 25 * HOUR;
    expect(ring.answer(id, ['shade', 'shade', 'shade', 'shade', 'shade'], 'uid-late-001').code).toBe('duel_expired');
  });
});

describe('answering a challenge', () => {
  it('shows the reveal from the answering side and pays nothing for a friendly duel', () => {
    const ring = makeRing(), result = ring.answer(idOf(ring, 'Brave Puffin 17'), FLAT, 'uid-answer-1');
    expect(result.ok).toBe(true);
    expect(result.duel).toMatchObject({ status: 'finished', yourSignals: FLAT, coinsChange: 0 });
    expect(result.duel.reveal).toHaveLength(3);
    expect(result.coins).toBe(500);
  });

  it('pays what the result says and moves no coin twice', () => {
    const ring = makeRing(), result = ring.answer(idOf(ring, 'Captain-7c41d2'), ['shade', 'shade', 'shade', 'shade', 'shade'], 'uid-answer-2');
    expect(result.coins).toBe(500 + result.duel.coinsChange);
    expect(ring.list().coins).toBe(result.coins);
  });

  it('returns both stakes on a draw', () => {
    const first = makeRing(), id = idOf(first, 'Captain-7c41d2');
    const theirs = first.answer(id, ['shade', 'shade', 'shade', 'shade', 'shade'], 'uid-probe-01').duel.reveal.map(entry => entry.theirs);
    const second = makeRing(), draw = second.answer(idOf(second, 'Captain-7c41d2'), theirs, 'uid-draw-001');
    expect([draw.duel.yourResult, draw.coins]).toEqual(['draw', 500]);
  });

  it('answers a repeated actionUid with already_applied and changes nothing', () => {
    const ring = makeRing(), id = idOf(ring, 'Brave Puffin 17');
    ring.answer(id, FLAT, 'uid-answer-1');
    expect(ring.answer(id, FLAT, 'uid-answer-1').code).toBe('already_applied');
  });

  it('answers a second try with a new actionUid with already_sealed', () => {
    const ring = makeRing(), id = idOf(ring, 'Brave Puffin 17');
    ring.answer(id, FLAT, 'uid-answer-1');
    expect(ring.answer(id, FLAT, 'uid-answer-2').code).toBe('already_sealed');
  });

  it('does not let the challenger answer their own challenge', () => {
    const ring = makeRing(), id = ring.challenge(challengeInput()).duel.id;
    expect(ring.answer(id, ['shade', 'shade', 'shade'], 'uid-self-001').code).toBe('already_sealed');
  });

  it('refuses an answer to a declined challenge', () => {
    const ring = makeRing(), id = idOf(ring, 'Brave Puffin 17');
    ring.cancel(id);
    expect(ring.answer(id, FLAT, 'uid-answer-3').code).toBe('duel_closed');
  });

  it('refuses a sequence that burns too much oil', () => {
    const ring = makeRing(), id = idOf(ring, 'Brave Puffin 17');
    expect(ring.answer(id, ['flash', 'flash', 'flash'], 'uid-answer-4').code).toBe('not_enough_oil');
  });

  it('refuses an answer the coins cannot pay for and leaves the duel open', () => {
    const ring = makeRing({ coins: 20 }), id = idOf(ring, 'Captain-7c41d2');
    expect(ring.answer(id, ['shade', 'shade', 'shade', 'shade', 'shade'], 'uid-answer-5').code).toBe('insufficient_funds');
    expect(ring.list().openChallenges).toHaveLength(1);
  });

  it('stops a fourth staked duel with the same captain on the same day', () => {
    const ring = makeRing();
    for (const uid of ['uid-p-0001', 'uid-p-0002', 'uid-p-0003']) {
      ring.rivalAnswers(ring.challenge(challengeInput({ opponentName: 'Captain-7c41d2', stake: 10, actionUid: uid })).duel.id);
    }
    expect(ring.answer(idOf(ring, 'Captain-7c41d2'), ['shade', 'shade', 'shade', 'shade', 'shade'], 'uid-p-0004').code).toBe('daily_pair_limit');
  });

  it('has no such duel for an unknown id', () => {
    expect(makeRing().answer('not-a-duel', FLAT, 'uid-answer-6').code).toBe('no_such_duel');
  });
});

describe('the practice rival', () => {
  it('answers a waiting challenge with a sequence that fits the oil', () => {
    const ring = makeRing(), id = ring.challenge(challengeInput({ rounds: 5, signals: ['shade', 'shade', 'shade', 'shade', 'shade'] })).duel.id;
    expect(ring.rivalAnswers(id)).toBe(true);
    const theirs = ring.detail(id).duel.reveal.map(entry => entry.theirs);
    expect(sequenceCost(theirs)).toBeLessThanOrEqual(5);
  });

  it('plays the same sequence for the same seed', () => {
    const play = seed => {
      const ring = makeRing({ random: seededRandom(seed) }), id = ring.challenge(challengeInput()).duel.id;
      ring.rivalAnswers(id);
      return ring.detail(id).duel.reveal.map(entry => entry.theirs);
    };
    expect(play(9)).toEqual(play(9));
  });

  it('pays the challenger what the result says, exactly once', () => {
    const ring = makeRing(), id = ring.challenge(challengeInput()).duel.id;
    ring.rivalAnswers(id);
    ring.rivalAnswers(id);
    const duel = ring.detail(id).duel;
    expect(ring.list().coins).toBe(500 + duel.coinsChange);
    expect([0, -50, winnerTakes(50) - 50]).toContain(duel.coinsChange);
  });

  it('never answers a challenge that was withdrawn', () => {
    const ring = makeRing(), id = ring.challenge(challengeInput()).duel.id;
    ring.cancel(id);
    expect(ring.rivalAnswers(id)).toBe(false);
  });

  it('shows the rival signals only after the reveal', () => {
    const ring = makeRing(), id = ring.challenge(challengeInput()).duel.id;
    expect(ring.detail(id).duel.reveal).toBe(null);
    ring.rivalAnswers(id);
    expect(ring.detail(id).duel.reveal).toHaveLength(3);
  });
});

describe('the practice adapter', () => {
  let adapter;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    adapter = createFakeAdapter();
  });
  afterEach(() => {
    adapter.dispose();
    vi.useRealTimers();
  });
  const send = (extra = {}) => adapter.challenge({ opponentName: 'Captain-3fa85f', rounds: 3, stake: 50, signals: ['flash', 'mirror', 'shade'], ...extra });

  it('starts in practice mode with the lists filled and no polling', () => {
    expect(adapter.read()).toMatchObject({ mode: 'practice', coins: 500, polling: 'off', selected: null, canRetry: false });
    expect(adapter.read().incoming).toHaveLength(1);
  });

  it('hands out copies, so the panel cannot change the ring', () => {
    const view = adapter.read();
    view.coins = 1;
    view.incoming.length = 0;
    expect(adapter.read().coins).toBe(500);
    expect(adapter.read().incoming).toHaveLength(1);
  });

  it('tells a subscriber about every change until it stops listening', async () => {
    const listener = vi.fn(), stop = adapter.subscribe(listener);
    await send();
    expect(listener).toHaveBeenCalled();
    stop();
    listener.mockClear();
    await adapter.refresh();
    await send({ stake: 10 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('shows a sent challenge as waiting, with the sealed signals remembered for its card', async () => {
    const result = await send();
    const id = result.view.yours[0].id;
    expect(result.ok).toBe(true);
    expect(result.view.sealed[id]).toEqual(['flash', 'mirror', 'shade']);
    expect([result.view.coins, result.view.heldCoins]).toEqual([450, 50]);
  });

  it('keeps the rival quiet for 6 seconds and then lets it answer', async () => {
    await send();
    await vi.advanceTimersByTimeAsync(5999);
    expect(adapter.read().yours).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(adapter.read().yours).toHaveLength(0);
    expect(adapter.read().recent[0].status).toBe('finished');
  });

  it('announces a decided duel and has its reveal ready', async () => {
    await send();
    await vi.advanceTimersByTimeAsync(6000);
    const view = adapter.read();
    expect(view.notice).toMatchObject({ code: 'decided', message: 'Your duel with Captain-3fa85f is decided. Watch the reveal.' });
    expect(view.selected.status).toBe('finished');
    expect(view.selected.reveal).toHaveLength(3);
  });

  it('never lets the rival answer a withdrawn challenge', async () => {
    const id = (await send()).view.yours[0].id;
    await adapter.cancel(id);
    await vi.advanceTimersByTimeAsync(10000);
    expect(adapter.read().recent[0].status).toBe('withdrawn');
    expect(adapter.read().coins).toBe(500);
  });

  it('stops the rival when the adapter is disposed', async () => {
    await send();
    adapter.dispose();
    await vi.advanceTimersByTimeAsync(10000);
    expect(adapter.read().yours).toHaveLength(1);
  });

  it('answers a challenge and leaves the finished duel ready for the reveal', async () => {
    const result = await adapter.answer(adapter.read().incoming[0].id, FLAT);
    expect(result.ok).toBe(true);
    expect(result.view.selected).toMatchObject({ status: 'finished', yourSignals: FLAT });
  });

  it('gives a refusal a plain sentence and keeps it as the notice', async () => {
    const result = await send({ stake: 30 });
    expect(result).toMatchObject({ ok: false, code: 'bad_stake', message: 'Pick a signal for every round within your oil.' });
    expect(result.view.notice.code).toBe('bad_stake');
  });

  it('loads a past duel for a replay', async () => {
    const won = adapter.read().recent.find(duel => duel.status === 'finished');
    const result = await adapter.select(won.id);
    expect(result.view.selected.reveal).toHaveLength(5);
  });

  it('says no_such_duel when asked for a duel that is not there', async () => {
    expect((await adapter.select('missing')).code).toBe('no_such_duel');
  });

  it('only reads again on retry, because the practice ring never loses an answer', async () => {
    const result = await adapter.retry();
    expect(result.ok).toBe(true);
  });

  it('shows the same view whatever the rival would play, until the reveal', async () => {
    const other = createFakeAdapter({ seed: 99 });
    const pending = view => JSON.stringify({ ...view, notice: null });
    expect(pending(adapter.read())).toBe(pending(other.read()));
    await send();
    await other.challenge({ opponentName: 'Captain-3fa85f', rounds: 3, stake: 50, signals: ['flash', 'mirror', 'shade'] });
    expect(pending(adapter.read())).toBe(pending(other.read()));
    other.dispose();
  });

  it('can run without a rival delay so that tests and demos keep control', async () => {
    adapter.dispose();
    adapter = createFakeAdapter({ rivalDelayMs: null });
    await send();
    await vi.advanceTimersByTimeAsync(60000);
    expect(adapter.read().yours).toHaveLength(1);
  });
});
