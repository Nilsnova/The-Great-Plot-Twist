// The real schema-1 adapter owns network state: account, sign-in, live presence and the islet engine.
// Its factory returns before background reads finish. The case left the browser on 10 Nov (D031).
import {createApi} from '../api.js';
import {session as defaultSession} from '../session.js';
import {createLazyAuth} from '../lazy-auth.js';
import {on as busOn} from '../../core/events.js';
import {bindAdapterMethods} from '../../adapter/contract.js';
import {createAdapterStore} from './store.js';
import {createAdapterTransport} from './transport.js';
import {createAdapterPolling} from './polling.js';
import {createReadMonitor} from './read-monitor.js';
import {createProfileHandlers, initializeAccountName} from './profile.js';
import {createLiveLifecycle} from './live-lifecycle.js';
import {createIsletLifecycle} from './islet-lifecycle.js';
import {createPanelWallet} from './panel-wallet.js';
import {registerPanelServices} from '../panel-services.js';
import {validateIntent} from './validate.js';
import {newActionUid} from '../../screens/duels/logic.js';

const messages = {
  disposed: 'This client has closed.',
  invalid_request: 'Check this action and try again.',
  sign_in_required: 'Sign in to play online. You can keep exploring on this device.',
  session_expired: 'Sign in again to keep playing online.',
  feature_off: 'This feature opens later. You can keep exploring.',
  not_connected: 'Service unavailable. Try again in a moment.',
  not_ready: 'This part is not ready yet. You can keep exploring.',
  demo_closed: 'Guest play needs the class code from the presenter. You can keep playing on this device.',
  class_code_invalid: 'This class code is not valid. Ask the presenter for the current code.',
  class_code_needed: 'Type the class code from the projector, for example HARBOR-K7QXM.',
};

export function createRealAdapter(deps = {}) {
  const session = deps.session ?? defaultSession;
  const store = createAdapterStore({session});
  const api = deps.api ?? createApi({session, fetchImpl: deps.fetchImpl});
  const publicApi = deps.publicApi ?? createApi({
    session: {getToken: () => null, clearToken() {}}, fetchImpl: deps.fetchImpl,
  });
  const ctx = {
    store, state: store.state, api, publicApi, session, on: deps.on ?? busOn,
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
  const panelWallet = createPanelWallet(ctx);
  let panelServices = null;
  const islet = createIsletLifecycle(ctx, {loadIslet: deps.loadIslet,
    isDemo: deps.isDemo ?? (() => new URLSearchParams(ctx.window?.location?.search ?? '').get('demo') === '1')});
  const resetIslet = () => {
    islet.reset();
    panelServices?.invalidate();
  };
  const live = createLiveLifecycle(ctx, deps);
  ctx.onDeleted = () => {
    resetIslet();
    live.reset();
  };
  let privateTask = null;
  let hydratedScope = null;
  let signingOut = false;
  let authIntentGeneration = 0;
  // While a new guest presents the class code, the gated reads wait: guestSignIn reads after the join.
  let guestJoining = false;
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
        live.refresh();
        if (store.isCurrent(epoch)) hydratedScope = epoch;
      }
    })();
    privateTask = task;
    try { await task.promise; } finally { if (privateTask === task) privateTask = null; }
  }
  ctx.waitForSetup = async () => {
    const task = privateTask;
    if (task?.epoch === store.scope()) await task.promise;
  };
  // Wallet reads wait for existing setup first. A recovered initial me read can then finish setup.
  ctx.onMeRefreshed = async () => {
    const epoch = store.scope();
    const setup = privateTask?.epoch === epoch ? privateTask : null;
    if (setup) await setup.promise;
    if (!store.isCurrent(epoch) || !session.isSignedIn()) return {setupHandled: false};
    if (hydratedScope === epoch) return {setupHandled: setup !== null};
    await hydrate({automatic: true, meAlreadyRead: true});
    return {setupHandled: store.isCurrent(epoch) && hydratedScope === epoch};
  };
  ctx.retryRead = async kind => {
    const scope = store.scope();
    const result = await ctx.transport.read(kind, {automatic: true});
    if (kind === 'me' && result.mapped.accepted && store.isCurrent(scope)) await hydrate({automatic:true,meAlreadyRead:true});
    return result;
  };
  ctx.signOut = async () => {
    authIntentGeneration += 1;
    ctx.readMonitor.reset();
    signingOut = true;
    store.invalidate();
    resetIslet();
    live.reset();
    const authTask = ctx.auth.signOut?.();
    session.clearToken();
    ctx.transport.clearPending();
    store.commit({accountState: 'signed_out', auth: ctx.auth.read?.() ?? null,
      me: null, nameReply: null, nameStatus: null});
    try { await authTask; } finally { signingOut = false; }
    return ctx.accept('You are signed out.');
  };
  const stopSession = session.onChange(({signedIn}) => {
    if (store.isClosed() || signingOut) return;
    ctx.readMonitor.reset();
    store.invalidate();
    resetIslet();
    live.reset();
    if (signedIn) {
      ctx.transport.clearPending();
      store.commit({accountState:'signed_in',me:null,nameReply:null,nameStatus:null});
      if (!guestJoining) void hydrate();
    } else {
      authIntentGeneration += 1;
      ctx.transport.clearPending();
      store.commit({accountState:'expired',me:null,nameReply:null,nameStatus:null});
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
    // Guest play by class code also restores a guest's session after a reload.
    if ((enabled || ctx.state.config?.demo?.guestsByCode === true) && !restoreTask) restoreTask = Promise.resolve(ctx.auth.restore?.()).catch(() => {});
    if (restoreTask) await restoreTask;
    if (!ctx.state.me) await hydrate();
    live.refresh();
  };
  const polling = createAdapterPolling(ctx);
  ctx.refreshConfig = polling.refresh;
  const boot = Promise.resolve().then(async () => {
    if (store.isClosed()) return;
    await polling.start();
  }).catch(() => { if (!store.isClosed()) store.commit({notice: ctx.refuse('not_connected')}); });
  const handlers = {...createProfileHandlers(ctx), signOut: ctx.signOut,
    reportPosition: live.presence.reportPosition, setEmote: live.presence.setEmote};
  // signIn() and signIn({provider}) start OAuth; {upgrade: true} links a provider to a guest;
  // {guest: true, code} is the guest start with a class code (Join page, projector QR), allowed only
  // while /api/config says demo.guestsByCode; the server checks the code (POST /api/demo/join).
  // {provider: 'email', email[, code][, upgrade]} sends or checks a 6-digit email code.
  handlers.signIn = async (options = {}) => {
    const provider = options.provider ?? 'github';
    if (options.guest === true) return guestSignIn(options.code);
    if (provider === 'email') return emailSignIn(options);
    if (options.upgrade === true) return upgradeGuest(provider);
    if (session.isSignedIn()) {
      const scope=store.scope();
      await hydrate();
      if(!store.isCurrent(scope))return ctx.refuse('session_expired');
      return ctx.state.nameStatus==='unavailable'?ctx.refuse('not_connected'):ctx.accept('Your account is ready.');
    }
    if (!import.meta.env.DEV && ctx.state.config?.flags?.sign_in !== true) return ctx.refuse('feature_off');
    if (!ctx.auth.signIn) return ctx.refuse('not_connected');
    if (!configProviders().includes(provider)) return ctx.refuse('invalid_request');
    return startAuth(() => ctx.auth.signIn(provider), 'Sign-in is ready.');
  };
  async function startAuth(begin, done) {
    const intent = ++authIntentGeneration;
    const current = () => !store.isClosed() && intent === authIntentGeneration;
    store.commit({accountState: 'signing_in'});
    const result = await begin();
    if (!current()) return ctx.refuse(store.isClosed() ? 'disposed' : 'session_expired');
    if (!result?.ok) {
      store.commit({accountState: 'error', auth: ctx.auth.read?.() ?? null});
      return {...ctx.refuse('not_connected'), message: result?.message || messages.not_connected};
    }
    await hydrate();
    if (!current()) return ctx.refuse(store.isClosed() ? 'disposed' : 'session_expired');
    return ctx.accept(done);
  }
  function configProviders() {
    const list = ctx.state.config?.auth?.providers;
    const known = Array.isArray(list) ? list.filter(name => ['github', 'email'].includes(name)) : [];
    return known.length ? known : ['github'];
  }
  // Fixed texts for the email code steps; the auth layer reports a reason, never SDK text. Reasons
  // stay outside the transport-failure set (adapter/call-failure.js), so these texts reach the form.
  const emailAnswers = {
    sent: [true, 'Code sent. Check your inbox and spam folder.'],
    confirm_sent: [true, 'Code sent. Check your inbox and spam folder. Your progress stays with this captain.'],
    signed_in: [true, 'You are signed in.'],
    confirmed: [true, 'Email confirmed. Your progress is kept.'],
    rate_limited: ['too_many_tries', 'Too many requests. Wait a minute, then try again.'],
    wrong_code: ['wrong_code', 'That code is wrong or has expired. Check it, or send a new code.'],
    no_code: ['wrong_code', 'Send a code to this email first.'],
    invalid_email: ['invalid_request', 'Enter your full email address.'],
    email_taken: ['invalid_request', 'This email already has an account. To use it, sign out and sign in with that email. Guest progress is not moved.'],
    email_off: ['not_ready', 'Email sign-in is not switched on yet. Use GitHub for now.'],
    not_allowed: ['invalid_request', 'Check this action and try again.'],
  };
  function emailAnswer(key) {
    const [outcome, message] = emailAnswers[key] ?? ['not_connected', 'Email sign-in could not finish. Try again in a moment.'];
    return outcome === true ? ctx.accept(message) : {...ctx.refuse(outcome), message};
  }
  async function emailSignIn({email, code, upgrade}) {
    if (!import.meta.env.DEV && ctx.state.config?.flags?.sign_in !== true) return ctx.refuse('feature_off');
    if (!configProviders().includes('email')) return ctx.refuse('invalid_request');
    const asGuest = upgrade === true;
    if (asGuest && (!session.isSignedIn() || ctx.auth.read?.()?.guest !== true)) return ctx.refuse('invalid_request');
    if (!asGuest && session.isSignedIn()) return ctx.accept('Your account is ready.');
    if (!ctx.auth.sendEmailCode || !ctx.auth.verifyEmailCode) return ctx.refuse('not_connected');
    const intent = ++authIntentGeneration;
    const current = () => !store.isClosed() && intent === authIntentGeneration;
    const result = code === undefined ? await ctx.auth.sendEmailCode(email, {upgrade: asGuest})
      : await ctx.auth.verifyEmailCode(email, code);
    if (!current()) return ctx.refuse(store.isClosed() ? 'disposed' : 'session_expired');
    if (!result?.ok) return emailAnswer(result?.reason);
    if (code === undefined) return emailAnswer(asGuest ? 'confirm_sent' : 'sent');
    store.commit({auth: ctx.auth.read?.() ?? null});
    await hydrate();
    if (!current()) return ctx.refuse(store.isClosed() ? 'disposed' : 'session_expired');
    return emailAnswer(result.reason === 'confirmed' ? 'confirmed' : 'signed_in');
  }
  // A guest needs the class code: sign in anonymously (or keep the guest session), then present the
  // code. A wrong code keeps the anonymous session, so the player can type the code again.
  async function guestSignIn(code) {
    if (typeof code !== 'string' || !code.trim()) {
      return session.isSignedIn() ? ctx.accept('Your account is ready.') : ctx.refuse('class_code_needed');
    }
    if (ctx.state.config?.demo?.guestsByCode !== true) return ctx.refuse('demo_closed');
    const intent = ++authIntentGeneration;
    const current = () => !store.isClosed() && intent === authIntentGeneration;
    if (!session.isSignedIn()) {
      if (!ctx.auth.signInAnonymously) return ctx.refuse('not_connected');
      guestJoining = true;
      let result;
      try { result = await ctx.auth.signInAnonymously(); } catch { result = null; } finally { guestJoining = false; }
      if (!current()) return ctx.refuse(store.isClosed() ? 'disposed' : 'session_expired');
      if (!result?.ok) {
        store.commit({accountState: 'signed_out', auth: ctx.auth.read?.() ?? null});
        return ctx.refuse('not_connected');
      }
    }
    const reply = await ctx.api.post('/api/demo/join', {code, actionUid: newActionUid()});
    if (!current()) return ctx.refuse(store.isClosed() ? 'disposed' : 'session_expired');
    if (!reply.ok || reply.data?.admitted !== true) {
      if (reply.status === 403 && reply.code === 'class_code_invalid') return ctx.refuse('class_code_invalid');
      if (reply.status === 403 && reply.code === 'demo_closed') return ctx.refuse('demo_closed');
      if (reply.status === 429) return {...ctx.refuse('rate_limited'), message: reply.message || 'Too many tries. Wait a few minutes, then try again.'};
      return ctx.refuse('not_connected');
    }
    await hydrate();
    if (!current()) return ctx.refuse(store.isClosed() ? 'disposed' : 'session_expired');
    return ctx.accept(ctx.auth.read?.()?.guest === true ? 'You are playing as a guest.' : 'You joined the class harbor.');
  }
  async function upgradeGuest(provider) {
    if (!session.isSignedIn() || ctx.auth.read?.()?.guest !== true) return ctx.refuse('invalid_request');
    if (!ctx.auth.upgrade || !configProviders().includes(provider)) return ctx.refuse('invalid_request');
    return startAuth(() => ctx.auth.upgrade(provider), 'Your progress is kept.');
  }
  function cosmeticReceipt(result) {
    const {recovery, ...publicResult} = result;
    return {...publicResult, view: store.read()};
  }
  async function dispatch(name, args) {
    const answer = name === 'reportPosition' || name === 'setEmote' ? cosmeticReceipt : store.answer;
    if (store.isClosed()) return answer(ctx.refuse('disposed'));
    const invalid = validateIntent(name, args);
    if (invalid) return answer(invalid);
    if (name === 'signOut') {
      try { return answer(await handlers[name](...args)); }
      catch { return answer(ctx.refuse('invalid_request')); }
    }
    await boot;
    if (store.isClosed()) return answer(ctx.refuse('disposed'));
    if (!['signIn', 'signOut'].includes(name) && !session.isSignedIn()) {
      return answer(ctx.refuse('sign_in_required'));
    }
    try {
      const result = handlers[name] ? await handlers[name](...args) : ctx.refuse('feature_off');
      if (result.accepted && name === 'rerollName') live.refresh();
      return answer(result);
    } catch { return answer(ctx.refuse('invalid_request')); }
  }
  return bindAdapterMethods({
    read: store.read, subscribe: store.subscribe, tick() { live.tick(); },
    dispose() {
      if (store.isClosed()) return;
      authIntentGeneration += 1;
      store.dispose();
      panelWallet.dispose();
      islet.dispose();
      panelServices.dispose();
      live.dispose();
      polling.dispose();
      ctx.readMonitor.dispose();
      stopSession();
      ctx.transport.clearPending();
      stopAuth?.();
      ctx.auth.dispose?.();
    },
  }, dispatch);
}
