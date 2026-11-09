// The duel shortcut as a plain state machine: near another captain, tap them or press E, choose Wave or
// "Friendly duel (3 rounds)", seal three signals, and the other captain gets "Accept / Not now" in
// place. The server decides the duel (Lantern Duels, D026); this file only says which screen shows.
// No DOM and no network here: duel-overlay.js draws a state and duel-api.js does the calls.
export const SHORTCUT_ROUNDS = 3;
export const SHORTCUT_STAKE = 0;
export const NEAR_DISTANCE = 2.8; // world units: about two steps
export const WAIT_LIMIT_MS = 90000; // the challenger stops waiting in the spotlight after this

export const initialDuel = () => ({screen: 'idle', target: null, duel: null, message: '', uid: null, startedAt: null});

// The nearest shown captain within reach, or null. others: [{id, name, x, y}], player: {x, y}.
export function nearestCaptain(others, player, max = NEAR_DISTANCE) {
  let best = null, bestDistance = max;
  for (const other of others ?? []) {
    if (!Number.isFinite(other?.x) || !Number.isFinite(other?.y) || typeof other.name !== 'string') continue;
    const distance = Math.hypot(other.x - player.x, other.y - player.y);
    if (distance <= bestDistance) { best = other; bestDistance = distance; }
  }
  return best;
}

// The body of POST /api/duels for a friendly named challenge.
export function friendlyChallenge({opponentName, signals, actionUid}) {
  return {opponentName, rounds: SHORTCUT_ROUNDS, stake: SHORTCUT_STAKE, signals: [...signals], actionUid};
}

const DUEL_MESSAGES = {
  feature_off: 'Duels are switched off right now. Try again later.',
  no_such_captain: 'That captain has left the harbor.',
  name_not_unique: 'Two captains share that name. Challenge them in the ring instead.',
  cannot_duel_yourself: 'You cannot duel yourself.',
  too_many_waiting: 'You already have three challenges waiting. Wait for an answer first.',
  duel_taken: 'Somebody else answered first.',
  duel_closed: 'This challenge is no longer open.',
  duel_expired: 'This challenge has expired.',
  already_sealed: 'This duel already has both answers.',
  not_your_duel: 'This challenge is for another captain.',
  demo_closed: 'The class demo is closed right now. Ask the presenter to open it.',
  unauthorized: 'Sign in to duel. Guests can play while the class demo is open.',
  network: 'No connection to the server. Your choice is kept: try again.',
  unknown: 'Something went wrong. Your choice is kept: try again.',
};
export function duelMessage(failure) {
  if (failure?.status === 0 || failure?.network) return DUEL_MESSAGES.network;
  if (failure?.status === 429) return failure.message || 'Too many tries. Wait a moment, then try again.';
  return DUEL_MESSAGES[failure?.code] ?? (failure?.status >= 500 ? DUEL_MESSAGES.unknown : failure?.message || DUEL_MESSAGES.unknown);
}
// An unknown outcome keeps the same action id for the retry (the server answers already_applied).
export const isUnknownOutcome = failure => !failure || failure.status === 0 || failure.network === true || failure.status >= 500;

// One step of the machine. Unknown events or events for another screen change nothing.
export function duelStep(state, event) {
  const s = state ?? initialDuel();
  switch (event?.type) {
    case 'open':
      if (!['idle', 'error'].includes(s.screen) || !event.target?.name) return s;
      return {...initialDuel(), screen: 'menu', target: {id: event.target.id ?? null, name: event.target.name}};
    case 'close':
      return ['sending', 'answering'].includes(s.screen) ? s : initialDuel();
    case 'wave':
      return s.screen === 'menu' ? initialDuel() : s;
    case 'choose_duel':
      return s.screen === 'menu' ? {...s, screen: 'picking', message: ''} : s;
    case 'seal':
      if (!['picking', 'error'].includes(s.screen) || !s.target) return s;
      return {...s, screen: 'sending', uid: s.uid ?? event.uid, message: ''};
    case 'sent':
      return s.screen === 'sending' ? {...s, screen: 'waiting', duel: event.duel ?? null, uid: null, startedAt: event.now ?? null,
        message: `Challenge sent. Waiting for ${s.target.name} to answer.`} : s;
    case 'invited':
      if (s.screen !== 'idle' || !event.duel?.id) return s;
      return {...initialDuel(), screen: 'invited', duel: event.duel, target: {id: null, name: event.duel.challengerName ?? 'A captain'}};
    case 'accept':
      return s.screen === 'invited' ? {...s, screen: 'answering_pick', message: ''} : s;
    case 'decline':
      return s.screen === 'invited' ? initialDuel() : s;
    case 'answer':
      if (!['answering_pick', 'error'].includes(s.screen) || !s.duel) return s;
      return {...s, screen: 'answering', uid: s.uid ?? event.uid, message: ''};
    case 'finished':
      if (!['waiting', 'answering', 'sending'].includes(s.screen) || !event.duel?.reveal) return s;
      return {...s, screen: 'reveal', duel: event.duel, uid: null, message: ''};
    case 'declined':
      return s.screen === 'waiting' ? {...s, screen: 'error', duel: null, message: `${s.target.name} said not now.`, retry: null} : s;
    case 'timeout':
      return s.screen === 'waiting' ? {...s, screen: 'error', message: `No answer yet. ${s.target.name} can still answer from the ring.`, retry: null} : s;
    case 'failed': {
      if (!['sending', 'answering'].includes(s.screen)) return s;
      const keep = isUnknownOutcome(event.failure);
      return {...s, screen: 'error', uid: keep ? s.uid : null, message: duelMessage(event.failure),
        retry: s.screen === 'sending' ? 'seal' : 'answer', signals: event.signals ?? null};
    }
    case 'done':
      return initialDuel();
    default:
      return s;
  }
}

// The words of the menu and the prompt.
export const menuCopy = target => ({title: target.name, wave: 'Wave', duel: `Friendly duel (${SHORTCUT_ROUNDS} rounds)`, close: 'Not now'});
export const inviteCopy = name => ({title: 'A friendly duel', text: `${name} challenges you to a friendly duel (3 rounds, no coins).`, accept: 'Accept', decline: 'Not now'});
