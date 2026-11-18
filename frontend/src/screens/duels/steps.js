// The reveal as a list of steps, and the plain words that describe a finished duel. Pure data,
// no DOM: reveal.js draws the steps, history.js prints the lines, tests read both.
// A duel here is the server's detail JSON (docs/INTERFACES.md, GET /api/duels/{id}), so every
// point is already decided; the screen only turns it into sentences.
// Used by: reveal.js, history.js and the tests.
import { SIGNAL_NAMES, otherCaptainName } from './logic.js';
import { formatCoinDelta } from '../../lib/coins.js';

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
  if (duel.coinsChange !== 0) return `${formatCoinDelta(duel.coinsChange)} (play money).`;
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
