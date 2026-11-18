// Shared Harbor cards belong to one private provider, authenticated actor and canonical island run.
import {watchPanelServices} from '../online/panel-services.js';
import {coinInteger, isUuid, originMatches, validEconomy} from './shared-stakes.js';

const safely = (read, fallback = null) => {try {return read();} catch {return fallback;}};
const unavailable = () => ({ok: false, status: 0, unknown: true, code: 'economy_scope_changed',
  message: 'The island or sign-in changed. Open this stall again.'});
const originOf = value => Object.freeze(Object.fromEntries(
  ['mode', 'version', 'islandOwner', 'accountId', 'runEpoch'].map(key => [key, value[key]])));

export function createSharedWagerHost({session, container, getEconomy, onEconomy, subscribeEconomy,
  resetInput, focusGame, onSignIn, notify,
  loadMarket = () => import('./shared-market-card.js'),
  loadMatch = () => import('./shared-match-card.js')} = {}) {
  const modules = new Map(), loading = new Map();
  let disposed = false, provider = null, held = null, stopProvider = null, stopWatch = null, stopEconomy = null;
  const economy = () => safely(() => getEconomy?.());
  function current(saved) {
    if (disposed || held !== saved || provider !== saved.provider) return false;
    const permitted = safely(() => saved.provider.current(saved.ticket), false) === true;
    const selected = economy(), actor = safely(() => saved.provider.getActorId());
    return permitted && held === saved && provider === saved.provider && actor === saved.actor
      && validEconomy(selected) && originMatches(selected, saved.origin);
  }
  function discard(saved) {
    safely(() => saved?.entry?.close()); safely(() => saved?.entry?.dispose());
  }
  function close() {
    const saved = held; held = null;
    discard(saved);
    return saved !== null;
  }
  function sync() {if (held && !current(held)) close();}
  function useProvider(next) {
    if (disposed || provider === next) return;
    close(); safely(() => stopProvider?.()); stopProvider = null; provider = next;
    const stop = safely(() => next?.subscribe(sync));
    if (disposed || provider !== next) safely(() => stop?.());
    else stopProvider = typeof stop === 'function' ? stop : null;
  }
  function load(product) {
    if (modules.has(product)) return Promise.resolve(modules.get(product));
    if (!loading.has(product)) {
      const task = Promise.resolve().then(product === 'market' ? loadMarket : loadMatch)
        .then(value => {if (!disposed) modules.set(product, value); return value;});
      loading.set(product, task);
      const clear = () => {if (loading.get(product) === task) loading.delete(product);};
      task.then(clear, clear);
    }
    return loading.get(product);
  }
  function callbacks(saved) {
    const subscribe = (source, listener) => safely(() => source(() => {
      if (current(saved)) listener();
    }), () => {});
    async function request(method, args) {
      if (!current(saved)) return unavailable();
      const result = await safely(() => saved.provider.request[method](...args), Promise.resolve(unavailable()));
      return current(saved) ? result : unavailable();
    }
    return {container, resetInput, focusGame, onSignIn, notify,
      api: {get: (...args) => request('get', args), post: (...args) => request('post', args)},
      getEconomy: () => current(saved) ? economy() : null,
      getActorId: () => current(saved) ? saved.actor : null,
      onEconomy(value, expectedOrigin) {
        if (!current(saved) || !validEconomy(value) || !originMatches(value, saved.origin)
            || !originMatches(expectedOrigin, saved.origin) || coinInteger(value.revision) < coinInteger(economy().revision)) return false;
        return safely(() => onEconomy?.(value, saved.origin), false);
      },
      subscribeEconomy: typeof subscribeEconomy === 'function'
        ? listener => subscribe(subscribeEconomy, listener) : undefined,
      onSessionChange: listener => subscribe(callback => saved.provider.onSessionChange(callback), listener)};
  }
  async function open(product) {
    if (disposed || !['market', 'football'].includes(product)) return false;
    sync();
    if (held?.product === product && current(held) && (held.pending || held.entry?.active === true)) return held.promise;
    close();
    const selected = economy(), captured = provider;
    if (!validEconomy(selected) || !captured) return false;
    const origin = originOf(selected), actor = safely(() => captured.getActorId());
    const ticket = safely(() => captured.capture(product === 'market' ? 'market' : 'sports', {privateRead: true}));
    if (!isUuid(actor) || !ticket || provider !== captured) return false;
    const saved = {provider: captured, actor, origin, ticket, product, entry: null, pending: true, promise: null};
    held = saved;
    if (!current(saved)) {close(); return false;}
    saved.promise = (async () => {
      try {
        const loaded = await load(product);
        if (!current(saved)) return false;
        const factory = product === 'market' ? loaded.createSharedMarketEntry : loaded.createSharedMatchEntry;
        saved.entry = factory(callbacks(saved));
        if (!current(saved)) {discard(saved); return false;}
        await saved.entry.open();
        if (!current(saved)) {discard(saved); return false;}
        return saved.entry.active === true;
      } catch {
        if (current(saved)) safely(() => notify?.('The shared Harbor could not open. Try again.'));
        return false;
      } finally {
        saved.pending = false;
        if (held === saved && (!current(saved) || saved.entry?.active !== true)) close();
      }
    })();
    return saved.promise;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; close();
    safely(() => stopWatch?.()); safely(() => stopProvider?.()); safely(() => stopEconomy?.());
    stopWatch = stopProvider = stopEconomy = provider = null; modules.clear();
  }
  stopWatch = watchPanelServices(session, useProvider);
  stopEconomy = safely(() => subscribeEconomy?.(sync));
  return {open, close, dispose, get active() {sync(); return !!held && (held.pending || held.entry?.active === true);}};
}
