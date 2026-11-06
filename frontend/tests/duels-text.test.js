// Lantern Duels, the words on the screen: one sentence per error code, the reveal as steps with
// a running score, and the result and history lines. Pure functions, no DOM.
import { describe, expect, it } from 'vitest';
import { GENERIC_MESSAGE, MESSAGES, messageFor, decidedMessage } from '../src/screens/duels/messages.js';
import { revealSteps, resultText, historyLine, termsText } from '../src/screens/duels/steps.js';

// The answering captain's view after the worked example (docs/INTERFACES.md, Lantern Duels).
const FINISHED = {
  id: '6f1c0c2e-9a52-4b8e-8d3a-0a7c3f1d2b44', status: 'finished', isOpen: false, you: 'opponent',
  challengerName: 'Brave Puffin 17', opponentName: 'Captain-3fa85f', rounds: 5, oil: 5, stake: 100,
  cutPercent: 5, winnerTakes: 190, closedAt: '2026-11-06T10:04:12Z',
  score: { you: 3, them: 1 }, yourResult: 'won', coinsChange: 90,
  yourSignals: ['mirror', 'flash', 'shade', 'shade', 'mirror'],
  reveal: [
    { round: 1, yours: 'mirror', theirs: 'flash', point: 'you' },
    { round: 2, yours: 'flash', theirs: 'shade', point: 'you' },
    { round: 3, yours: 'shade', theirs: 'shade', point: 'even' },
    { round: 4, yours: 'shade', theirs: 'mirror', point: 'you' },
    { round: 5, yours: 'mirror', theirs: 'shade', point: 'them' },
  ],
};
const asChallenger = { ...FINISHED, you: 'challenger', challengerName: 'Captain-3fa85f', opponentName: 'Brave Puffin 17' };

describe('messages', () => {
  const CODES_WITH_A_SENTENCE = [
    'feature_off', 'unauthorized', 'no_such_captain', 'name_not_unique', 'cannot_duel_yourself',
    'too_many_waiting', 'insufficient_funds', 'already_sealed', 'duel_taken', 'duel_closed', 'duel_expired',
    'daily_pair_limit', 'not_your_duel', 'no_such_duel', 'bad_rounds', 'bad_stake', 'wrong_signal_count',
    'not_enough_oil', 'validation_error', 'too_many_requests', 'database_unavailable',
  ];

  it.each(CODES_WITH_A_SENTENCE)('has one plain sentence for %s', code => {
    expect(messageFor(code)).not.toBe('');
    expect(messageFor(code)).not.toBe(GENERIC_MESSAGE);
  });

  it('says nothing for already_applied, because the screen treats it as done', () => {
    expect(messageFor('already_applied')).toBe('');
  });

  it.each(['database_error', 'server_error', 'something_new', undefined, 'constructor'])(
    'gives the generic sentence for %s', code => { expect(messageFor(code)).toBe(GENERIC_MESSAGE); });

  it('uses the exact words of the spec for the common refusals', () => {
    expect(messageFor('duel_taken')).toBe('Another captain answered first. Your coins did not move.');
    expect(messageFor('insufficient_funds')).toBe('You do not have enough coins for this stake.');
    expect(messageFor('feature_off')).toBe('The ring is closed for now.');
  });

  it('shares one sentence between the codes that mean "pick a signal for every round"', () => {
    const sentence = 'Pick a signal for every round within your oil.';
    expect(['bad_rounds', 'bad_stake', 'wrong_signal_count', 'not_enough_oil', 'validation_error'].map(messageFor))
      .toEqual(Array(5).fill(sentence));
  });

  it('writes no em dash and no en dash anywhere', () => {
    expect(Object.values(MESSAGES).filter(sentence => new RegExp('[\\u2013\\u2014]').test(sentence))).toEqual([]);
  });

  it('tells the challenger a duel is decided', () => {
    expect(decidedMessage('Captain-3fa85f')).toBe('Your duel with Captain-3fa85f is decided. Watch the reveal.');
  });
});

describe('the reveal as steps', () => {
  it('has one step per round and then one result step', () => {
    expect(revealSteps(FINISHED).map(step => step.kind)).toEqual(['round', 'round', 'round', 'round', 'round', 'result']);
  });

  it('keeps the running score after every round', () => {
    const scores = revealSteps(FINISHED).filter(step => step.kind === 'round').map(step => step.score);
    expect(scores).toEqual([{ you: 1, them: 0 }, { you: 2, them: 0 }, { you: 2, them: 0 }, { you: 3, them: 0 }, { you: 3, them: 1 }]);
  });

  it('speaks round 2 exactly as the spec words it', () => {
    expect(revealSteps(FINISHED)[1].speech)
      .toBe('Round 2 of 5. You showed Flash, Brave Puffin 17 showed Shade. Flash outshines Shade: your point. 2 to 0.');
  });

  it('shows a line that explains the point', () => {
    expect(revealSteps(FINISHED)[0].line).toBe('Mirror throws Flash back. Your point.');
    expect(revealSteps(FINISHED)[4].line).toBe('Shade leaves Mirror nothing to throw back. Their point.');
  });

  it('says that the same signal scores for nobody', () => {
    const step = revealSteps(FINISHED)[2];
    expect(step.line).toBe('Both showed Shade. Nobody scores.');
    expect(step.speech).toBe('Round 3 of 5. You showed Shade, Brave Puffin 17 showed Shade. Same signal: nobody scores. 2 to 0.');
  });

  it('ends with the result and lists every round for the table', () => {
    const result = revealSteps(FINISHED).at(-1);
    expect(result.banner).toBe('You win 3 to 1. +90 coins (play money).');
    expect(result.rows).toHaveLength(5);
    expect(result.rows[0]).toEqual({ round: 1, yours: 'Mirror', theirs: 'Flash', point: 'Your point' });
  });

  it('gives reduced motion one final step that holds the whole result', () => {
    const steps = revealSteps(FINISHED, { reducedMotion: true });
    expect(steps).toHaveLength(1);
    expect(steps[0].kind).toBe('result');
    expect(steps[0].rows).toHaveLength(5);
  });

  it('names a captain who has left in a neutral way', () => {
    const gone = { ...FINISHED, challengerName: null, reveal: FINISHED.reveal.map(row => ({ ...row, theirs: null })) };
    expect(revealSteps(gone)[0].speech).toContain('The other captain showed');
  });
});

describe('result and history lines', () => {
  it('words a win with the coins', () => {
    expect(resultText(FINISHED)).toBe('You win 3 to 1. +90 coins (play money).');
  });

  it('words a loss with the coins', () => {
    const lost = { ...FINISHED, score: { you: 1, them: 3 }, yourResult: 'lost', coinsChange: -100 };
    expect(resultText(lost)).toBe('You lose 1 to 3. -100 coins (play money).');
  });

  it('words a staked draw as stake returned', () => {
    const draw = { ...FINISHED, score: { you: 1, them: 1 }, yourResult: 'draw', coinsChange: 0 };
    expect(resultText(draw)).toBe('Draw 1 to 1. Stake returned.');
  });

  it('words a friendly win without coins', () => {
    expect(resultText({ ...FINISHED, stake: 0, coinsChange: 0 })).toBe('You win 3 to 1. Friendly duel, no coins.');
  });

  it('writes the history of a win, a loss and a draw', () => {
    const lost = { ...FINISHED, score: { you: 1, them: 3 }, yourResult: 'lost', coinsChange: -100 };
    const draw = { ...FINISHED, score: { you: 1, them: 1 }, yourResult: 'draw', coinsChange: 0 };
    expect(historyLine(FINISHED)).toBe('Won 3 to 1 against Brave Puffin 17, +90 coins');
    expect(historyLine(lost)).toBe('Lost 1 to 3 against Brave Puffin 17, -100 coins');
    expect(historyLine(draw)).toBe('Draw 1 to 1, stake returned');
  });

  it('writes the history of a friendly duel', () => {
    expect(historyLine({ ...FINISHED, stake: 0, coinsChange: 0 })).toBe('Won 3 to 1 against Brave Puffin 17, friendly duel');
  });

  it('writes the history of a withdrawn challenge', () => {
    const withdrawn = { you: 'challenger', status: 'withdrawn', stake: 100, opponentName: null, challengerName: 'Me' };
    expect(historyLine(withdrawn)).toBe('Withdrawn, stake returned');
    expect(historyLine({ ...withdrawn, stake: 0 })).toBe('Withdrawn');
  });

  it('writes the history of a declined challenge for both sides', () => {
    const declined = { status: 'declined', stake: 25, challengerName: 'Me', opponentName: 'Captain-3fa85f' };
    expect(historyLine({ ...declined, you: 'challenger' })).toBe('Declined by Captain-3fa85f, stake returned');
    expect(historyLine({ ...declined, you: 'opponent' })).toBe('You declined the challenge from Me');
  });

  it('writes the history of a challenge nobody answered in time', () => {
    const expired = { status: 'expired', stake: 10, challengerName: 'Me', opponentName: null };
    expect(historyLine({ ...expired, you: 'challenger' })).toBe('No answer within 24 h, stake returned');
    expect(historyLine({ ...expired, you: 'opponent', opponentName: 'Captain-3fa85f' })).toBe('You did not answer Me within 24 h');
  });

  it('words the terms of a staked and of a friendly duel', () => {
    expect(termsText(FINISHED)).toBe('5 rounds, stake 100, winner takes 190');
    expect(termsText({ rounds: 3, stake: 0, winnerTakes: 0 })).toBe('3 rounds, friendly duel');
  });

  it('reads a duel from the challenger side too', () => {
    expect(historyLine(asChallenger)).toBe('Won 3 to 1 against Brave Puffin 17, +90 coins');
  });
});
