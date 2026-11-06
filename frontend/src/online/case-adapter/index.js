// The real schema-1 adapter owns network state. Its factory returns before background reads finish.
import {createApi} from '../api.js';
import {session as defaultSession} from '../session.js';
import {createLazyAuth} from '../lazy-auth.js';
import {on as busOn} from '../../core/events.js';
import {bindCaseMethods} from '../../adapter/contract.js';
import {createAdapterStore} from './store.js';
import {createAdapterTransport} from './transport.js';
import {createAdapterPolling} from './polling.js';
import {createProfileHandlers, initializeAccountName} from './profile.js';
import {createAccountSaves} from './saves.js';
import {createAccountLifecycle} from './account-lifecycle.js';
import {refreshAccountRewards} from './rewards.js';
import {createCrewHandlers} from './crew.js';
import {validateIntent} from './validate.js';
import {introJournal} from '../../story/intro-journal.js';

const messages = {
  disposed: 'This client has closed.',
  invalid_request: 'Check this action and try again.',
  sign_in_required: 'Sign in with GitHub to claim your kit. Your progress on this device is kept.',
  session_expired: 'Sign in again; your progress on this device is kept.',
  feature_off: 'This feature opens later. You can keep exploring.',
  not_connected: 'Service unavailable. Try again in a moment.',
  not_ready: 'This part is not ready yet. You can keep exploring.',
};

export function createRealCaseAdapter(deps = {}) {
  const session = deps.session ?? defaultSession;
  const readLocalSave = deps.readLocalSave ?? introJournal().read;
  const store = createAdapterStore({session, readLocalSave});
  const api = deps.api ?? createApi({session, fetchImpl: deps.fetchImpl});
  const publicApi = deps.publicApi ?? createApi({
    session: {getToken: () => null, clearToken() {}}, fetchImpl: deps.fetchImpl,
  });
  const ctx = {
    store, state: store.state, api, publicApi, session, readLocalSave, on: deps.on ?? busOn,
    now: typeof deps.clock === 'function' ? deps.clock : deps.clock?.now?.bind(deps.clock) ?? Date.now,
    random: deps.random ?? Math.random,
    document: deps.document ?? globalThis.document, window: deps.window ?? globalThis.window,
    accept: (message = '') => ({accepted: true, reason: null, message}),
    refuse: reason => ({accepted: false, reason, message: messages[reason] ?? messages.invalid_request}),
  };
  ctx.auth = deps.auth ?? createLazyAuth({session, redirect: deps.redirect,
    supabaseUrl: deps.supabaseUrl, publishableKey: deps.publishableKey, fetchImpl: deps.authFetch});
  const initialAuth = ctx.auth.read?.() ?? null;
  const initialState = ['signing_in', 'error', 'expired'].includes(initialAuth?.state)
    ? initialAuth.state : store.state.accountState;
  store.commit({auth: initialAuth, accountState: initialState, signInAllowed: import.meta.env.DEV});
  ctx.transport = createAdapterTransport(ctx);
  ctx.saves = createAccountSaves(ctx);
  const accountLifecycle = createAccountLifecycle(ctx);
  ctx.writeDeviceReplay = data => {
    try {
      (deps.writeLocalSave ?? introJournal().write)(JSON.stringify({version: 1, actions: data.actions}));
    } catch { /* The validated cloud copy still remains available when device storage is blocked. */ }
  };
  ctx.onDeleted = () => {
    ctx.saves.clearDevice();
    try { (deps.clearLocalSave ?? (() => introJournal().write('')))(); } catch { /* Best-effort device cleanup. */ }
  };
  let privateTask = null;
  let signingOut = false;
  let authIntentGeneration = 0;
  async function hydrate() {
    if (!session.isSignedIn() || store.isClosed() || ctx.document?.hidden) return;
    const epoch = store.scope();
    if (privateTask?.epoch === epoch) return privateTask.promise;
    const task = {epoch, promise: null};
    task.promise = (async () => {
      const result = await ctx.transport.read('me');
      if (result.mapped.accepted && store.isCurrent(epoch)) {
        await initializeAccountName(ctx);
        if (!store.isCurrent(epoch)) return;
        await Promise.all([ctx.transport.read('save'), ctx.transport.read('crew')]);
        if (!store.isCurrent(epoch)) return;
        accountLifecycle.reconcile();
        await refreshAccountRewards(ctx);
      }
    })();
    privateTask = task;
    try { await task.promise; } finally { if (privateTask === task) privateTask = null; }
  }
  ctx.signOut = async () => {
    authIntentGeneration += 1;
    signingOut = true;
    store.invalidate();
    const authTask = ctx.auth.signOut?.();
    session.clearToken();
    ctx.transport.clearPending();
    store.commit({accountState: 'signed_out', me: null, profile: null, crew: null,
      nameReply: null, cloudSave: null, rewardsRows: [], continuation: null});
    try { await authTask; } finally { signingOut = false; }
    return ctx.accept('You are signed out. Your local intro is kept.');
  };
  const stopSession = session.onChange(({signedIn}) => {
    if (store.isClosed() || signingOut) return;
    store.invalidate();
    if (signedIn) {
      ctx.transport.clearPending();
      store.commit({accountState:'signed_in',me:null,profile:null,crew:null,nameReply:null,
        cloudSave:null,rewardsRows:[],continuation:null});
      void hydrate();
    } else {
      authIntentGeneration += 1;
      ctx.transport.clearPending();
      store.commit({accountState:'expired',me:null,profile:null,crew:null,nameReply:null,
        cloudSave:null,rewardsRows:[],continuation:null,joinPreview:null});
    }
  });
  const stopAuth = ctx.auth.subscribe?.(next => {
    if (store.isClosed() || signingOut) return;
    const patch = {auth: next};
    if (['signing_in', 'error', 'expired'].includes(next.state)) patch.accountState = next.state;
    store.commit(patch);
  });
  let restoreTask = null;
  ctx.onConfigReady = async () => {
    const enabled = import.meta.env.DEV || ctx.state.config?.flags?.sign_in === true;
    store.commit({signInAllowed: enabled});
    if (enabled && !restoreTask) restoreTask = Promise.resolve(ctx.auth.restore?.()).catch(() => {});
    if (restoreTask) await restoreTask;
    if (!ctx.state.me) await hydrate();
  };
  const polling = createAdapterPolling(ctx);
  const boot = Promise.resolve().then(async () => {
    if (store.isClosed()) return;
    await polling.start();
  }).catch(() => { if (!store.isClosed()) store.commit({notice: ctx.refuse('not_connected')}); });
  const handlers = {...createProfileHandlers(ctx), ...createCrewHandlers(ctx), signOut: ctx.signOut};
  handlers.signIn = async () => {
    if (session.isSignedIn()) return ctx.accept('You are already signed in.');
    if (!import.meta.env.DEV && ctx.state.config?.flags?.sign_in !== true) return ctx.refuse('feature_off');
    if (!ctx.auth.signIn) return ctx.refuse('not_connected');
    const intent = ++authIntentGeneration;
    const current = () => !store.isClosed() && intent === authIntentGeneration;
    store.commit({accountState: 'signing_in'});
    const result = await ctx.auth.signIn();
    if (!current()) return ctx.refuse(store.isClosed() ? 'disposed' : 'session_expired');
    if (!result?.ok) {
      store.commit({accountState: 'error', auth: ctx.auth.read?.() ?? null});
      return {...ctx.refuse('not_connected'), message: result?.message || messages.not_connected};
    }
    await hydrate();
    if (!current()) return ctx.refuse(store.isClosed() ? 'disposed' : 'session_expired');
    return ctx.accept('Sign-in is ready.');
  };
  async function dispatch(name, args) {
    if (store.isClosed()) return store.answer(ctx.refuse('disposed'));
    const invalid = validateIntent(name, args);
    if (invalid) return store.answer(invalid);
    if (name === 'signOut' || (name === 'continueGame' && !session.isSignedIn())) {
      try { return store.answer(await handlers[name](...args)); }
      catch { return store.answer(ctx.refuse('invalid_request')); }
    }
    if (name === 'completeIntro' && !session.isSignedIn()) {
      const result = await ctx.saves.stageReplay({kind:'intro',actions:[...args[0].actions],place:'lighthouse_isle'});
      if (result.accepted && !session.isSignedIn()) store.commit({saveState:'saved'});
      return store.answer(ctx.refuse('sign_in_required'));
    }
    await boot;
    if (store.isClosed()) return store.answer(ctx.refuse('disposed'));
    if (!['continueGame', 'signIn', 'signOut'].includes(name) && !session.isSignedIn()) {
      return store.answer(ctx.refuse('sign_in_required'));
    }
    try {
      const result = handlers[name] ? await handlers[name](...args) : ctx.refuse('feature_off');
      return store.answer(result);
    } catch { return store.answer(ctx.refuse('invalid_request')); }
  }
  return bindCaseMethods({
    read: store.read, subscribe: store.subscribe, tick() {},
    dispose() {
      if (store.isClosed()) return;
      authIntentGeneration += 1;
      store.dispose();
      polling.dispose();
      accountLifecycle.dispose();
      ctx.saves.dispose();
      stopSession();
      ctx.transport.clearPending();
      stopAuth?.();
      ctx.auth.dispose?.();
    },
  }, dispatch);
}
