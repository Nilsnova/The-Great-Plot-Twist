// Opaque account scopes guard presentation work; no token or account data enters this module.
import {CLOSED_LINE, GENERIC_LINE, SIGN_IN_LINE, refusalText} from './messages.js';

export function predictionEnabled(getFlags) {
  try { return getFlags?.()?.predictions === true; } catch { return false; }
}

export function createDeskScope({getIdentity = () => null, enabled = () => false} = {}) {
  let generation = 0, opened = false, disposed = false;
  const identity = () => { try { return getIdentity(); } catch { return null; } };
  const allowed = () => { try { return enabled() === true; } catch { return false; } };
  const capture = () => ({generation, identity: identity()});
  function current(ticket, {privateRead = false} = {}) {
    return !disposed && opened && allowed() && ticket?.generation === generation
      && Object.is(ticket.identity, identity()) && (!privateRead || ticket.identity != null);
  }
  return {
    capture, current,
    open() { if (!disposed) { opened = true; generation += 1; } },
    invalidate() { generation += 1; },
    close() { opened = false; generation += 1; },
    dispose() { disposed = true; opened = false; generation += 1; },
  };
}

export const cancelledStake = () => ({reply: {kind: 'signin', message: SIGN_IN_LINE},
  done: false, step: 'edit', keepId: false, refresh: false, cancelled: true, notice: SIGN_IN_LINE});

export function predictionFailure(reply) {
  const kind = reply?.kind, status = reply?.status;
  const reason = kind === 'signin' ? 'session_expired' : kind === 'closed' ? 'feature_off'
    : kind === 'wait' ? 'rate_limited' : status === 0 ? 'offline'
      : status === 503 ? 'not_connected' : kind === 'refused' && typeof reply.code === 'string'
        ? reply.code : 'internal_error';
  const safe = reply ? refusalText(reply) : GENERIC_LINE;
  return {accepted: false, reason, message: kind === 'closed' ? CLOSED_LINE : safe,
    ...(kind === 'wait' && Number.isFinite(reply.seconds) ? {retryAfterSeconds: reply.seconds} : {})};
}
