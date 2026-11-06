// The fixed words of the prediction desk: the play-money line, the credit and one plain sentence for
// every error code. No DOM and no network, so Vitest can test it.
//
// Used by: view-model.js, desk-state.js, flow.js, adapter-http.js, adapter-fake.js and the views.

export const PLAY_MONEY_LINE = 'Forecasting with play coins. Play money: no cash value. It cannot be bought or cashed out.';
export const CREDIT_LINE = 'Questions and results: Manifold Markets (manifold.markets), a play-money forecasting site.';
export const CLOSED_LINE = 'The prediction desk is closed for now.';
export const SIGN_IN_LINE = 'Sign in with GitHub to stake coins.';
export const GENERIC_LINE = 'Something went wrong. Try again.';
export const MANIFOLD_PAUSED_LINE = 'Manifold cannot be checked right now, so staking is paused.';

const LONGEST_SERVER_MESSAGE = 300;

// One sentence for every code the desk routes can answer (docs/INTERFACES.md, the prediction desk),
// plus the codes the browser makes up when there is no answer at all (network_error and timeout).
// These are the fallback: the server's own message is shown first when there is one.
const SENTENCES = {
  unauthorized: SIGN_IN_LINE,
  forbidden: 'Only a host can do this.',
  feature_off: CLOSED_LINE,
  not_found: CLOSED_LINE,
  no_such_question: 'That question is not on the prediction desk.',
  already_applied: 'That was already done.',
  pool_closed: 'Staking on this question has closed.',
  already_staked: 'You already staked on this question. One stake per question.',
  daily_stake_cap: 'You have reached the daily limit for stakes at the desk. Try again tomorrow.',
  insufficient_funds: 'You do not have enough coins for that stake.',
  pool_open: 'Staking is still open. Settle the question after it closes, or void it.',
  outcome_conflict: 'Manifold decided this question differently. Settle it the way Manifold decided, or void it.',
  stakes_changed: 'The pool changed while it was being settled. Try again.',
  validation_error: 'That did not look right. Check the numbers and try again.',
  stake_too_small: 'A stake must be at least 1 coin.',
  stake_too_big: 'You can stake at most 50 coins on one question.',
  too_many_requests: 'You are staking very fast. Wait a few seconds, then try again.',
  predictions_unavailable: 'The prediction desk is not working right now. Try again later.',
  source_unavailable: MANIFOLD_PAUSED_LINE,
  database_unavailable: 'The desk could not answer just now. Try again in a moment.',
  database_not_configured: 'The prediction desk is not set up yet. Try again later.',
  database_error: 'Something went wrong on our side. Try again in a moment.',
  server_error: 'Something went wrong on our side. Try again in a moment.',
  network_error: 'No connection to the server. Check your internet and try again.',
  timeout: 'The server took too long to answer. Try again.',
};

export function sentenceFor(code) {
  return typeof code === 'string' && Object.hasOwn(SENTENCES, code) ? SENTENCES[code] : GENERIC_LINE;
}

export function waitText(seconds) {
  if (!Number.isInteger(seconds) || seconds < 1) return 'Too many tries. Wait a few seconds, then try again.';
  return `Too many tries. Wait ${seconds} ${seconds === 1 ? 'second' : 'seconds'}, then try again.`;
}

// The server writes its messages in plain English, so they are shown as they are (as text, never as HTML).
export function serverMessage(message) {
  if (typeof message !== 'string') return null;
  const trimmed = message.trim();
  return trimmed === '' ? null : trimmed.slice(0, LONGEST_SERVER_MESSAGE);
}

// What to tell the player about an answer that was not a plain success.
export function refusalText(reply) {
  if (reply.kind === 'closed') return CLOSED_LINE;
  if (reply.kind === 'signin') return SIGN_IN_LINE;
  if (reply.kind === 'wait') return waitText(reply.seconds);
  return serverMessage(reply.message) ?? sentenceFor(reply.code);
}
