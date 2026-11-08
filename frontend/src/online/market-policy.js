// Market lease facade: requests stay with their explicit session and public prices stay anonymous.
import {cacheMarketCredits} from './market-credits.js';

const safely = (read, fallback = null) => { try { return read(); } catch { return fallback; } };
const refusal = (code = 'not_ready', status = 503) => ({ok: false, status, code,
  message: code === 'unauthorized' ? 'Please sign in again.' : code === 'feature_off'
    ? 'The Island Exchange is not open yet.' : 'This part is not ready yet. You can keep exploring.'});

export function createMarketPolicy(lease) {
  let disposed = false;
  const subscriptions = new Set();
  function read(name, fallback = null) {
    const value = disposed ? fallback : safely(() => lease[name](), fallback);
    return disposed ? fallback : value;
  }
  function current(ticket) {
    const owned = !disposed && safely(() => lease.current(ticket), false) === true;
    return !disposed && owned;
  }
  function admission(privateRead) {
    if (disposed || read('isReady', false) !== true) return {failure: refusal()};
    const ticket = safely(() => lease.capture('market', privateRead
      ? {privateRead: true} : {allowFlagOff: true, privateRead: false}));
    if (privateRead && read('getFlags', {})?.market !== true) return {failure: refusal('feature_off', 404)};
    if (privateRead && read('getIdentity') == null) return {failure: refusal('unauthorized', 401)};
    return ticket && current(ticket) ? {ticket} : {failure: refusal()};
  }
  async function invoke(path, options, privateRead) {
    try {
      const admitted = admission(privateRead);
      if (admitted.failure) return admitted.failure;
      const result = await (privateRead ? lease.marketRequest(path, options) : lease.publicGet(path));
      if (!current(admitted.ticket)) return refusal();
      if (!result || typeof result.ok !== 'boolean') return refusal('unavailable');
      if (!privateRead && path === '/api/market' && result.ok === true) {
        cacheMarketCredits(lease, result.data?.credits, () => current(admitted.ticket));
        if (!current(admitted.ticket)) return refusal();
      }
      if (!privateRead && path === '/api/market' && result.ok === true && read('getFlags', {})?.market !== true) {
        if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) return refusal('unavailable');
        return {...result, data: {...result.data, tradingEnabled: false}};
      }
      return result;
    } catch { return refusal('unavailable'); }
  }
  function stop(record) {
    record.active = false; subscriptions.delete(record);
    const unsubscribe = record.unsubscribe; record.unsubscribe = null;
    safely(() => unsubscribe?.());
  }
  function onSessionChange(listener) {
    if (disposed || typeof listener !== 'function') return () => {};
    const record = {active: true, unsubscribe: null}; subscriptions.add(record);
    const unsubscribe = safely(() => lease.onSessionChange((...args) => {
      if (disposed || !record.active) return;
      const result = safely(() => listener(...args));
      if (typeof result?.then === 'function') Promise.resolve(result).catch(() => {});
    }));
    record.unsubscribe = typeof unsubscribe === 'function' ? unsubscribe : null;
    if (disposed || !record.active) stop(record);
    return () => stop(record);
  }
  return {
    request: (path, options) => invoke(path, options, true),
    publicGet: path => invoke(path, undefined, false),
    getToken: () => read('getToken'),
    getIdentity: () => read('getIdentity'),
    getFlags: () => read('getFlags', {}),
    onSessionChange,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const record of [...subscriptions]) stop(record);
    },
  };
}
