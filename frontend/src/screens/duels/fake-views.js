// What one captain may see of one duel in the practice ring: the summary of a list and the
// detail with the reveal, in the exact JSON shape of the server (docs/INTERFACES.md, Lantern
// Duels). It is the one place that decides visibility: the other captain's sealed signals are
// read only for a finished duel. A duel here is the ring's own record (see fake-ring.js).
// Used by: fake-ring.js.
import { DEFAULT_RULES, MAX_WAITING, coinsChange, oilFor, winnerTakes } from './logic.js';

// 'challenger', 'opponent', or 'visitor' (someone looking at an open challenge).
export function roleOf(duel, me) {
  if (duel.challenger === me) return 'challenger';
  return duel.opponent === me ? 'opponent' : 'visitor';
}

// UTC with whole seconds, like the server: "2026-11-06T10:00:00Z".
export const isoOf = milliseconds => new Date(Math.floor(milliseconds / 1000) * 1000).toISOString().replace('.000Z', 'Z');

const other = role => (role === 'challenger' ? 'opponent' : 'challenger');

function scoreOf(duel, role) {
  const count = who => duel.roundResults.filter(result => result === who).length;
  return { you: count(role), them: count(other(role)) };
}

function resultOf(duel, role) {
  if (duel.outcome === 'draw') return 'draw';
  return duel.outcome === role ? 'won' : 'lost';
}

export function summaryOf(duel, me) {
  const role = roleOf(duel, me);
  const isWaiting = duel.status === 'open';
  const isFinished = duel.status === 'finished';
  return {
    id: duel.id, status: duel.status, isOpen: duel.isOpen, you: role,
    challengerName: duel.challenger, opponentName: duel.opponent,
    rounds: duel.rounds, oil: oilFor(duel.rounds), stake: duel.stake, cutPercent: duel.cutPercent,
    winnerTakes: winnerTakes(duel.stake, duel.cutPercent),
    createdAt: isoOf(duel.createdAt), expiresAt: isoOf(duel.expiresAt), closedAt: duel.closedAt ? isoOf(duel.closedAt) : null,
    score: isFinished ? scoreOf(duel, role) : null,
    yourResult: isFinished ? resultOf(duel, role) : null,
    coinsChange: isWaiting ? null : (isFinished ? coinsChange(duel.stake, duel.cutPercent, duel.outcome, role) : 0),
    heldStake: isWaiting && role === 'challenger' ? duel.stake : 0,
    canAnswer: isWaiting && (duel.isOpen ? role !== 'challenger' : role === 'opponent'),
    canWithdraw: isWaiting && role === 'challenger',
    canDecline: isWaiting && !duel.isOpen && role === 'opponent',
  };
}

// One entry per round from this captain's side. Only called for a finished duel.
function revealOf(duel, role) {
  const mine = duel.moves[role === 'challenger' ? duel.challenger : duel.opponent].signals;
  const theirs = duel.moves[role === 'challenger' ? duel.opponent : duel.challenger].signals;
  const pointOf = result => (result === 'even' ? 'even' : (result === role ? 'you' : 'them'));
  return duel.roundResults.map((result, index) => ({ round: index + 1, yours: mine[index], theirs: theirs[index], point: pointOf(result) }));
}

export function detailOf(duel, me) {
  const role = roleOf(duel, me);
  const canReveal = duel.status === 'finished' && role !== 'visitor';
  return {
    ...summaryOf(duel, me),
    yourSignals: duel.moves[me]?.signals ?? null,
    reveal: canReveal ? revealOf(duel, role) : null,
  };
}

export const takesPart = (duel, me) => duel.challenger === me || duel.opponent === me;

// The answer of GET /api/duels from this captain's point of view, with the server's limits:
// named challenges to you, other captains' open challenges, your waiting ones, your latest results.
export function listFor(duels, me, coins, nowMs) {
  const newestFirst = (a, b) => b.createdAt - a.createdAt;
  const mine = duels.filter(duel => takesPart(duel, me)).sort(newestFirst);
  const waiting = mine.filter(duel => duel.status === 'open');
  const yours = waiting.filter(duel => duel.challenger === me);
  const open = duels.filter(duel => duel.status === 'open' && duel.isOpen && duel.challenger !== me).sort(newestFirst);
  const summaries = items => items.map(duel => summaryOf(duel, me));
  return {
    rules: DEFAULT_RULES, coins, heldCoins: yours.reduce((total, duel) => total + duel.stake, 0),
    incoming: summaries(waiting.filter(duel => duel.opponent === me).slice(0, 10)),
    openChallenges: summaries(open.slice(0, 10)),
    yours: summaries(yours.slice(0, MAX_WAITING)),
    recent: summaries(mine.filter(duel => duel.status !== 'open').slice(0, 10)),
    serverTime: isoOf(nowMs),
  };
}
