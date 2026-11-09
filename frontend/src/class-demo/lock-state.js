// The Keeper's Lock screen as a plain state machine. The server asks the question, checks the answer
// against the real weather of the player's place and writes every message (D029); this file only says
// what the screen shows and keeps one action id per answer, so a retry after an unknown outcome repeats
// the same answer instead of counting as a new try. No DOM and no network: lock-screen.js and lock-api.js.
export const LOCK_PLACE_KEY = 'plot_twist_lock_place_v1';

export const initialLock = () => ({status: 'loading', view: null, message: '', tone: 'info', prompt: null,
  pending: null, uid: null, fatal: false, retryAfter: 0, opened: false, match: null});

// Plain words for every refusal of the HTTP layer. failure: {status, code, message, retryAfterSeconds}.
export function lockFailure(failure) {
  const code = failure?.code, status = failure?.status ?? 0;
  if (code === 'demo_closed') return {message: 'Guest play needs the class code. Ask the presenter for the current code, or sign in with GitHub or Google in Settings.', fatal: true};
  if (code === 'too_many_tries') return {message: 'The lock has heard enough answers for today. Ask the presenter for help, or try again tomorrow.', fatal: true};
  if (status === 429) {
    const seconds = failure?.retryAfterSeconds;
    return {message: seconds ? `Too many tries at once. Wait ${seconds} ${seconds === 1 ? 'second' : 'seconds'}, then try again.` : 'Too many tries at once. Wait a moment, then try again.', fatal: false, retryAfter: seconds ?? 0};
  }
  if (status === 401 || code === 'unauthorized') return {message: 'Sign in to open the lock. Guests can play while the class demo is open.', fatal: true};
  if (code === 'player_not_set_up') return {message: 'Your captain is not set up yet. Walk around for a moment, then try again.', fatal: false};
  if (status === 0) return {message: 'No connection to the server. Check the internet, then try again.', fatal: false};
  if (code === 'validation_error') return {message: 'That answer could not be read. Choose one of the buttons.', fatal: false};
  return {message: 'The lock is stuck for a moment. Try again.', fatal: false};
}
// An unknown outcome (no answer, a timeout, a server fault) keeps the action id for the retry.
const unknownOutcome = failure => (failure?.status ?? 0) === 0 || failure.status >= 500;

export function lockStep(state, event) {
  const s = state ?? initialLock();
  switch (event?.type) {
    case 'load':
      return {...s, status: 'loading', message: s.opened ? s.message : ''};
    case 'loaded': {
      const view = event.view;
      if (!view || !Array.isArray(view.choices)) return {...s, status: 'error', message: lockFailure({}).message};
      const opened = view.opened === true || s.opened;
      return {...s, status: opened ? 'open' : 'ready', view, opened, fatal: false,
        message: opened && !s.message ? 'The Keeper’s Lock is already open.' : s.message, tone: opened ? 'success' : s.tone};
    }
    case 'load_failed': {
      const failure = lockFailure(event.failure);
      return {...s, status: 'error', message: failure.message, tone: 'warning', fatal: failure.fatal, retryAfter: failure.retryAfter ?? 0};
    }
    case 'answer': {
      if (!['ready', 'error'].includes(s.status) || s.fatal || s.opened || typeof event.answer !== 'string') return s;
      // The same answer after an unknown outcome reuses its id; a different answer gets a new one.
      const uid = s.pending === event.answer && s.uid ? s.uid : event.uid;
      return {...s, status: 'sending', pending: event.answer, uid, message: 'Checking the sky…', tone: 'info'};
    }
    case 'answered': {
      if (s.status !== 'sending') return s;
      const reply = event.reply ?? {};
      const view = reply.lock && Array.isArray(reply.lock.choices) ? reply.lock : s.view;
      if (reply.accepted === true) {
        return {...s, status: 'open', view, opened: true, pending: null, uid: null, prompt: null, match: reply.match ?? null,
          message: reply.message ?? 'The lock opens.', tone: 'success'};
      }
      return {...s, status: 'ready', view, pending: null, uid: null,
        prompt: reply.reason === 'hint_offered' ? (reply.prompt ?? 'I looked outside') : null,
        message: reply.message ?? 'Not quite.', tone: reply.reason === 'question_changed' ? 'info' : 'warning'};
    }
    case 'answer_failed': {
      if (s.status !== 'sending') return s;
      const failure = lockFailure(event.failure);
      return {...s, status: 'error', message: failure.message, tone: 'warning', fatal: failure.fatal,
        retryAfter: failure.retryAfter ?? 0, uid: unknownOutcome(event.failure) ? s.uid : null,
        pending: unknownOutcome(event.failure) ? s.pending : null};
    }
    default:
      return s;
  }
}

// What the screen offers right now.
export function lockActions(state) {
  const ready = ['ready', 'error'].includes(state.status) && !state.fatal && !state.opened && !!state.view;
  return {
    choices: ready ? state.view.choices : [],
    hint: ready && state.view.hintReady === true && !state.prompt,
    confirm: ready && !!state.prompt ? state.prompt : null,
    retry: state.status === 'error' && !state.fatal && !state.view,
    changePlace: !state.opened && state.view?.weatherSource !== 'clue' && state.status !== 'sending',
  };
}

// A short line about where the question comes from.
export function sourceLine(view) {
  if (!view) return '';
  if (view.weatherSource === 'clue') return 'No weather reading right now, so the lock asks a riddle instead.';
  if (view.weatherSource === 'cache') return 'The weather service is slow, so the lock uses the last reading of your place.';
  return view.place?.source === 'chosen' ? `Using the place you chose: ${view.place.name}.` : '';
}

// The "Change place" choice, held in this browser only (session storage), never sent to be stored.
export function readChosenPlace(storage) {
  try {
    const place = JSON.parse(storage?.getItem(LOCK_PLACE_KEY) ?? 'null');
    return isPlace(place) ? {name: place.name, latitude: place.latitude, longitude: place.longitude} : null;
  } catch { return null; }
}
export function writeChosenPlace(storage, place) {
  try {
    if (place === null) storage?.removeItem(LOCK_PLACE_KEY);
    else if (isPlace(place)) storage?.setItem(LOCK_PLACE_KEY, JSON.stringify({name: place.name, latitude: place.latitude, longitude: place.longitude}));
    else return false;
    return true;
  } catch { return false; }
}
export function isPlace(place) {
  return !!place && typeof place.name === 'string' && place.name.trim().length > 0 && place.name.length <= 80
    && Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 90
    && Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180;
}
// One line per search result: "Lisbon, Lisbon, Portugal" without repeats.
export const placeLabel = place => [...new Set([place.name, place.region, place.country].filter(Boolean))].join(', ');

export const REWARD_LINE = 'Reward: the brass lamp key. Three lamps stand by the lighthouse path; light them with two more captains.';
