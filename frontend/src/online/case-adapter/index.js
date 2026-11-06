// The real schema-1 adapter owns network state. Its factory returns before background reads finish.
import {createApi} from '../api.js';
import {session as defaultSession} from '../session.js';
import {bindCaseMethods} from '../../adapter/contract.js';
import {createAdapterStore} from './store.js';
import {createAdapterTransport} from './transport.js';
import {createAdapterPolling} from './polling.js';
import {createProfileHandlers} from './profile.js';
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
  const store = createAdapterStore({session, readLocalSave: deps.readLocalSave ?? introJournal().read});
  const api = deps.api ?? createApi({session, fetchImpl: deps.fetchImpl});
  const publicApi = deps.publicApi ?? createApi({
    session: {getToken: () => null, clearToken() {}}, fetchImpl: deps.fetchImpl,
  });
  const ctx = {
    store, state: store.state, api, publicApi, session,
    now: typeof deps.clock === 'function' ? deps.clock : deps.clock?.now?.bind(deps.clock) ?? Date.now,
    random: deps.random ?? Math.random,
    document: deps.document ?? globalThis.document, window: deps.window ?? globalThis.window,
    accept: (message = '') => ({accepted: true, reason: null, message}),
    refuse: reason => ({accepted: false, reason, message: messages[reason] ?? messages.invalid_request}),
  };
  ctx.transport = createAdapterTransport(ctx);
  let privateTask = null;
  let signingOut = false;
  async function hydrate() {
    if (!session.isSignedIn() || store.isClosed() || ctx.document?.hidden) return;
    const epoch = store.scope();
    if (privateTask?.epoch === epoch) return privateTask.promise;
    const task = {epoch, promise: null};
    task.promise = (async () => {
      const result = await ctx.transport.read('me');
      if (result.mapped.accepted && !store.isClosed()) {
        await Promise.all([ctx.transport.read('save'), ctx.transport.read('crew')]);
      }
    })();
    privateTask = task;
    try { await task.promise; } finally { if (privateTask === task) privateTask = null; }
  }
  ctx.signOut = async () => {
    signingOut = true;
    store.invalidate();
    session.clearToken();
    ctx.transport.clearPending();
    store.commit({accountState: 'signed_out', me: null, profile: null, crew: null,
      nameReply: null, cloudSave: null, rewardsRows: [], continuation: null});
    try { await deps.auth?.signOut?.(); } finally { signingOut = false; }
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
    } else store.commit({accountState:'expired'});
  });
  ctx.onConfigReady = () => !ctx.state.me ? hydrate() : undefined;
  const polling = createAdapterPolling(ctx);
  const boot = Promise.resolve().then(async () => {
    if (store.isClosed()) return;
    await polling.start();
  }).catch(() => { if (!store.isClosed()) store.commit({notice: ctx.refuse('not_connected')}); });
  const handlers = {...createProfileHandlers(ctx), ...createCrewHandlers(ctx), signOut: ctx.signOut};
  handlers.signIn = async () => {
    if (session.isSignedIn()) return ctx.accept('You are already signed in.');
    if (!import.meta.env.DEV && ctx.state.config?.flags?.sign_in !== true) return ctx.refuse('feature_off');
    if (!deps.auth?.signIn) return ctx.refuse('not_connected');
    store.commit({accountState: 'signing_in'});
    const result = await deps.auth.signIn();
    if (!result?.ok) { store.commit({accountState: 'error'}); return ctx.refuse('not_connected'); }
    await hydrate();
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
      store.dispose();
      polling.dispose();
      stopSession();
      ctx.transport.clearPending();
      deps.auth?.dispose?.();
    },
  }, dispatch);
}
