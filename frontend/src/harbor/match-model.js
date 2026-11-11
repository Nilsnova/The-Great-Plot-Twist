// What the match board shows, from GET /api/sports and /api/sports/mine. Pure: no DOM, no fetch.
// Payout estimates are display only ("about"); the server settles and pays every stake.
import {offeredStakes, poolGain} from './stakes.js';
import {MATCH, MY_STAKES, POOL, kickoffText, refundedText, resultText} from './words.js';

const MAX_MATCHES = 10;
const list = value => (Array.isArray(value) ? value : []);
export const pickLabel = (pick, match) => (pick === 'home' ? match.home : pick === 'away' ? match.away : MATCH.draw);
export const matchName = match => `${match.home} v ${match.away}`;

export function canPick(fixture, now) {
  return fixture.canStake === true && fixture.source === 'live' && fixture.status === 'scheduled'
    && fixture.pool?.status === 'open' && now < Date.parse(fixture.closesAt);
}

export function matchHint(fixture, pick, stake, cutPercent) {
  const total = fixture.pool?.total ?? 0, mine = fixture.pool?.sides?.[pick]?.coins ?? 0;
  const gain = poolGain({stake, mine, total, cutPercent});
  return gain > 0 ? POOL.win(gain) : POOL.lonely(stake);
}

// The stake's state in words, and the gain when it settled.
export function matchStakeState(stake) {
  if (stake.status !== 'settled') return {text: MY_STAKES.waiting, tone: 'info', gain: null};
  if (String(stake.settlement ?? '').startsWith('refund_')) return {text: refundedText(stake.amount), tone: 'info', gain: 0};
  const gain = (stake.payout ?? 0) - stake.amount;
  return {text: resultText(gain), tone: gain > 0 ? 'good' : gain < 0 ? 'bad' : 'info', gain};
}

export function matchView({board, boardFailure = null, mine = null, signedIn = false, now = Date.now(), timeZone} = {}) {
  if (!board) {
    if (!boardFailure) return {state: 'loading', matches: [], mine: []};
    const closed = boardFailure.status === 404 || boardFailure.code === 'feature_off';
    return {state: closed ? 'closed' : 'unavailable', line: closed ? MATCH.closed : MATCH.unavailable, matches: [], mine: []};
  }
  const stakes = offeredStakes(board.rules), cut = board.rules?.poolCutPercent ?? 0;
  const own = list(mine?.stakes);
  const matches = list(board.fixtures).filter(fixture => fixture.status === 'scheduled' && fixture.source === 'live')
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)).slice(0, MAX_MATCHES)
    .map(fixture => {
      const taken = own.find(stake => stake.fixtureId === fixture.id);
      const open = canPick(fixture, now);
      return {id: fixture.id, name: matchName(fixture), when: [fixture.competition, kickoffText(fixture.kickoff, timeZone)].filter(Boolean).join(' · '),
        picks: list(fixture.picks).map(pick => ({id: pick, label: pickLabel(pick, fixture)})),
        taken: taken ? MATCH.yourPick(pickLabel(taken.pick, taken), taken.amount) : null,
        reason: open ? null : MATCH.picksClosed, canStake: open && signedIn && !taken && stakes.length > 0, stakes,
        hint: (pick, stake) => matchHint(fixture, pick, stake, cut)};
    });
  const rows = own.map(stake => {
    const state = matchStakeState(stake);
    return {id: stake.id, tone: state.tone, settled: stake.status === 'settled',
      text: MY_STAKES.row(stake.amount, pickLabel(stake.pick, stake), matchName(stake), state.text)};
  });
  return {state: matches.length ? 'open' : 'empty', line: matches.length ? null : MATCH.empty, matches, mine: rows,
    signedIn};
}
