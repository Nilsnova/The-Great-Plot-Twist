// Translate A2 answers into public adapter results; recovery is performed by the adapter.
import {caseReasons} from '../../adapter/reasons.js';

const messages = {
  offline: 'You are offline. Your progress on this device is kept.',
  session_expired: 'Session expired. Sign in again.',
  forbidden: 'This action is not available to this account.',
  feature_off: 'This feature opens later. You can keep exploring.',
  not_ready: 'Your captain is being set up. Try again in a moment.',
  wrong_code: 'No crew has that code.',
  crew_required: 'Make or join a crew first.',
  kit_required: 'Finish Act 1 first.',
  already_in_crew: 'You already belong to a crew.',
  save_conflict: 'This save changed on another device. Choose which copy to keep.',
  name_reroll_used: 'You already used your re-roll.',
  invalid_request: 'This request could not be understood. Report a problem if it happens again.',
  intro_incomplete: 'Finish Act 1 first.',
  save_unavailable: 'This save cannot be stored.',
  internal_error: 'The service could not complete this request. Please try again.',
  too_many_tries: 'Too many crew codes. Wait a moment, then try again.',
  rate_limited: 'Too many attempts. Wait a moment, then try again.',
  not_connected: 'Service unavailable. Try again in a moment.',
  demo_closed: 'Guest play needs the class code from the presenter. Sign in in Settings, or keep playing on this device.',
};
const statusCodes = {
  404: {feature_off: 'feature_off', player_not_set_up: 'not_ready', wrong_code: 'wrong_code', no_crew: 'crew_required'},
  409: {
    kit_needed: 'kit_required', already_in_crew: 'already_in_crew', crew_busy: 'not_ready',
    crew_full: 'not_ready', crew_finished: 'not_ready', stale_save: 'save_conflict',
    no_rerolls_left: 'name_reroll_used', no_name_yet: 'not_ready',
  },
  422: {
    validation_error: 'invalid_request', move_refused: 'intro_incomplete', no_ending: 'intro_incomplete',
    save_too_big: 'save_unavailable', save_not_json: 'save_unavailable', invalid_transaction: 'internal_error',
  },
};
const completedCodes = new Set(['already_applied', 'already_seated', 'already_started']);
const knownReasons = new Set(caseReasons);
const accepted = recovery => ({accepted: true, reason: null, message: '', ...(recovery ? {recovery} : {})});
const refused = reason => ({accepted: false, reason, message: messages[reason] || messages.internal_error});

function success(data) {
  if (data?.accepted !== false) return accepted(data?.repeat === true ? 'reread' : undefined);
  const result = refused(knownReasons.has(data.reason) ? data.reason : 'internal_error');
  if (knownReasons.has(data.reason) && typeof data.message === 'string' && data.message.trim()) {
    result.message = data.message;
  }
  if (data.repeat === true) result.recovery = 'reread';
  return result;
}

function reasonFor(status, code, route) {
  if (status === 0) return 'offline';
  if (status === 401) return 'session_expired';
  if (status === 403) return code === 'demo_closed' ? 'demo_closed' : 'forbidden';
  if (status === 503) return 'not_connected';
  if (status === 429) return route === '/api/crews/join' ? 'too_many_tries' : 'rate_limited';
  const codes = Object.hasOwn(statusCodes, status) ? statusCodes[status] : null;
  return codes && Object.hasOwn(codes, code) ? codes[code] : 'internal_error';
}

function recover(result, status, code, method) {
  if (status === 409 && code === 'crew_busy') result.recovery = 'retry_once';
  if (status === 409 && code === 'no_name_yet') result.recovery = 'init_name';
  const changing = typeof method === 'string' && !['GET', 'HEAD'].includes(method.toUpperCase());
  if (changing && (status === 0 || status === 503)) result.recovery = 'unknown_outcome';
}

export function mapApiResult(answer, {route, method, publicRead = false} = {}) {
  if (answer?.ok === true) return success(answer.data);
  if (answer?.ok !== false) return refused('internal_error');
  const {status, code} = answer;
  // A public GET cannot expire a private account or complete a repeated write.
  if(publicRead&&(status===401||status===409))return refused('internal_error');
  if (status === 409 && completedCodes.has(code)) return accepted('reread');
  const result = refused(reasonFor(status, code, route));
  if (status === 409 && code === 'crew_busy') result.message = 'The crew is busy. Try again.';
  if (status === 409 && ['crew_full', 'crew_finished'].includes(code) && typeof answer.message === 'string') {
    result.message = answer.message.trim() ? answer.message : messages.not_ready;
  }
  const seconds = answer.retryAfterSeconds;
  if (status === 429 && Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400) {
    result.retryAfterSeconds = Math.ceil(seconds);
  }
  recover(result, status, code, method);
  return result;
}
