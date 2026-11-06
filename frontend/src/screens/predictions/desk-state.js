// The one state the desk shows, built from the two answers it asks for: the list and "mine".
// Pure, so Vitest can test it. A failed refresh keeps the last good numbers on screen.
//
// phase: 'loading' (nothing asked yet), 'ready', 'closed' (the flag is off) or 'unavailable' (never got a list).
// signedIn: true, false (after a 401) or null (not known, because "mine" failed the first time).
//
// Used by: desk.js and the tests.

import { CLOSED_LINE, refusalText } from './messages.js';

export function initialDeskState() {
  return { phase: 'loading', list: null, mine: null, signedIn: null, host: false, notice: null };
}

function withMine(state, reply) {
  if (reply.kind === 'ok') {
    return { ...state, mine: reply.data, signedIn: true, host: reply.data.host === true };
  }
  if (reply.kind === 'signin') return { ...state, mine: null, signedIn: false, host: false };
  return state;
}

export function deskStateFrom(previous, listReply, mineReply) {
  if (listReply.kind === 'closed' || mineReply.kind === 'closed') {
    return { ...initialDeskState(), phase: 'closed', notice: CLOSED_LINE };
  }
  let next = { ...previous, notice: null };
  if (listReply.kind === 'ok') next.list = listReply.data;
  next = withMine(next, mineReply);
  const failed = [listReply, mineReply].find(reply => reply.kind !== 'ok' && reply.kind !== 'signin');
  if (failed) next.notice = refusalText(failed);
  next.phase = next.list ? 'ready' : 'unavailable';
  return next;
}
