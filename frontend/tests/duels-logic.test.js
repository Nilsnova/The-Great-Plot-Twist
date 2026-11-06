// Lantern Duels, pure rules on the screen side: signals, oil, the sealed picker, payouts,
// captain names and time left. Same numbers as the server (docs/INTERFACES.md, Lantern Duels).
// No DOM and no network: these functions are plain data in, plain data out.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SIGNALS, OIL_COST, ROUND_CHOICES, STAKE_CHOICES,
  oilFor, sequenceCost, allValidSequences, roundPoint, resolve, winnerTakes, coinsChange,
  checkChoices, checkSequence, emptyPicks, oilLeft, canPick, pick, isSealable, needsText,
  isCaptainName, otherCaptainName, timeLeftText, newActionUid,
} from '../src/screens/duels/logic.js';

const WORKED_CHALLENGER = ['flash', 'shade', 'shade', 'mirror', 'shade'];
const WORKED_ANSWERER = ['mirror', 'flash', 'shade', 'shade', 'mirror'];

// Helpers that loop, so each test below can state one plain expectation.
const swapped = point => ({ challenger: 'opponent', opponent: 'challenger', even: 'even' })[point];
function pairsThatDoNotSwap(rounds) {
  const sequences = allValidSequences(rounds), bad = [];
  for (const a of sequences) {
    for (const b of sequences) {
      const forward = resolve(a, b), backward = resolve(b, a);
      if (backward.roundResults.join() !== forward.roundResults.map(swapped).join()) bad.push([a, b]);
    }
  }
  return bad;
}
function unbeatableSequences(rounds) {
  const sequences = allValidSequences(rounds);
  return sequences.filter(a => !sequences.some(b => resolve(b, a).outcome === 'challenger'));
}

describe('signals and oil', () => {
  it('has the three signals of the ring', () => {
    expect(SIGNALS).toEqual(['flash', 'shade', 'mirror']);
  });

  it('burns 2 oil for flash, 1 for mirror and none for shade', () => {
    expect(OIL_COST).toEqual({ flash: 2, mirror: 1, shade: 0 });
  });

  it('gives as much oil as the duel has rounds', () => {
    expect([oilFor(3), oilFor(5)]).toEqual([3, 5]);
  });

  it('adds up what a sequence burns', () => {
    expect(sequenceCost(WORKED_CHALLENGER)).toBe(3);
    expect(sequenceCost(WORKED_ANSWERER)).toBe(4);
  });

  it.each([[3, 17], [5, 147]])('allows %i-round sequences in exactly %i ways', (rounds, count) => {
    expect(allValidSequences(rounds)).toHaveLength(count);
  });

  it('offers only the rounds and stakes the server accepts', () => {
    expect(ROUND_CHOICES).toEqual([3, 5]);
    expect(STAKE_CHOICES).toEqual([0, 10, 25, 50, 100]);
  });
});

describe('who takes a round', () => {
  it.each([
    ['flash', 'shade', 'challenger'], ['shade', 'flash', 'opponent'],
    ['shade', 'mirror', 'challenger'], ['mirror', 'shade', 'opponent'],
    ['mirror', 'flash', 'challenger'], ['flash', 'mirror', 'opponent'],
  ])('%s against %s goes to the %s', (challenger, opponent, winner) => {
    expect(roundPoint(challenger, opponent)).toBe(winner);
  });

  it.each(SIGNALS)('scores nothing when both show %s', signal => {
    expect(roundPoint(signal, signal)).toBe('even');
  });

  it('gives the worked example 1 to 3 for the answering captain', () => {
    const result = resolve(WORKED_CHALLENGER, WORKED_ANSWERER);
    expect(result.roundResults).toEqual(['opponent', 'opponent', 'even', 'opponent', 'challenger']);
    expect([result.challengerPoints, result.opponentPoints, result.outcome]).toEqual([1, 3, 'opponent']);
  });

  it('calls equal points a draw', () => {
    const result = resolve(['flash', 'shade', 'shade'], ['shade', 'flash', 'shade']);
    expect([result.challengerPoints, result.opponentPoints, result.outcome]).toEqual([1, 1, 'draw']);
  });

  it.each([3, 5])('swaps the result when the captains swap, for every %i-round pair', rounds => {
    expect(pairsThatDoNotSwap(rounds)).toEqual([]);
  });

  it.each([3, 5])('has no unbeatable %i-round sequence', rounds => {
    expect(unbeatableSequences(rounds)).toEqual([]);
  });
});

describe('what the server would refuse', () => {
  it.each([[3, 0], [5, 100], [3, 25]])('accepts %i rounds at stake %i', (rounds, stake) => {
    expect(checkChoices(rounds, stake)).toBe(null);
  });

  it('refuses a round count other than 3 or 5', () => {
    expect(checkChoices(4, 10)).toBe('bad_rounds');
  });

  it('refuses a stake that is not one of the five', () => {
    expect(checkChoices(3, 30)).toBe('bad_stake');
  });

  it('refuses a list with more or fewer signals than the duel has rounds', () => {
    expect(checkSequence(['flash', 'shade', 'shade', 'shade'], 3)).toBe('wrong_signal_count');
  });

  it('refuses a list shorter than 3 signals as a malformed body, like the server', () => {
    expect(checkSequence(['flash', 'shade'], 3)).toBe('validation_error');
  });

  it('refuses a sequence that burns more oil than the duel has', () => {
    expect(checkSequence(['flash', 'flash', 'mirror', 'mirror', 'shade'], 5)).toBe('not_enough_oil');
  });

  it('refuses a signal the ring does not know', () => {
    expect(checkSequence(['flash', 'shade', 'lamp'], 3)).toBe('validation_error');
  });

  it('accepts the worked example', () => {
    expect(checkSequence(WORKED_ANSWERER, 5)).toBe(null);
  });
});

describe('money', () => {
  it.each([[10, 19], [25, 47], [50, 95], [100, 190]])('lets the winner of a %i stake take %i', (stake, takes) => {
    expect(winnerTakes(stake, 5)).toBe(takes);
  });

  it('pays nothing for a friendly duel', () => {
    expect(winnerTakes(0, 5)).toBe(0);
    expect(coinsChange(0, 5, 'challenger', 'challenger')).toBe(0);
  });

  it('shows the worked example as +90 for the winner and -100 for the loser', () => {
    expect(coinsChange(100, 5, 'opponent', 'opponent')).toBe(90);
    expect(coinsChange(100, 5, 'opponent', 'challenger')).toBe(-100);
  });

  it('returns both stakes on a draw', () => {
    expect([coinsChange(50, 5, 'draw', 'challenger'), coinsChange(50, 5, 'draw', 'opponent')]).toEqual([0, 0]);
  });

  it.each([[10, 1], [25, 3], [50, 5], [100, 10]])('keeps the cut of a %i stake out of play (%i coins)', (stake, cut) => {
    const total = coinsChange(stake, 5, 'challenger', 'challenger') + coinsChange(stake, 5, 'challenger', 'opponent');
    expect(total).toBe(-cut);
  });
});

describe('the sealed picker', () => {
  const afterFlash = ['flash', null, null];

  it('starts with an empty pick for every round and all the oil', () => {
    expect(emptyPicks(3)).toEqual([null, null, null]);
    expect(oilLeft(3, emptyPicks(3))).toBe(3);
  });

  it('counts the oil that is left after each choice', () => {
    expect(oilLeft(3, afterFlash)).toBe(1);
    expect(oilLeft(5, WORKED_ANSWERER)).toBe(1);
  });

  it('offers a signal only when the oil can pay for it', () => {
    expect(canPick(3, afterFlash, 1, 'flash')).toBe(false);
    expect(canPick(3, afterFlash, 1, 'mirror')).toBe(true);
  });

  it('lets an unfilled round take shade even when every drop of oil is used', () => {
    const allOilUsed = ['flash', 'mirror', null];
    expect(oilLeft(3, allOilUsed)).toBe(0);
    expect(canPick(3, allOilUsed, 2, 'shade')).toBe(true);
    expect(canPick(3, allOilUsed, 2, 'mirror')).toBe(false);
  });

  it('counts the oil of the round being changed as free again', () => {
    expect(canPick(3, afterFlash, 0, 'flash')).toBe(true);
  });

  it('says what is missing for a signal that is not offered', () => {
    expect(needsText(3, afterFlash, 1, 'flash')).toBe('needs 2 oil, 1 left');
  });

  it('puts a chosen signal into a copy and leaves the old picks alone', () => {
    const next = pick(3, afterFlash, 1, 'mirror');
    expect(next).toEqual(['flash', 'mirror', null]);
    expect(afterFlash).toEqual(['flash', null, null]);
  });

  it('ignores a choice the oil cannot pay for', () => {
    expect(pick(3, afterFlash, 1, 'flash')).toEqual(afterFlash);
  });

  it('frees the oil again when a round is changed to shade', () => {
    expect(oilLeft(3, pick(3, afterFlash, 0, 'shade'))).toBe(3);
  });

  it('cannot be sealed until every round has a signal', () => {
    expect(isSealable(3, afterFlash)).toBe(false);
  });

  it('can be sealed when every round has a signal within the oil', () => {
    expect(isSealable(5, WORKED_ANSWERER)).toBe(true);
  });

  it('cannot be sealed when the signals burn too much oil', () => {
    expect(isSealable(3, ['flash', 'flash', 'shade'])).toBe(false);
  });
});

describe('captain names', () => {
  it.each(['Brave Puffin 17', 'Captain-3fa85f', 'ab', 'A_b.c-d', '  Captain-3fa85f  ', 'x'.repeat(24)])(
    'accepts %j', name => { expect(isCaptainName(name)).toBe(true); });

  it.each(['', 'a', ' a ', 'x'.repeat(25), 'bad<name>', 'émile', 'tab\tname', null, undefined])(
    'refuses %j', name => { expect(isCaptainName(name)).toBe(false); });

  it('names the other captain from the point of view of the summary', () => {
    const base = { challengerName: 'Brave Puffin 17', opponentName: 'Captain-3fa85f' };
    expect(otherCaptainName({ ...base, you: 'challenger' })).toBe('Captain-3fa85f');
    expect(otherCaptainName({ ...base, you: 'opponent' })).toBe('Brave Puffin 17');
    expect(otherCaptainName({ ...base, you: 'visitor' })).toBe('Brave Puffin 17');
  });

  it('has no name for a captain who has left', () => {
    expect(otherCaptainName({ you: 'challenger', challengerName: 'Me', opponentName: null })).toBe(null);
  });
});

describe('time left', () => {
  const start = Date.parse('2026-11-06T10:00:00Z');
  const hoursLater = (hours, extraMinutes = 0) => new Date(start + (hours * 60 + extraMinutes) * 60000).toISOString();

  it('counts whole hours while an hour or more is left', () => {
    expect(timeLeftText(hoursLater(23, 40), start)).toBe('23 h');
  });

  it('counts minutes in the last hour', () => {
    expect(timeLeftText(hoursLater(0, 25), start)).toBe('25 min');
  });

  it('never shows less than 1 minute while there is time', () => {
    expect(timeLeftText(new Date(start + 20000).toISOString(), start)).toBe('1 min');
  });

  it('says the time is up when the deadline has passed', () => {
    expect(timeLeftText(hoursLater(0, -5), start)).toBe('time is up');
  });
});

describe('action uids', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('makes a uid the server accepts (8 to 64 letters, digits, hyphens or underscores)', () => {
    expect(newActionUid()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('makes a different uid every time', () => {
    expect(newActionUid()).not.toBe(newActionUid());
  });

  it('still works in a page that has no crypto.randomUUID', () => {
    vi.stubGlobal('crypto', {});
    expect(newActionUid()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});
