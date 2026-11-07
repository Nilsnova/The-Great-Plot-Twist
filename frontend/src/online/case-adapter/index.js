// The real schema-1 adapter owns network state. Its factory returns before background reads finish.
import {createApi} from '../api.js';
import {session as defaultSession} from '../session.js';
import {createLazyAuth} from '../lazy-auth.js';
import {on as busOn} from '../../core/events.js';
import {bindCaseMethods} from '../../adapter/contract.js';
import {createAdapterStore} from './store.js';
import {createAdapterTransport} from './transport.js';
import {createAdapterPolling} from './polling.js';
import {createReadMonitor} from './read-monitor.js';
import {createProfileHandlers, initializeAccountName} from './profile.js';
import {createAccountSaves, replaySaveData} from './saves.js';
import {createAccountLifecycle} from './account-lifecycle.js';
import {refreshAccountRewards} from './rewards.js';
import {createCrewHandlers} from './crew.js';
import {createCrewLifecycle} from './crew-lifecycle.js';
import {createLiveLifecycle} from './live-lifecycle.js';
import {createIsletLifecycle} from './islet-lifecycle.js';
import {createPanelWallet} from './panel-wallet.js';
import {registerPanelServices} from '../panel-services.js';
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
  ctx.readMonitor = createReadMonitor(ctx);
  ctx.transport = createAdapterTransport(ctx);
  ctx.saves = createAccountSaves(ctx);
  ctx.saves.pauseIdentity();
  const panelWallet = createPanelWallet(ctx);
  let panelServices = null;
  const islet = createIsletLifecycle(ctx, {loadIslet: deps.loadIslet,
    isDemo: deps.isDemo ?? (() => new URLSearchParams(ctx.window?.location?.search ?? '').get('demo') === '1')});
  const resetIslet = () => {
    store.commit({isletFailure: null});
    islet.reset();
    panelServices?.invalidate();
  };
  ctx.onIsletFailure = failure => {
    if (!store.isClosed()) store.commit({isletFailure: {...failure}});
  };
  const crewLife = createCrewLifecycle(ctx, deps);
  ctx.crewLife = crewLife;
  const live = createLiveLifecycle(ctx, deps);
  const accountLifecycle = createAccountLifecycle(ctx);
  ctx.writeDeviceReplay = data => {
    try {
      (deps.writeLocalSave ?? introJournal().write)(JSON.stringify({version: 1, actions: data.actions}));
    } catch { /* The validated cloud copy still remains available when device storage is blocked. */ }
  };
  ctx.onDeleted = () => {
    resetIslet();
    live.reset();
    crewLife.refresh();
    ctx.saves.clearDevice();
    try { (deps.clearLocalSave ?? (() => introJournal().write('')))(); } catch { /* Best-effort device cleanup. */ }
  };
  let privateTask = null;
  let hydratedScope = null;
  let signingOut = false;
  let authIntentGeneration = 0;
  const deviceSaveState = () => replaySaveData(ctx.state.deviceSave?.data) ? 'saved' : 'idle';
  async function hydrate({automatic = false, meAlreadyRead = false} = {}) {
    if (!session.isSignedIn() || store.isClosed() || ctx.document?.hidden) return;
    const epoch = store.scope();
    if (privateTask?.epoch === epoch) return privateTask.promise;
    const task = {epoch, promise: null};
    task.promise = (async () => {
      const result = meAlreadyRead ? {mapped:{accepted:true}} : await ctx.transport.read('me', {automatic});
      if (result.mapped.accepted && store.isCurrent(epoch)) {
        await initializeAccountName(ctx);
        if (!store.isCurrent(epoch)) return;
        const [saved] = await Promise.all([ctx.transport.read('save'), ctx.transport.read('crew')]);
        if (!store.isCurrent(epoch)) return;
        if (saved.mapped.accepted) accountLifecycle.reconcile();
        await refreshAccountRewards(ctx);
        crewLife.refresh();
        live.refresh();
        if (store.isCurrent(epoch)) hydratedScope = epoch;
      }
    })();
    privateTask = task;
    try { await task.promise; } finally { if (privateTask === task) privateTask = null; }
  }
  ctx.waitForSave = async () => {
    const task = privateTask;
    if (task?.epoch === store.scope()) await task.promise;
  };
  // Wallet reads wait for existing setup first. A recovered initial me read can then finish setup.
  ctx.onMeRefreshed = async () => {
    const epoch = store.scope();
    const setup = privateTask?.epoch === epoch ? privateTask : null;
    if (setup) await setup.promise;
    if (!store.isCurrent(epoch) || !session.isSignedIn()) return {ledgerHandled: false};
    if (hydratedScope === epoch) return {ledgerHandled: setup !== null};
    await hydrate({automatic: true, meAlreadyRead: true});
    return {ledgerHandled: store.isCurrent(epoch) && hydratedScope === epoch};
  };
  ctx.retryRead = async kind => {
    const scope = store.scope();
    const result = await ctx.transport.read(kind, {automatic: true});
    if (kind === 'me' && result.mapped.accepted && store.isCurrent(scope)) await hydrate({automatic:true,meAlreadyRead:true});
    if (kind === 'save' && result.mapped.accepted && store.isCurrent(scope)) accountLifecycle.reconcile();
    return result;
  };
  ctx.signOut = async () => {
    authIntentGeneration += 1;
    ctx.readMonitor.reset();
    signingOut = true;
    store.invalidate();
    resetIslet();
    live.reset();
    ctx.saves.pauseIdentity();
    const authTask = ctx.auth.signOut?.();
    session.clearToken();
    ctx.transport.clearPending();
    store.commit({accountState: 'signed_out', auth: ctx.auth.read?.() ?? null,
      me: null, profile: null, crew: null, joinPreview: null, saveState: deviceSaveState(),
      nameReply: null, nameStatus: null, cloudSave: null, rewardsRows: [], rewardsStatus: null, continuation: null});
    try { await authTask; } finally { signingOut = false; }
    return ctx.accept('You are signed out. Your local intro is kept.');
  };
  const stopSession = session.onChange(({signedIn}) => {
    if (store.isClosed() || signingOut) return;
    ctx.readMonitor.reset();
    store.invalidate();
    resetIslet();
    live.reset();
    ctx.saves.pauseIdentity();
    if (signedIn) {
      ctx.transport.clearPending();
      store.commit({accountState:'signed_in',me:null,profile:null,crew:null,joinPreview:null,
        saveState:deviceSaveState(),nameReply:null,nameStatus:null,
        cloudSave:null,rewardsRows:[],rewardsStatus:null,continuation:null});
      void hydrate();
    } else {
      authIntentGeneration += 1;
      ctx.transport.clearPending();
      store.commit({accountState:'expired',me:null,profile:null,crew:null,saveState:deviceSaveState(),
        nameReply:null,nameStatus:null,
        cloudSave:null,rewardsRows:[],rewardsStatus:null,continuation:null,joinPreview:null});
    }
  });
  const stopAuth = ctx.auth.subscribe?.(next => {
    if (store.isClosed() || signingOut) return;
    const patch = {auth: next};
    if (['signing_in', 'error', 'expired'].includes(next.state)) patch.accountState = next.state;
    store.commit(patch);
  });
  panelServices = registerPanelServices(session, {api: panelWallet.api, publicApi,
    getFlags: () => ctx.state.config?.flags ?? {},
    isReady: () => !store.isClosed() && ctx.state.config !== null,
    getIdentity: () => store.scope(), getIslet: islet.getAdapter});
  let restoreTask = null;
  ctx.onConfigReady = async () => {
    panelServices.refresh();
    live.refresh();
    const enabled = import.meta.env.DEV || ctx.state.config?.flags?.sign_in === true;
    store.commit({signInAllowed: enabled});
    if (enabled && !restoreTask) restoreTask = Promise.resolve(ctx.auth.restore?.()).catch(() => {});
    if (restoreTask) await restoreTask;
    if (!ctx.state.me) await hydrate();
    crewLife.refresh();
    live.refresh();
  };
  const polling = createAdapterPolling(ctx);
  ctx.refreshConfig = polling.refresh;
  const boot = Promise.resolve().then(async () => {
    if (store.isClosed()) return;
    await polling.start();
  }).catch(() => { if (!store.isClosed()) store.commit({notice: ctx.refuse('not_connected')}); });
  const handlers = {...createProfileHandlers(ctx), ...createCrewHandlers(ctx), signOut: ctx.signOut,
    reportPosition: live.presence.reportPosition, setEmote: live.presence.setEmote,
    async buildLight(id) {
      const scope = store.scope();
      store.commit({isletFailure: null});
      const result = await islet.buildLight(id);
      if (store.isCurrent(scope) && result.accepted) store.commit({isletFailure: null});
      return result;
    }};
  handlers.signIn = async () => {
    if (session.isSignedIn()) {
      const scope=store.scope();
      await hydrate();
      if(!store.isCurrent(scope))return ctx.refuse('session_expired');
      return ctx.state.nameStatus==='unavailable'?ctx.refuse('not_connected'):ctx.accept('Your account is ready.');
    }
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
  function cosmeticReceipt(result) {
    const {recovery, ...publicResult} = result;
    return {...publicResult, view: store.read()};
  }
  async function dispatch(name, args) {
    const answer = name === 'reportPosition' || name === 'setEmote' ? cosmeticReceipt : store.answer;
    if (store.isClosed()) return answer(ctx.refuse('disposed'));
    const invalid = validateIntent(name, args);
    if (invalid) return answer(invalid);
    if (name === 'signOut' || (name === 'continueGame' && !session.isSignedIn())) {
      try { return answer(await handlers[name](...args)); }
      catch { return answer(ctx.refuse('invalid_request')); }
    }
    if (name === 'completeIntro' && !session.isSignedIn()) {
      const result = await ctx.saves.stageReplay({kind:'intro',actions:[...args[0].actions],place:'lighthouse_isle'});
      if (result.accepted && !session.isSignedIn()) store.commit({saveState:'saved'});
      return answer(ctx.refuse('sign_in_required'));
    }
    await boot;
    if (store.isClosed()) return answer(ctx.refuse('disposed'));
    if (!['continueGame', 'signIn', 'signOut'].includes(name) && !session.isSignedIn()) {
      return answer(ctx.refuse('sign_in_required'));
    }
    try {
      const result = handlers[name] ? await handlers[name](...args) : ctx.refuse('feature_off');
      if (result.accepted && ['completeIntro', 'rerollName'].includes(name)) live.refresh();
      return answer(result);
    } catch { return answer(ctx.refuse('invalid_request')); }
  }
  return bindCaseMethods({
    read: store.read, subscribe: store.subscribe, tick() { live.tick(); },
    dispose() {
      if (store.isClosed()) return;
      authIntentGeneration += 1;
      store.dispose();
      panelWallet.dispose();
      islet.dispose();
      panelServices.dispose();
      live.dispose();
      crewLife.dispose();
      polling.dispose();
      ctx.readMonitor.dispose();
      accountLifecycle.dispose();
      ctx.saves.dispose();
      stopSession();
      ctx.transport.clearPending();
      stopAuth?.();
      ctx.auth.dispose?.();
    },
  }, dispatch);
}
