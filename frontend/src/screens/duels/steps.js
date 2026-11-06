// The reveal as a list of steps, and the plain words that describe a finished duel. Pure data,
// no DOM: reveal.js draws the steps, history.js prints the lines, tests read both.
// A duel here is the server's detail JSON (docs/INTERFACES.md, GET /api/duels/{id}), so every
// point is already decided; the screen only turns it into sentences.
// Used by: reveal.js, history.js and the tests.
import { ANSWER_HOURS, SIGNAL_NAMES, otherCaptainName } from './logic.js';

const BEAT_LINES = {
  flash: 'Flash outshines Shade',
  shade: 'Shade leaves Mirror nothing to throw back',
  mirror: 'Mirror throws Flash back',
};
const POINT_WORDS = { you: 'Your point', them: 'Their point', even: 'Nobody scores' };
const signalName = signal => SIGNAL_NAMES[signal] ?? 'a signal';

// One round: the line under the lanterns and the sentence a screen reader speaks.
function roundStep(entry, total, score, themName) {
  const isEven = entry.point === 'even';
  const winningSignal = entry.point === 'you' ? entry.yours : entry.theirs;
  const why = isEven ? `Both showed ${signalName(entry.yours)}` : (BEAT_LINES[winningSignal] ?? 'One signal won');
  const spokenWhy = isEven ? 'Same signal' : why;
  const point = POINT_WORDS[entry.point];
  const showed = `You showed ${signalName(entry.yours)}, ${themName} showed ${signalName(entry.theirs)}`;
  return {
    kind: 'round', round: entry.round, total, yours: entry.yours, theirs: entry.theirs, point: entry.point, score,
    line: `${why}. ${point}.`,
    speech: `Round ${entry.round} of ${total}. ${showed}. ${spokenWhy}: ${point.toLowerCase()}. ${score.you} to ${score.them}.`,
  };
}

function coinsPhrase(duel) {
  if (duel.stake === 0) return 'Friendly duel, no coins.';
  if (duel.coinsChange > 0) return `+${duel.coinsChange} coins (play money).`;
  if (duel.coinsChange < 0) return `${duel.coinsChange} coins (play money).`;
  return 'Stake returned.';
}

// "You win 3 to 1. +90 coins (play money)."
export function resultText(duel) {
  const verdict = { won: 'You win', lost: 'You lose', draw: 'Draw' }[duel.yourResult];
  return `${verdict} ${duel.score.you} to ${duel.score.them}. ${coinsPhrase(duel)}`;
}

function resultStep(duel) {
  const banner = resultText(duel);
  const rows = duel.reveal.map(entry => ({
    round: entry.round, yours: signalName(entry.yours), theirs: signalName(entry.theirs), point: POINT_WORDS[entry.point],
  }));
  return { kind: 'result', banner, speech: banner, rows };
}

// One step per round with the running score, then the result. With reduced motion, only the result.
export function revealSteps(duel, { reducedMotion = false } = {}) {
  const themName = otherCaptainName(duel) ?? 'The other captain';
  const score = { you: 0, them: 0 };
  const rounds = duel.reveal.map(entry => {
    if (entry.point === 'you') score.you += 1;
    if (entry.point === 'them') score.them += 1;
    return roundStep(entry, duel.rounds, { ...score }, themName);
  });
  const result = resultStep(duel);
  return reducedMotion ? [result] : [...rounds, result];
}

// "5 rounds, stake 100, winner takes 190" or "3 rounds, friendly duel".
export function termsText(duel) {
  const stakeText = duel.stake > 0 ? `stake ${duel.stake}, winner takes ${duel.winnerTakes}` : 'friendly duel';
  return `${duel.rounds} rounds, ${stakeText}`;
}

function finishedLine(duel) {
  const word = { won: 'Won', lost: 'Lost', draw: 'Draw' }[duel.yourResult];
  const score = `${duel.score.you} to ${duel.score.them}`;
  const against = duel.yourResult === 'draw' ? '' : ` against ${otherCaptainName(duel) ?? 'a captain who has left'}`;
  if (duel.stake === 0) return `${word} ${score}${against}, friendly duel`;
  if (duel.yourResult === 'draw') return `${word} ${score}, stake returned`;
  const sign = duel.coinsChange > 0 ? '+' : '';
  return `${word} ${score}${against}, ${sign}${duel.coinsChange} coins`;
}

// "Won 3 to 1 against Captain-3fa85f, +90 coins", "Withdrawn, stake returned" and so on.
export function historyLine(duel) {
  const returned = duel.stake > 0 ? ', stake returned' : '';
  const isOpponent = duel.you === 'opponent';
  if (duel.status === 'finished') return finishedLine(duel);
  if (duel.status === 'withdrawn') return `Withdrawn${returned}`;
  if (duel.status === 'declined') {
    return isOpponent ? `You declined the challenge from ${duel.challengerName}` : `Declined by ${duel.opponentName}${returned}`;
  }
  if (duel.status === 'expired') {
    return isOpponent ? `You did not answer ${duel.challengerName} within ${ANSWER_HOURS} h` : `No answer within ${ANSWER_HOURS} h${returned}`;
  }
  return 'Waiting for an answer';
}
