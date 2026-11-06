// Every sentence the player reads about a refusal or a problem, in one place and in plain
// English. A code from the server maps to exactly one sentence; an unknown code gets the generic
// one. No dash characters other than a plain hyphen, and no raw server text is ever shown.
// Used by: view-store.js, http-adapter.js, fake-ring.js, panel.js and the tests.
import { MAX_WAITING, PAIR_DAILY_LIMIT } from './logic.js';

export const GENERIC_MESSAGE = 'Something went wrong. Try again.';
const PICK_A_SIGNAL = 'Pick a signal for every round within your oil.';

export const MESSAGES = {
  feature_off: 'The ring is closed for now.',
  unauthorized: 'Sign in with GitHub to duel.',
  no_such_captain: 'No captain has that name. Check the spelling, or send an open challenge.',
  name_not_unique: 'Several captains share that name. Send an open challenge instead.',
  cannot_duel_yourself: 'You cannot challenge yourself.',
  too_many_waiting: `You have ${MAX_WAITING} challenges waiting. Withdraw one or wait for an answer.`,
  insufficient_funds: 'You do not have enough coins for this stake.',
  already_applied: '', // the screen treats a repeat as done and reads again, so it says nothing
  already_sealed: 'Your signals for this duel are already sealed.',
  duel_taken: 'Another captain answered first. Your coins did not move.',
  duel_closed: 'This challenge is closed.',
  duel_expired: 'This challenge ran out of time. Its stake went back to the challenger.',
  daily_pair_limit: `You have played ${PAIR_DAILY_LIMIT} staked duels with this captain today. Try a friendly duel.`,
  not_your_duel: 'Only the challenger can withdraw this challenge.',
  no_such_duel: 'This duel is not here any more.',
  bad_rounds: PICK_A_SIGNAL,
  bad_stake: PICK_A_SIGNAL,
  wrong_signal_count: PICK_A_SIGNAL,
  not_enough_oil: PICK_A_SIGNAL,
  validation_error: PICK_A_SIGNAL,
  too_many_requests: 'The ring is busy. Trying again in a moment.',
  database_unavailable: 'The ring did not answer. Your duel may have gone through; checking.',
  retrying: 'The ring did not answer. Retrying.', // shown while the screen keeps asking in the background
};

export function messageFor(code) {
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : GENERIC_MESSAGE;
}

export const decidedMessage = name => `Your duel with ${name} is decided. Watch the reveal.`;
