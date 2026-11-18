// Recovers saved personal wave rewards after sign-in and return. Used by game.js, independently of the current island.
import {watchPanelServices} from './panel-services.js';
import {WAVE_REWARDS_RECOVERED} from '../ui/quest-events.js';

const BACKOFF_MS = [5000, 15000, 30000];
const BATCH_GAP_MS = 1000;
const count = value => Number.isSafeInteger(value) && value >= 0;
const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const valid = data => data && count(data.coins) && count(data.wonWaveBest) && data.wonWaveBest <= 1000
  && typeof data.hasMore === 'boolean' && Array.isArray(data.recovered) && data.recovered.length <= 20
  && (!data.hasMore || data.recovered.length > 0)
  && data.recovered.every(row => isUuid(row?.waveId) && count(row.wave) && row.wave >= 1 && row.wave <= 1000
    && typeof row.survived === 'boolean' && count(row.loot));

export function createWaveRewardRecovery({session, emit, onWallet = () => {}, onReset = () => {},
  window = globalThis.window, document = globalThis.document, watchServices = watchPanelServices,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  let disposed = false, lease = null, owner = null, pending = null, timer = null, stopLease = null;
  let attempts = 0, retryAt = 0, offline = window?.navigator?.onLine === false, resume = false;
  const available = () => !disposed && !document?.hidden && !offline;
  const clear = () => { if (timer !== null) clearTimer(timer); timer = null; };
  function snapshot() {
    if (!lease?.isReady() || lease.getIdentity() == null) return null;
    return {lease, identity: lease.getIdentity(), lifetime: lease.getLifetime()};
  }
  const same = (left, right) => left?.lease === right?.lease && Object.is(left?.identity, right?.identity)
    && Object.is(left?.lifetime, right?.lifetime);
  const current = held => !disposed && held === owner && same(held, snapshot());
  function schedule(delay) {
    clear(); retryAt = now() + delay;
    if (available()) timer = setTimer(() => { timer = null; void run(); }, delay);
  }
  function retry(answer) {
    const requested = Number.isSafeInteger(answer?.retryAfterSeconds) && answer.retryAfterSeconds > 0
      ? answer.retryAfterSeconds * 1000 : 0;
    const delay = BACKOFF_MS[Math.min(attempts++, BACKOFF_MS.length - 1)];
    schedule(Math.max(delay, requested));
  }
  function run() {
    if (!available() || !owner || pending) return;
    const held = owner;
    const task = Promise.resolve().then(async () => {
      if (!current(held) || !available()) return;
      const answer = await held.lease.request.post('/api/waves/recover', {});
      if (!current(held)) return;
      if (!answer?.ok || !valid(answer.data)) {
        if (answer?.ok || !answer?.status || answer.status === 429 || answer.status >= 500) retry(answer);
        return;
      }
      const data = answer.data;
      emit({type: WAVE_REWARDS_RECOVERED, wonWaveBest: data.wonWaveBest, recovered: data.recovered});
      const wallet = await held.lease.reconcileWallet();
      if (!current(held)) return;
      if (!wallet?.current()) { retry(); return; }
      onWallet(wallet.coins);
      attempts = 0; retryAt = 0;
      if (data.hasMore) schedule(BATCH_GAP_MS);
    }).catch(() => { if (current(held)) retry(); }).finally(() => {
      if (pending !== task) return;
      pending = null;
      if (resume) { resume = false; wake(); }
    });
    pending = task;
  }
  function wake() {
    if (!available() || !owner || pending) return;
    clear();
    if (retryAt > now()) schedule(retryAt - now());
    else { attempts = 0; retryAt = 0; void run(); }
  }
  function sync() {
    if (disposed) return;
    const next = snapshot();
    if (same(owner, next)) return;
    clear(); owner = next; attempts = 0; retryAt = 0; onReset();
    if (pending) resume = true; else wake();
  }
  function useProvider(next) {
    if (disposed || next === lease) return;
    stopLease?.(); lease = next; stopLease = lease?.subscribe(sync) ?? null; sync();
  }
  const online = () => { offline = false; wake(); };
  const wentOffline = () => { offline = true; clear(); };
  const visibility = () => { if (document?.hidden) clear(); else wake(); };
  const stopWatch = watchServices(session, useProvider);
  window?.addEventListener?.('online', online); window?.addEventListener?.('offline', wentOffline);
  document?.addEventListener?.('visibilitychange', visibility);
  return {dispose() {
    if (disposed) return;
    disposed = true; clear(); stopWatch?.(); stopLease?.(); owner = null;
    window?.removeEventListener?.('online', online); window?.removeEventListener?.('offline', wentOffline);
    document?.removeEventListener?.('visibilitychange', visibility);
  }};
}
