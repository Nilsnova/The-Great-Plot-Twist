// The practice ring: a stand-in for the Lantern Duels server, in memory. It follows the same
// rules and the same refusals (logic.js has the numbers), holds and pays every stake once, and
// answers in the shapes of the real routes: { ok: true, duel, coins } or { ok: false, code }.
// It has no timers and no DOM; fake-adapter.js adds the 6-second rival on top.
// Nothing is saved and no real wallet is touched. Used by: fake-adapter.js and the tests.
import { seededRandom } from '../../core/math.js';
import {
  ANSWER_HOURS, CUT_PERCENT, MAX_WAITING, PAIR_DAILY_LIMIT, checkChoices, checkSequence, isCaptainName, resolve, winnerTakes,
} from './logic.js';
import { detailOf, listFor, roleOf, takesPart } from './fake-views.js';
import { RIVALS, secretSequence, sealedBy, startingDuels } from './fake-start.js';

export const PRACTICE_NAME = 'Practice Captain';
export const START_COINS = 500;
export const FAKE_SEED = 7;
const HOUR = 3600 * 1000;
const DAY_IN_LISBON = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' });

const refuse = code => ({ ok: false, code });

export function createRing({ now = Date.now, random = seededRandom(FAKE_SEED), coins: startCoins = START_COINS } = {}) {
  const me = PRACTICE_NAME;
  let coins = startCoins, lastId = 0;
  const duels = [];

  function add(fields) {
    const duel = {
      id: `practice-duel-${++lastId}`, opponent: null, isOpen: false, cutPercent: CUT_PERCENT, status: 'open',
      outcome: null, roundResults: null, answeredAt: null, closedAt: null, ...fields,
    };
    duels.push(duel);
    return duel;
  }
  const find = id => duels.find(duel => duel.id === id);
  const canSee = duel => takesPart(duel, me) || (duel.isOpen && duel.status === 'open');
  const payout = (duel, role) => (duel.outcome === 'draw' ? duel.stake : (duel.outcome === role ? winnerTakes(duel.stake, duel.cutPercent) : 0));

  // withdrawn, declined or expired: the challenger's stake comes back, once, because only an open duel closes.
  function close(duel, status) {
    duel.status = status;
    duel.closedAt = now();
    if (duel.challenger === me) coins += duel.stake;
  }

  // The deadline is checked lazily, whenever somebody looks, like on the server.
  function sweep() {
    for (const duel of duels) if (duel.status === 'open' && duel.expiresAt <= now()) close(duel, 'expired');
  }

  // Stores the answer, decides the duel, and moves the coins of the practice captain.
  function settle(duel, answerer, signals, uid) {
    duel.moves[answerer] = { signals, uid };
    const result = resolve(duel.moves[duel.challenger].signals, signals);
    Object.assign(duel, {
      opponent: answerer, status: 'finished', outcome: result.outcome, roundResults: result.roundResults, answeredAt: now(), closedAt: now(),
    });
    if (answerer === me) coins += payout(duel, 'opponent') - duel.stake;
    else if (duel.challenger === me) coins += payout(duel, 'challenger');
  }

  const dayOf = milliseconds => DAY_IN_LISBON.format(milliseconds);
  function stakedDuelsToday(captain) {
    const between = duel => (duel.challenger === me && duel.opponent === captain) || (duel.challenger === captain && duel.opponent === me);
    return duels.filter(duel => duel.status === 'finished' && duel.stake > 0 && between(duel) && dayOf(duel.answeredAt) === dayOf(now())).length;
  }

  function list() {
    sweep();
    return listFor(duels, me, coins, now());
  }

  function detail(id) {
    sweep();
    const duel = find(id);
    return duel && canSee(duel) ? { ok: true, duel: detailOf(duel, me) } : refuse('no_such_duel');
  }

  function challenge({ opponentName, rounds, stake, signals, actionUid }) {
    if (duels.some(duel => duel.challenger === me && duel.moves[me].uid === actionUid)) return refuse('already_applied');
    const problem = checkChoices(rounds, stake) ?? checkSequence(signals, rounds);
    if (problem) return refuse(problem);
    const name = opponentName ? opponentName.trim() : null;
    if (name && !isCaptainName(name)) return refuse('validation_error');
    const opponent = name ? [me, ...RIVALS].find(captain => captain.toLowerCase() === name.toLowerCase()) : null;
    if (name && !opponent) return refuse('no_such_captain');
    if (opponent === me) return refuse('cannot_duel_yourself');
    sweep();
    if (duels.filter(duel => duel.challenger === me && duel.status === 'open').length >= MAX_WAITING) return refuse('too_many_waiting');
    if (coins < stake) return refuse('insufficient_funds');
    coins -= stake;
    const duel = add({
      challenger: me, opponent, isOpen: !name, rounds, stake, createdAt: now(), expiresAt: now() + ANSWER_HOURS * HOUR,
      moves: sealedBy(me, signals, actionUid),
    });
    return { ok: true, duel: detailOf(duel, me), coins };
  }

  function answer(id, signals, actionUid) {
    const duel = find(id);
    if (!duel || (!duel.isOpen && !takesPart(duel, me))) return refuse('no_such_duel');
    const sealed = duel.moves[me];
    if (sealed) return refuse(sealed.uid === actionUid ? 'already_applied' : 'already_sealed');
    if (duel.status !== 'open') return refuse(duel.isOpen && duel.status === 'finished' ? 'duel_taken' : 'duel_closed');
    if (duel.expiresAt <= now()) {
      close(duel, 'expired');
      return refuse('duel_expired');
    }
    const problem = checkSequence(signals, duel.rounds);
    if (problem) return refuse(problem);
    if (duel.stake > 0 && stakedDuelsToday(duel.challenger) >= PAIR_DAILY_LIMIT) return refuse('daily_pair_limit');
    if (coins < duel.stake) return refuse('insufficient_funds');
    settle(duel, me, signals, actionUid);
    return { ok: true, duel: detailOf(duel, me), coins };
  }

  // The challenger withdraws, the named captain declines, and after the window it simply expires.
  function nextStatus(duel, role) {
    if (role === 'visitor') return null;
    if (duel.expiresAt <= now()) return 'expired';
    if (role === 'challenger') return 'withdrawn';
    return duel.isOpen ? null : 'declined';
  }

  function cancel(id) {
    const duel = find(id);
    if (!duel || !canSee(duel)) return refuse('no_such_duel');
    const role = roleOf(duel, me);
    if (duel.status !== 'open') {
      const repeat = (duel.status === 'withdrawn' && role === 'challenger') || (duel.status === 'declined' && role === 'opponent');
      return refuse(repeat ? 'already_applied' : 'duel_closed');
    }
    const status = nextStatus(duel, role);
    if (!status) return refuse('not_your_duel');
    close(duel, status);
    return { ok: true, duel: detailOf(duel, me), coins: role === 'challenger' ? coins : null };
  }

  // The practice rival answers one of the player's waiting challenges with a fair random sequence.
  function rivalAnswers(id) {
    const duel = find(id);
    if (!duel || duel.challenger !== me || duel.status !== 'open' || duel.expiresAt <= now()) return false;
    const rival = duel.opponent ?? RIVALS[Math.floor(random() * RIVALS.length)];
    settle(duel, rival, secretSequence(random, duel.rounds), `rival-${duel.id}`);
    return true;
  }

  startingDuels({ now: now(), random, me }).forEach(add);
  return { list, detail, challenge, answer, cancel, rivalAnswers };
}
