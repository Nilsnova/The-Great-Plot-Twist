// The display text of the desk: pool lines, closing labels, results, the stake input check and the plain sentences.
import { describe, expect, it } from 'vitest';
import {
  captainsText,
  cardModel,
  checkStakeInput,
  coinsText,
  hintLine,
  payoutText,
  poolLines,
  settledLine,
  sideLine,
  stakeConfirmText,
  stakePlacedLine,
  stakeResultLine,
  stakeSummary,
  todayLine,
  topicText,
  whyNotStaking,
} from '../../src/screens/predictions/view-model.js';
import { CLOSED_LINE, CREDIT_LINE, GENERIC_LINE, PLAY_MONEY_LINE, SIGN_IN_LINE, refusalText, sentenceFor } from '../../src/screens/predictions/messages.js';
import { closingLabel, formatLocalTime, timeOfDay } from '../../src/screens/predictions/time-labels.js';
import { CREDIT, PLAY_MONEY, RULES, mineAnswer, question, stakeRow } from './sample-answers.js';

const NOW = Date.parse('2026-11-06T12:00:00Z');
const UTC = { timeZone: 'UTC' };

describe('the fixed lines', () => {
  it('has the play-money line and the credit, word for word', () => {
    expect(PLAY_MONEY_LINE).toBe(PLAY_MONEY);
    expect(CREDIT_LINE).toBe(CREDIT);
    expect(PLAY_MONEY_LINE).toContain('no cash value');
    expect(CREDIT_LINE).toContain('Manifold');
  });

  it('never mentions a link or a betting site', () => {
    for (const line of [PLAY_MONEY_LINE, CREDIT_LINE, CLOSED_LINE]) expect(line).not.toMatch(/https?:|www\./);
  });
});

describe('units', () => {
  it('writes coins and captains with the right number', () => {
    expect(coinsText(1)).toBe('🪙 1');
    expect(coinsText(0)).toBe('🪙 0');
    expect(coinsText(20)).toBe('🪙 20');
    expect(coinsText(1200)).toBe('🪙 1,200');
    expect(captainsText(1)).toBe('1 captain');
    expect(captainsText(4)).toBe('4 captains');
  });

  it('names the topics and has a word for an unknown one', () => {
    expect(topicText('weather')).toBe('Weather');
    expect(topicText('technology')).toBe('Technology');
    expect(topicText('something-new')).toBe('General');
  });
});

describe('the payout per coin', () => {
  it('shows a number as "about 1.62" with two decimals', () => {
    expect(payoutText(1.62)).toBe('about 1.62');
    expect(payoutText(1)).toBe('about 1.00');
    expect(payoutText('2.4')).toBe('about 2.40');
  });

  it('rounds down to two decimals, never up, so it never promises more than the pool pays', () => {
    expect(payoutText(1.999)).toBe('about 1.99');
    expect(payoutText(1.15)).toBe('about 1.15');
    expect(payoutText(2.4285)).toBe('about 2.42');
  });

  it('shows null (and anything else that is not a number) as "no stakes yet"', () => {
    expect(payoutText(null)).toBe('no stakes yet');
    expect(payoutText(undefined)).toBe('no stakes yet');
    expect(payoutText(Number.NaN)).toBe('no stakes yet');
  });
});

describe('the pool lines', () => {
  const yes = { side: 'yes', label: 'Yes', coins: 120, players: 4, payoutPerCoin: 1.62 };
  const no = { side: 'no', label: 'No', coins: 80, players: 3, payoutPerCoin: 2.43 };
  const emptyNo = { side: 'no', label: 'No', coins: 0, players: 0, payoutPerCoin: null };

  it('writes a side with stakes', () => {
    expect(sideLine(yes)).toBe('YES: 🪙 120 from 4 captains. If YES wins, each coin brings back about 1.62 coins.');
  });

  it('writes a side with one coin from one captain', () => {
    const line = sideLine({ ...no, coins: 1, players: 1, payoutPerCoin: 1 });
    expect(line).toBe('NO: 🪙 1 from 1 captain. If NO wins, each coin brings back about 1.00 coins.');
  });

  it('writes the one-sided note for a side nobody picked', () => {
    expect(sideLine(emptyNo)).toBe('Nobody has picked NO yet. If nobody does, everybody gets their coins back.');
  });

  it('gives one line per side', () => {
    expect(poolLines(question())).toHaveLength(2);
    expect(poolLines(question({ sides: [yes, emptyNo] }))[1]).toContain('Nobody has picked NO yet');
  });

  it('leaves the "if it wins" sentence out once the question is settled', () => {
    const settled = question({ status: 'settled', outcome: 'yes', settlement: 'winners' });
    expect(poolLines(settled)).toEqual(['YES: 🪙 120 from 4 captains.', 'NO: 🪙 80 from 3 captains.']);
    expect(sideLine(emptyNo, { settled: true })).toBe('Nobody picked NO.');
    const nobody = question({ status: 'settled', totalCoins: 0, sides: [{ ...emptyNo, side: 'yes', label: 'Yes' }, emptyNo] });
    expect(poolLines(nobody)).toEqual(['Nobody staked on this question.']);
  });

  it('copes with a question that has no sides', () => {
    expect(poolLines(question({ sides: undefined }))).toEqual([]);
  });

  it('says so when nobody has staked at all', () => {
    const empty = question({
      sides: [
        { ...emptyNo, side: 'yes', label: 'Yes' },
        emptyNo,
      ],
      totalCoins: 0,
    });
    expect(poolLines(empty)).toEqual(['Nobody has staked on this question yet.']);
  });
});

describe('times and closing labels', () => {
  it('formats a UTC time in the given zone with the zone name', () => {
    expect(formatLocalTime('2026-12-17T12:00:00Z', UTC)).toBe('Thu 17 Dec, 12:00 UTC');
    expect(formatLocalTime('2026-12-17T12:00:00Z', { timeZone: 'Europe/Berlin' })).toMatch(/^Thu 17 Dec, 13:00 /);
  });

  it('gives a plain time of day for the Manifold decision', () => {
    expect(timeOfDay('2026-11-20T14:02:00Z', UTC)).toBe('14:02');
  });

  it('counts the days to the close', () => {
    expect(closingLabel('2026-12-17T12:00:00Z', NOW, UTC)).toBe('Staking closes Thu 17 Dec, 12:00 UTC (in 41 days)');
    expect(closingLabel('2026-11-07T12:00:00Z', NOW, UTC)).toContain('(in 1 day)');
  });

  it('counts hours and minutes close to the end', () => {
    expect(closingLabel('2026-11-06T17:30:00Z', NOW, UTC)).toContain('(in 5 hours)');
    expect(closingLabel('2026-11-06T13:00:00Z', NOW, UTC)).toContain('(in 1 hour)');
    expect(closingLabel('2026-11-06T12:12:30Z', NOW, UTC)).toContain('(in 12 minutes)');
    expect(closingLabel('2026-11-06T12:01:00Z', NOW, UTC)).toContain('(in 1 minute)');
    expect(closingLabel('2026-11-06T12:00:30Z', NOW, UTC)).toContain('(in less than a minute)');
  });

  it('says closed after the closing time, and at exactly the closing time', () => {
    expect(closingLabel('2026-11-06T11:00:00Z', NOW, UTC)).toBe('Staking closed Fri 6 Nov, 11:00 UTC');
    expect(closingLabel('2026-11-06T12:00:00Z', NOW, UTC)).toBe('Staking closed Fri 6 Nov, 12:00 UTC');
  });

  it('copes with a closing time it cannot read', () => {
    expect(closingLabel('nonsense', NOW, UTC)).toBe('The closing time is not known.');
    expect(closingLabel(null, NOW, UTC)).toBe('The closing time is not known.');
  });
});

describe('the stake input', () => {
  const check = (amountText, extra = {}) =>
    checkStakeInput({ side: 'yes', amountText, rules: RULES, leftToday: 130, ...extra });

  it('accepts 20', () => {
    expect(check('20')).toEqual({ ok: true, side: 'yes', amount: 20 });
    expect(check(' 20 ')).toEqual({ ok: true, side: 'yes', amount: 20 });
    expect(check(20)).toEqual({ ok: true, side: 'yes', amount: 20 });
  });

  it('accepts the smallest and the biggest stake', () => {
    expect(check('1')).toMatchObject({ ok: true, amount: 1 });
    expect(check('50')).toMatchObject({ ok: true, amount: 50 });
  });

  it('refuses an empty box', () => {
    expect(check('')).toEqual({ ok: false, field: 'amount', message: 'Type how many coins you want to stake.' });
    expect(check('   ')).toMatchObject({ ok: false, field: 'amount' });
  });

  it('refuses 0 and -3 as too small', () => {
    expect(check('0')).toEqual({ ok: false, field: 'amount', message: 'A stake must be at least 🪙 1.' });
    expect(check('-3')).toEqual({ ok: false, field: 'amount', message: 'A stake must be at least 🪙 1.' });
  });

  it('refuses 2.5, "abc" and "1e1" as not whole numbers', () => {
    for (const text of ['2.5', 'abc', '1e1', '0x10', '2,5']) {
      expect(check(text)).toEqual({ ok: false, field: 'amount', message: 'Use a whole number of coins, like 20.' });
    }
  });

  it('refuses 51 as too big', () => {
    expect(check('51')).toEqual({
      ok: false,
      field: 'amount',
      message: 'You can stake at most 🪙 50 on one question.',
    });
  });

  it('refuses more than is left today', () => {
    expect(check('40', { leftToday: 30 })).toEqual({
      ok: false,
      field: 'amount',
      message: 'You can still stake 🪙 30 today.',
    });
  });

  it('draws the line at exactly what is left today', () => {
    expect(check('31', { leftToday: 30 }).ok).toBe(false);
    expect(check('30', { leftToday: 30 })).toMatchObject({ ok: true, amount: 30 });
  });

  it('says come back tomorrow when nothing is left today', () => {
    expect(check('5', { leftToday: 0 }).message).toBe("You have reached today's limit of 🪙 200. Try again tomorrow.");
  });

  it('skips the left-today check when the number is not known', () => {
    expect(check('40', { leftToday: undefined })).toMatchObject({ ok: true, amount: 40 });
  });

  it('asks for a side first', () => {
    expect(check('20', { side: null })).toEqual({ ok: false, field: 'side', message: 'Pick YES or NO first.' });
    expect(check('20', { side: 'maybe' })).toMatchObject({ ok: false, field: 'side' });
  });

  it('uses the limits the server sent', () => {
    const rules = { ...RULES, minStake: 5, maxStake: 10 };
    expect(check('4', { rules }).message).toBe('A stake must be at least 🪙 5.');
    expect(check('11', { rules }).message).toBe('You can stake at most 🪙 10 on one question.');
  });
});

describe('the stake form text', () => {
  it('writes the confirm question', () => {
    expect(stakeConfirmText({ side: 'yes', amount: 20 })).toBe('Stake 🪙 20 on YES? You cannot change or take back a stake.');
    expect(stakeConfirmText({ side: 'no', amount: 1 })).toBe('Stake 🪙 1 on NO? You cannot change or take back a stake.');
  });

  it('writes the hint with the coins left today', () => {
    expect(hintLine(130, 200)).toBe('You can still stake 🪙 130 today.');
    expect(hintLine(1, 200)).toBe('You can still stake 🪙 1 today.');
    expect(hintLine(0, 200)).toBe("You have reached today's limit of 🪙 200. Try again tomorrow.");
  });

  it('writes the line that says a stake is in', () => {
    expect(stakePlacedLine({ side: 'yes', amount: 20 })).toBe('Your stake is in: 🪙 20 on YES.');
    expect(stakePlacedLine({ side: 'no', amount: 1 })).toBe('Your stake is in: 🪙 1 on NO.');
  });

  it('writes the stake line that replaces the form', () => {
    expect(stakeSummary({ side: 'yes', amount: 20 })).toBe('Your stake: 🪙 20 on YES');
  });

  it('writes the total staked today', () => {
    expect(todayLine(mineAnswer())).toBe('Today you staked 🪙 70 of 🪙 200.');
  });
});

describe('the result lines of My stakes', () => {
  const closesAt = '2026-12-17T12:00:00Z';

  it('writes a win with the gain', () => {
    const stake = stakeRow({ status: 'settled', result: 'won', payout: 34, settlement: 'winners', outcome: 'yes', amount: 20 });
    expect(stakeResultLine(stake)).toBe('Won: 🪙 34 back (14 more than your stake)');
  });

  it('writes a win with no gain', () => {
    const stake = stakeRow({ status: 'settled', result: 'won', payout: 1, amount: 1, settlement: 'winners', outcome: 'yes' });
    expect(stakeResultLine(stake)).toBe('Won: 🪙 1 back (the same as your stake)');
  });

  it('writes a loss with the side that won', () => {
    const stake = stakeRow({ status: 'settled', result: 'lost', payout: 0, settlement: 'winners', outcome: 'no' });
    expect(stakeResultLine(stake)).toBe('Lost: NO won');
  });

  it('writes each refund reason in plain words', () => {
    const refunded = settlement => stakeRow({ status: 'settled', result: 'refunded', payout: 20, settlement });
    expect(stakeResultLine(refunded('refund_void'))).toBe(
      'Refunded: 🪙 20 back, because the question was cancelled or unclear on Manifold',
    );
    expect(stakeResultLine(refunded('refund_no_winners'))).toBe(
      'Refunded: 🪙 20 back, because nobody picked the winning answer',
    );
    expect(stakeResultLine(refunded('refund_one_sided'))).toBe(
      'Refunded: 🪙 20 back, because everybody picked the same answer',
    );
  });

  it('writes an open stake with its closing time', () => {
    expect(stakeResultLine(stakeRow(), { closesAt, ...UTC })).toBe('Open: closes Thu 17 Dec, 12:00 UTC');
    expect(stakeResultLine(stakeRow())).toBe('Open');
  });

  it('writes a closed stake that waits for the result', () => {
    expect(stakeResultLine(stakeRow({ status: 'closed' }))).toBe('Closed: waiting for the result');
  });
});

describe('settled questions', () => {
  it('says which side won', () => {
    expect(settledLine({ outcome: 'yes', settlement: 'winners' })).toBe('Settled: YES won.');
    expect(settledLine({ outcome: 'no', settlement: 'winners' })).toBe('Settled: NO won.');
  });

  it('says a void question was refunded', () => {
    expect(settledLine({ outcome: 'void', settlement: 'refund_void' })).toBe(
      'Settled: the question was cancelled or unclear on Manifold, so everybody got their coins back.',
    );
  });

  it('says when nobody had picked the winner or everybody picked the same side', () => {
    expect(settledLine({ outcome: 'yes', settlement: 'refund_no_winners' })).toBe(
      'Settled: YES won, but nobody had picked YES, so everybody got their coins back.',
    );
    expect(settledLine({ outcome: 'no', settlement: 'refund_one_sided' })).toBe(
      'Settled: NO won, but everybody had picked the same answer, so everybody got their coins back.',
    );
  });
});

describe('why staking is off', () => {
  const signedIn = { signedIn: true };

  it('is null while the player can stake', () => {
    expect(whyNotStaking(question(), signedIn)).toBeNull();
  });

  it('says staking has closed', () => {
    expect(whyNotStaking(question({ status: 'closed', canStake: false }), signedIn)).toBe('Staking has closed.');
    const decided = question({ canStake: false, manifold: { state: 'decided', decidedAs: 'yes', decidedAt: null } });
    expect(whyNotStaking(decided, signedIn)).toBe('Staking has closed.');
  });

  it('says staking is paused when Manifold cannot be checked', () => {
    const paused = question({ canStake: false, manifold: { state: 'unknown', decidedAs: null, decidedAt: null } });
    expect(whyNotStaking(paused, signedIn)).toBe('Manifold cannot be checked right now, so staking is paused.');
  });

  it('says staking is paused when the only reading of Manifold is a stale one that is too old', () => {
    const old = question({ canStake: false, source: 'stale', fetchedAt: '2026-11-20T09:00:00Z' });
    expect(whyNotStaking(old, signedIn)).toBe('Manifold cannot be checked right now, so staking is paused.');
  });

  it('does not block a stale reading that the server still lets the player stake on', () => {
    expect(whyNotStaking(question({ source: 'stale' }), signedIn)).toBeNull();
  });

  it('says who won once the question is settled', () => {
    const settled = question({ status: 'settled', canStake: false, outcome: 'yes', settlement: 'winners' });
    expect(whyNotStaking(settled, signedIn)).toBe('Settled: YES won.');
  });

  it('asks a signed-out player to sign in', () => {
    expect(whyNotStaking(question(), { signedIn: false })).toBe(SIGN_IN_LINE);
  });

  it('still says closed to a signed-out player on a closed question', () => {
    expect(whyNotStaking(question({ status: 'closed', canStake: false }), { signedIn: false })).toBe('Staking has closed.');
  });

  it('pauses staking when the account could not be read', () => {
    expect(whyNotStaking(question(), { signedIn: null })).toBe('Your stakes could not be loaded, so staking is paused. Try again in a moment.');
  });
});

describe('a whole question card', () => {
  const context = { rules: RULES, mine: mineAnswer(), signedIn: true, now: NOW, ...UTC };

  it('holds the question, who decides, the closing time, the pool and the rule', () => {
    const card = cardModel(question(), context);
    expect(card.title).toBe(question().text);
    expect(card.topic).toBe('Culture');
    expect(card.decidedBy).toBe(`Decided by: ${question().decidedBy}`);
    expect(card.closing).toBe('Staking closes Thu 17 Dec, 12:00 UTC (in 41 days)');
    expect(card.poolLines).toHaveLength(2);
    expect(card.rule).toBe(
      'The winners share the pool. 5 % of the coins on the losing side leave the game. Numbers change until staking closes.',
    );
  });

  it('leaves the closing line out once staking closed early or the question is settled', () => {
    const early = question({ status: 'closed', canStake: false, manifold: { state: 'decided', decidedAs: 'yes', decidedAt: null } });
    expect(cardModel(early, context).closing).toBeNull();
    const settled = question({ status: 'settled', canStake: false, outcome: 'void', settlement: 'refund_void' });
    expect(cardModel(settled, context).closing).toBeNull();
  });

  it('says when staking closed if that time has passed', () => {
    const closed = question({ status: 'closed', canStake: false, closesAt: '2026-11-06T11:00:00Z' });
    expect(cardModel(closed, context).closing).toBe('Staking closed Fri 6 Nov, 11:00 UTC');
  });

  it('drops "Numbers change until staking closes" once staking has closed', () => {
    const closed = question({ status: 'closed', canStake: false });
    expect(cardModel(closed, context).rule).toBe(
      'The winners share the pool. 5 % of the coins on the losing side leave the game.',
    );
  });

  it('offers the form with the limits and the hint when the player can stake', () => {
    const card = cardModel(question(), context);
    expect(card.blocked).toBeNull();
    expect(card.yourStake).toBeNull();
    expect(card.form).toEqual({
      legend: 'Your forecast',
      amountLabel: 'Coins (1 to 50)',
      min: 1,
      max: 50,
      hint: 'You can still stake 🪙 130 today.',
    });
  });

  it('replaces the form with the stake line once the player has staked', () => {
    const mine = mineAnswer({ stakes: [stakeRow()] });
    const card = cardModel(question(), { ...context, mine });
    expect(card.yourStake).toBe('Your stake: 🪙 20 on YES');
    expect(card.own).toEqual({ side: 'yes', amount: 20 });
    expect(card.form).toBeNull();
  });

  it('shows the stake line from a stake the server just confirmed, before "mine" lists it', () => {
    const card = cardModel(question(), { ...context, placed: { side: 'no', amount: 15 } });
    expect(card.yourStake).toBe('Your stake: 🪙 15 on NO');
    expect(card.form).toBeNull();
  });

  it('prefers the stake listed in "mine" over the one just confirmed', () => {
    const mine = mineAnswer({ stakes: [stakeRow({ side: 'yes', amount: 20 })] });
    const card = cardModel(question(), { ...context, mine, placed: { side: 'no', amount: 15 } });
    expect(card.yourStake).toBe('Your stake: 🪙 20 on YES');
  });

  it('shows the reason instead of the form when staking is off', () => {
    const card = cardModel(question({ status: 'closed', canStake: false }), context);
    expect(card.blocked).toBe('Staking has closed.');
    expect(card.form).toBeNull();
  });

  it('shows the paused line instead of the form for a stale reading that is too old', () => {
    const card = cardModel(question({ canStake: false, source: 'stale' }), context);
    expect(card.blocked).toBe('Manifold cannot be checked right now, so staking is paused.');
    expect(card.form).toBeNull();
    expect(card.closing).not.toBeNull();
  });

  it('shows the sign-in line instead of the form for a signed-out player', () => {
    const card = cardModel(question(), { ...context, mine: null, signedIn: false });
    expect(card.blocked).toBe(SIGN_IN_LINE);
    expect(card.form).toBeNull();
  });

  it('never shows a probability or a link', () => {
    const card = cardModel(question({ probability: 0.77 }), context);
    expect(JSON.stringify(card)).not.toMatch(/probab|https?:|www\./i);
  });

  it('uses the cut from the rules the server sent', () => {
    const card = cardModel(question(), { ...context, rules: { ...RULES, cutPercent: 8 } });
    expect(card.rule).toContain('8 % of the coins on the losing side');
  });
});

describe('plain sentences for the codes', () => {
  const CODES = [
    'unauthorized', 'forbidden', 'feature_off', 'no_such_question', 'already_applied', 'pool_closed',
    'already_staked', 'daily_stake_cap', 'insufficient_funds', 'pool_open', 'outcome_conflict',
    'stakes_changed', 'validation_error', 'stake_too_small', 'stake_too_big', 'too_many_requests',
    'predictions_unavailable', 'source_unavailable', 'database_unavailable', 'database_not_configured',
    'network_error', 'timeout', 'database_error', 'server_error', 'not_found',
  ];

  for (const code of CODES) {
    it(`has a sentence for ${code}`, () => {
      const sentence = sentenceFor(code);
      expect(sentence.length).toBeGreaterThan(10);
      expect(sentence).not.toBe(GENERIC_LINE);
      expect(sentence).not.toMatch(/[\u2013\u2014]/);
    });
  }

  it('has a generic sentence for a code it does not know', () => {
    expect(sentenceFor('brand_new_code')).toBe(GENERIC_LINE);
    expect(sentenceFor(undefined)).toBe(GENERIC_LINE);
  });

  it('prefers the message of the server for a refusal', () => {
    const reply = { kind: 'refused', code: 'pool_closed', message: 'Staking on this question has closed on Manifold.' };
    expect(refusalText(reply)).toBe('Staking on this question has closed on Manifold.');
  });

  it('falls back to the sentence for the code when the message is empty', () => {
    expect(refusalText({ kind: 'refused', code: 'pool_closed', message: '   ' })).toBe(sentenceFor('pool_closed'));
    expect(refusalText({ kind: 'refused', code: 'pool_closed' })).toBe(sentenceFor('pool_closed'));
  });

  it('uses its own words for sign-in, a closed desk and a wait', () => {
    expect(refusalText({ kind: 'signin', message: 'anything' })).toBe(SIGN_IN_LINE);
    expect(refusalText({ kind: 'closed', message: 'anything' })).toBe(CLOSED_LINE);
    expect(refusalText({ kind: 'wait', seconds: 3 })).toBe('Too many tries. Wait 3 seconds, then try again.');
    expect(refusalText({ kind: 'wait', seconds: 1 })).toBe('Too many tries. Wait 1 second, then try again.');
  });

  it('has one sentence for network trouble and one for a timeout', () => {
    expect(refusalText({ kind: 'unknown', code: 'network_error' })).toContain('No connection');
    expect(refusalText({ kind: 'unknown', code: 'timeout' })).toContain('too long');
  });
});
