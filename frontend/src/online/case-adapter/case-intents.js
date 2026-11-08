// Private case write owner. DTO validation/application and lifecycle admission are explicit ports.
import {buildCaseRequest, parseCaseIntentAnswer} from './case-wire.js';
import {mapApiResult} from './reasons.js';

const messages = {
  disposed: 'This client has closed.', not_ready: 'This part is not ready yet. Try again.',
  sign_in_required: 'Sign in with GitHub first.', invalid_request: 'Check this action and try again.',
  crew_required: 'Make or join a crew first.',
};
const local = reason => ({mapped: {accepted: false, reason, message: messages[reason]}});
const uncertain = reply => reply?.status === 0 || reply?.status >= 500 || reply?.ok !== false;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function createCaseIntents({api, getScope, capture, isCurrent, validateCase, applyCase,
  readCase, now = Date.now} = {}) {
  const attempts = new Map();
  let disposed = false, generation = 0, heldScope, retryUntil = 0;
  const scope = () => {try {return getScope?.() ?? null;} catch {return null;}};
  function reset() {generation += 1; attempts.clear(); heldScope = scope(); retryUntil = 0;}
  function reconcile() {if (!Object.is(heldScope, scope())) reset();}
  function owned(record) {
    return !disposed && attempts.get(record.uid) === record && Object.is(record.scope, scope());
  }
  function current(owner) {
    if (!owned(owner.record) || owner.generation !== generation) return false;
    try {return isCurrent?.(owner.ticket) === true && owned(owner.record) && owner.generation === generation;}
    catch {return false;}
  }
  function stale() {return {...local(disposed ? 'disposed' : 'not_ready'), stale: true};}
  function mapped(reply, route, method) {
    const {recovery, ...result} = mapApiResult(reply, {route, method});
    // HTTP errors without the published fresh-case envelope cannot confirm a case action.
    return reply?.ok !== true && result.accepted
      ? mapApiResult({ok: false, status: 502, code: 'database_error'}) : result;
  }
  function holdRate(reply, record) {
    const seconds = reply?.retryAfterSeconds;
    if (owned(record) && reply?.status === 429 && typeof seconds === 'number'
      && Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400) {
      retryUntil = Math.max(retryUntil, now() + Math.ceil(seconds) * 1000);
    }
  }
  function limited() {
    const remaining = retryUntil - now();
    if (remaining <= 0) return null;
    return {mapped: mapApiResult({ok: false, status: 429, code: 'too_many_requests',
      retryAfterSeconds: Math.ceil(remaining / 1000)}), retryUntil};
  }
  function validate(raw) {
    try {const result = validateCase?.(raw); return result?.ok === true && Object.hasOwn(result, 'value') ? result : null;}
    catch {return null;}
  }
  function apply(value, owner, source) {
    if (!current(owner) || typeof applyCase !== 'function') return false;
    try {
      const applied = applyCase(value, {source, isCurrent: () => current(owner)});
      return applied !== false && typeof applied?.then !== 'function' && current(owner);
    }
    catch {return false;}
  }
  async function readBeforeRetry(record, owner) {
    const blocked = packet => ({...packet, uncertain: record.uncertain, needsRetry: true});
    let reply;
    try {reply = await readCase({fresh: true});} catch {reply = {ok: false, status: 0};}
    holdRate(reply, record);
    if (!current(owner)) return blocked(stale());
    if (reply?.ok !== true || reply.status !== 200) return blocked({reply,
      mapped: mapped(reply?.ok === true ? {ok: false, status: 502, code: 'database_error'} : reply, '/api/case', 'GET'), retryUntil});
    const data = reply.data;
    const checked = object(data) && Object.hasOwn(data, 'case') ? validate(data.case) : null;
    if (!checked) return blocked({reply, mapped: mapped({ok: false, status: 502, code: 'database_error'})});
    if (!apply(checked.value, owner, 'retry-read')) return blocked(stale());
    if (checked.value === null) return blocked(local('crew_required'));
    const wait = limited(); return wait ? blocked(wait) : null;
  }
  async function execute(record, owner, retry) {
    if (!current(owner)) return stale();
    if (typeof api?.post !== 'function' || typeof validateCase !== 'function' || typeof applyCase !== 'function'
      || (retry && typeof readCase !== 'function')) return local('not_ready');
    const wait = limited(); if (wait) return wait;
    if (retry) {
      const refusedRead = await readBeforeRetry(record, owner);
      if (refusedRead) return refusedRead;
      if (!current(owner)) return stale();
    }
    record.sent = true; record.uncertain = true;
    let reply;
    try {reply = await api.post(record.request.route, structuredClone(record.request.body));}
    catch {reply = {ok: false, status: 0};}
    holdRate(reply, record);
    if (!current(owner)) return stale();
    if (reply?.ok === true && reply.status === 200) {
      const answer = parseCaseIntentAnswer(reply.data), checked = answer ? validate(answer.case) : null;
      if (checked) {
        if (!apply(checked.value, owner, 'write')) return stale();
        record.uncertain = false; record.terminal = true;
        const result = mapped(reply, record.request.route, 'POST');
        return {reply, answer, mapped: {...result, ...(answer.repeat === undefined ? {} : {repeat: answer.repeat})}};
      }
    }
    record.uncertain = uncertain(reply);
    const result = reply?.ok === true ? mapped({ok: false, status: 502, code: 'database_error'})
      : mapped(reply, record.request.route, 'POST');
    return {reply, mapped: result, uncertain: record.uncertain, retryUntil};
  }
  function start(record, retry) {
    if (record.task) return record.task;
    let ticket;
    try {ticket = capture?.();} catch {return Promise.resolve(local('not_ready'));}
    const owner = {record, ticket, generation};
    const task = Promise.resolve().then(() => execute(record, owner, retry)).then(result => {
      if (current(owner) && !result.stale) record.result = result;
      return result;
    }).finally(() => {if (record.task === task) record.task = null;});
    record.task = task; return task;
  }
  function send(intent, body) {
    if (disposed) return Promise.resolve(local('disposed'));
    reconcile();
    if (heldScope === null) return Promise.resolve(local('sign_in_required'));
    const request = buildCaseRequest(intent, body);
    if (!request) return Promise.resolve(local('invalid_request'));
    const uid = request.body.actionUid, signature = JSON.stringify(request);
    let record = attempts.get(uid);
    if (record && record.signature !== signature) return Promise.resolve(local('invalid_request'));
    if (record?.task) return record.task;
    if (record?.result) return Promise.resolve({...record.result, ...(!record.terminal ? {needsRetry: true} : {})});
    if (record) return Promise.resolve({...local('not_ready'), needsRetry: true});
    record = {uid, request, signature, scope: heldScope, sent: false, uncertain: false, terminal: false, task: null, result: null};
    attempts.set(uid, record); return start(record, false);
  }
  function retry(uid) {
    if (disposed) return Promise.resolve(local('disposed'));
    reconcile();
    if (heldScope === null) return Promise.resolve(local('sign_in_required'));
    const record = attempts.get(uid);
    if (!record) return Promise.resolve(local('not_ready'));
    if (record.task) return record.task;
    if (record.terminal) return Promise.resolve(record.result);
    return start(record, true);
  }
  function pause() {
    generation += 1;
    for (const record of attempts.values()) {
      if (record.sent && !record.terminal) record.uncertain = true;
      record.task = null;
    }
  }
  function release(uid) {
    if (disposed) return false;
    reconcile();
    const record = attempts.get(uid);
    if (!record || record.task || record.uncertain || record.result?.needsRetry || record.result?.stale
      || record.result?.mapped?.reason === 'rate_limited') return false;
    return attempts.delete(uid);
  }
  return {send, retry, pause, reset, release,
    getRetryUntil() {reconcile(); return retryUntil;},
    dispose() {if (disposed) return; reset(); disposed = true;},
  };
}
