// What the match board shows, from GET /api/sports and /api/sports/mine. Pure: no DOM, no fetch.
// A right pick pays twice the stake (D050); the server settles and pays every stake.
import {MATCH_RULES, PAYOUT_MULTIPLIER, stakeRange, winFor} from './stakes.js';
import {MATCH, MY_STAKES, STAKE, kickoffText, refundedText, resultText} from './words.js';

// More games to pick from (owner, 11 Nov): up to 30 matches of the coming week, at most 5 per
// competition, so one busy league cannot fill the board.
export const MAX_MATCHES = 30;
export const PER_COMPETITION = 5;
function spread(fixtures) {
  const seen = new Map();
  return fixtures.filter(fixture => {
    const key = fixture.competition ?? '', count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return count < PER_COMPETITION;
  });
}
const list = value => (Array.isArray(value) ? value : []);
export const pickLabel = (pick, match) => (pick === 'home' ? match.home : pick === 'away' ? match.away : MATCH.draw);
export const matchName = match => `${match.home} v ${match.away}`;

export function canPick(fixture, now) {
  return fixture.canStake === true && fixture.source === 'live' && fixture.status === 'scheduled'
    && fixture.pool?.status === 'open' && now < Date.parse(fixture.closesAt);
}

// "Win: 🪙 500 (double your stake)": the payout of a right pick (stake back plus the same again).
export const matchWin = (stake, multiplier = PAYOUT_MULTIPLIER) => MATCH.win(winFor(stake, multiplier));

// The amounts the player may stake now: the board's limits, their coins and what is left today.
export function matchRange(board, mine) {
  const rules = {...MATCH_RULES, ...(board?.rules ?? {})};
  return stakeRange({rules, coins: mine?.coins, leftToday: mine?.coinsLeftToday});
}

// The stake's state in words, and the gain when it settled: a right pick shows what came back
// ("You won 🪙 500" on a 🪙 250 stake), a wrong one the stake it lost, a called-off match the refund.
export function matchStakeState(stake) {
  if (stake.status !== 'settled') return {text: MY_STAKES.waiting, tone: 'info', gain: null};
  if (String(stake.settlement ?? '').startsWith('refund_')) return {text: refundedText(stake.amount), tone: 'info', gain: 0};
  const payout = stake.payout ?? 0, gain = payout - stake.amount;
  return {text: gain > 0 ? MY_STAKES.won(payout) : resultText(gain), tone: gain > 0 ? 'good' : gain < 0 ? 'bad' : 'info', gain};
}

export function matchView({board, boardFailure = null, mine = null, signedIn = false, now = Date.now(), timeZone} = {}) {
  if (!board) {
    if (!boardFailure) return {state: 'loading', matches: [], mine: []};
    const closed = boardFailure.status === 404 || boardFailure.code === 'feature_off';
    return {state: closed ? 'closed' : 'unavailable', line: closed ? MATCH.closed : MATCH.unavailable, matches: [], mine: []};
  }
  const range = matchRange(board, mine), multiplier = board.rules?.payoutMultiplier ?? PAYOUT_MULTIPLIER;
  const own = list(mine?.stakes);
  const dayUsed = Number.isSafeInteger(mine?.coinsLeftToday) && mine.coinsLeftToday < range.min;
  const matches = spread(list(board.fixtures).filter(fixture => fixture.status === 'scheduled' && fixture.source === 'live')
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))).slice(0, MAX_MATCHES)
    .map(fixture => {
      const taken = own.find(stake => stake.fixtureId === fixture.id);
      const open = canPick(fixture, now), ready = open && signedIn && !taken && Boolean(mine);
      return {id: fixture.id, name: matchName(fixture), when: [fixture.competition, kickoffText(fixture.kickoff, timeZone)].filter(Boolean).join(' · '),
        picks: list(fixture.picks).map(pick => ({id: pick, label: pickLabel(pick, fixture)})),
        taken: taken ? MATCH.yourPick(pickLabel(taken.pick, taken), taken.amount) : null,
        reason: !open ? MATCH.picksClosed : ready && !range.ok ? (dayUsed ? MATCH.dayUsed : STAKE.notEnough(range.min)) : null,
        canStake: ready && range.ok, range, coins: mine?.coins ?? 0, win: stake => matchWin(stake, multiplier)};
    });
  const rows = own.map(stake => {
    const state = matchStakeState(stake);
    return {id: stake.id, tone: state.tone, settled: stake.status === 'settled',
      text: MY_STAKES.row(stake.amount, pickLabel(stake.pick, stake), matchName(stake), state.text)};
  });
  return {state: matches.length ? 'open' : 'empty', line: matches.length ? null : MATCH.empty, matches, mine: rows,
    signedIn};
}
