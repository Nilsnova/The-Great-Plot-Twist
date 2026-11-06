// The rules of Lantern Duels as plain functions: signals, oil, the sealed picker, who takes a
// round, payouts, captain names and the time left on a challenge. No DOM and no network.
// The server decides every real duel (D003). This copy lets the picker stop choices the server
// would refuse and lets the local practice ring play by the same rules. The numbers must equal
// backend/server/duels/rules.py; tests/duels-logic.test.js checks them.
// Used by: picker.js, steps.js, fake-ring.js, http-adapter.js, view-store.js and the tests.

export const SIGNALS = ['flash', 'shade', 'mirror'];
export const SIGNAL_NAMES = { flash: 'Flash', shade: 'Shade', mirror: 'Mirror' };
export const BEATS = { flash: 'shade', shade: 'mirror', mirror: 'flash' }; // the key beats the value
export const OIL_COST = { flash: 2, mirror: 1, shade: 0 };
export const ROUND_CHOICES = [3, 5];
export const STAKE_CHOICES = [0, 10, 25, 50, 100]; // 0 is a friendly duel
export const CUT_PERCENT = 5;
export const ANSWER_HOURS = 24;
export const MAX_WAITING = 3;
export const PAIR_DAILY_LIMIT = 3;
const OIL_PER_ROUND = 1;
const MIN_SIGNALS = 3;
const MAX_SIGNALS = 5;

// The rules block of GET /api/duels, used until the server has answered once.
export const DEFAULT_RULES = {
  signals: SIGNALS.map(id => ({ id, cost: OIL_COST[id], beats: BEATS[id] })),
  roundChoices: ROUND_CHOICES, oilPerRound: OIL_PER_ROUND, stakeChoices: STAKE_CHOICES,
  cutPercent: CUT_PERCENT, answerHours: ANSWER_HOURS, maxWaiting: MAX_WAITING,
  pairDailyLimit: PAIR_DAILY_LIMIT, dayStarts: '00:00 Europe/Lisbon',
};

export const oilFor = rounds => rounds * OIL_PER_ROUND;
export const sequenceCost = signals => signals.reduce((total, signal) => total + OIL_COST[signal], 0);

// Every sequence a duel of this many rounds allows. Used by the practice rival and the tests.
export function allValidSequences(rounds) {
  let sequences = [[]];
  for (let round = 0; round < rounds; round++) {
    sequences = sequences.flatMap(sequence => SIGNALS.map(signal => [...sequence, signal]));
  }
  return sequences.filter(sequence => sequenceCost(sequence) <= oilFor(rounds));
}

// 'challenger', 'opponent' or 'even', as the server stores it.
export function roundPoint(challengerSignal, opponentSignal) {
  if (challengerSignal === opponentSignal) return 'even';
  return BEATS[challengerSignal] === opponentSignal ? 'challenger' : 'opponent';
}

export function resolve(challengerSignals, opponentSignals) {
  const roundResults = challengerSignals.map((signal, index) => roundPoint(signal, opponentSignals[index]));
  const challengerPoints = roundResults.filter(result => result === 'challenger').length;
  const opponentPoints = roundResults.filter(result => result === 'opponent').length;
  let outcome = 'draw';
  if (challengerPoints > opponentPoints) outcome = 'challenger';
  if (opponentPoints > challengerPoints) outcome = 'opponent';
  return { roundResults, challengerPoints, opponentPoints, outcome };
}

// The pot minus the cut, in whole coins, rounded down. A friendly duel has no pot.
export function winnerTakes(stake, cutPercent = CUT_PERCENT) {
  return Math.floor((2 * stake * (100 - cutPercent)) / 100);
}

// One captain's net coins once the duel is decided. role is 'challenger' or 'opponent'.
export function coinsChange(stake, cutPercent, outcome, role) {
  if (stake === 0 || outcome === 'draw') return 0;
  return outcome === role ? winnerTakes(stake, cutPercent) - stake : -stake;
}

// The same refusals the server gives, so the practice ring and the screen agree with it.
export function checkChoices(rounds, stake) {
  if (!ROUND_CHOICES.includes(rounds)) return 'bad_rounds';
  if (!STAKE_CHOICES.includes(stake)) return 'bad_stake';
  return null;
}

export function checkSequence(signals, rounds) {
  const isList = Array.isArray(signals) && signals.length >= MIN_SIGNALS && signals.length <= MAX_SIGNALS;
  if (!isList || !signals.every(signal => SIGNALS.includes(signal))) return 'validation_error';
  if (signals.length !== rounds) return 'wrong_signal_count';
  return sequenceCost(signals) > oilFor(rounds) ? 'not_enough_oil' : null;
}

// The picker keeps one entry per round: a signal, or null while the round is empty.
export const emptyPicks = rounds => Array(rounds).fill(null);
const costOf = signal => (signal ? OIL_COST[signal] : 0);
const spent = picks => picks.reduce((total, signal) => total + costOf(signal), 0);
export const oilLeft = (rounds, picks) => oilFor(rounds) - spent(picks);

// The oil one round could use: all of it, minus what the other rounds burn.
const oilForRound = (rounds, picks, index) => oilFor(rounds) - spent(picks) + costOf(picks[index]);
export const canPick = (rounds, picks, index, signal) => OIL_COST[signal] <= oilForRound(rounds, picks, index);
export const needsText = (rounds, picks, index, signal) =>
  `needs ${OIL_COST[signal]} oil, ${oilForRound(rounds, picks, index)} left`;

// Returns a new list; a choice the oil cannot pay for changes nothing.
export function pick(rounds, picks, index, signal) {
  if (!canPick(rounds, picks, index, signal)) return picks;
  return picks.map((current, position) => (position === index ? signal : current));
}

export const isSealable = (rounds, picks) =>
  picks.length === rounds && picks.every(Boolean) && spent(picks) <= oilFor(rounds);

// The display-name rule of the server: 2 to 24 letters, digits, spaces, dots, dashes or underscores.
const CAPTAIN_NAME = /^[A-Za-z0-9 _.-]{2,24}$/;
export const isCaptainName = text => typeof text === 'string' && CAPTAIN_NAME.test(text.trim());

// The name of the other captain in a summary, or null for a captain who has left.
export function otherCaptainName(summary) {
  const name = summary.you === 'challenger' ? summary.opponentName : summary.challengerName;
  return name ?? null;
}

// "23 h" while an hour or more is left, then "25 min". nowMs is the server's idea of now.
export function timeLeftText(expiresAt, nowMs) {
  const milliseconds = Date.parse(expiresAt) - nowMs;
  if (!(milliseconds > 0)) return 'time is up';
  const minutes = Math.ceil(milliseconds / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h` : `${minutes} min`;
}

// One uid per click, sent again unchanged on a retry. crypto.randomUUID exists only on secure
// pages (https or localhost), so a page opened by its network address gets a simpler uid.
export function newActionUid() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `uid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
