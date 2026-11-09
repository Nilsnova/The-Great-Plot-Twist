// Lazy OAuth PKCE (GitHub), email codes, guest (anonymous) sign-in and tab-scoped SDK sessions feed
// only the access token into A2's memory session. A guest upgrade links GitHub or confirms an email
// on the same user, so the player id and its progress stay.
import {session as defaultSession} from './session.js';
import {AUTH_STORAGE_KEY, createAuthStorage} from './auth-storage.js';
import {AUTH_MESSAGES, authConfiguration, signInAddress, ownReturnAddress,
  validAuthCode, guardAuthStorage, normalEmail, validEmailCode, emailFailure} from './auth-state.js';

const SIGN_OUT_TIMEOUT_MS = 10000;
// OAuth redirect providers. Email codes use sendEmailCode and verifyEmailCode instead.
export const AUTH_PROVIDERS = ['github'];
async function finishSdkSignOut(record) {
  if (!record) return;
  let timer;
  const deadline = new Promise(resolve => {
    record.cancelSignOut = resolve;
    timer = setTimeout(resolve, SIGN_OUT_TIMEOUT_MS);
    timer?.unref?.();
  });
  try { await Promise.race([record.client.auth.signOut({scope: 'local'}), deadline]); }
  catch { /* Local sign-out is already complete even when the server is unavailable. */ }
  finally { clearTimeout(timer); record.cancelSignOut = null; }
}

export function createAuth({session = defaultSession, storage = createAuthStorage(),
  createClient, loadClient = () => import('@supabase/supabase-js'),
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL,
  publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  redirect = url => globalThis.location.assign(url), href = () => globalThis.location?.href,
  fetchImpl, onState = () => {}, now = Date.now,
  randomId = () => crypto.randomUUID()} = {}) {
  const configuration = authConfiguration(supabaseUrl, publishableKey);
  let state = session.isSignedIn() ? 'signed_in' : 'signed_out';
  let message = AUTH_MESSAGES[state], closed = false, epoch = 0, expiresAt = null, playerId = null, guest = false;
  let current = null, loading = null, signInTask = null, returnTask = null, refreshTask = null, signOutTask = null, guestTask = null;
  let leaving = null, emailTask = null, pendingEmail = null;
  let clearing = false, returnEpoch = null;
  const subscribers = new Set();
  const stopRenewal = session.setRenewal?.(() => renew());
  const stopSession = session.onChange(({signedIn}) => {
    if (!signedIn && !clearing && !closed) expire();
  });
  const read = () => ({state, message, configured: !!configuration, ...(guest && state === 'signed_in' ? {guest: true} : {})});
  const answer = ok => ({ok, ...read()});
  const isCurrent = token => !closed && token === epoch;

  function publish(next, text = AUTH_MESSAGES[next]) {
    if (closed) return;
    state = next; message = text;
    try { onState(read()); } catch { /* Screens cannot interrupt the auth lifecycle. */ }
    for (const listener of subscribers) {
      try { listener(read()); } catch { /* Isolate presentation observers. */ }
    }
  }
  function release(record) {
    if (!record || record.released) return;
    record.released = true;
    record.storage.close();
    try { record.subscription?.unsubscribe(); } catch { /* Already stopped. */ }
    try { Promise.resolve(record.client.auth.dispose?.()).catch(() => {}); } catch { /* Already stopped. */ }
  }
  function clearMemory() {
    clearing = true;
    try { session.clearToken(); } finally { clearing = false; }
  }
  function expire() {
    epoch += 1; pendingEmail = null;
    release(current); current = null; loading = null;
    signInTask = null; refreshTask = null;
    storage.clearSession(); expiresAt = null; playerId = null; guest = false;
    clearMemory(); publish('expired');
  }
  function applySession(value, token) {
    if (!isCurrent(token) || typeof value?.access_token !== 'string' || !value.access_token.trim()) return false;
    expiresAt = Number.isFinite(value.expires_at) ? value.expires_at * 1000 : null;
    playerId = typeof value.user?.id === 'string' ? value.user.id : null;
    guest = value.user?.is_anonymous === true;
    session.setToken(value.access_token);
    publish('signed_in');
    return true;
  }
  async function clientFor(token) {
    if (!isCurrent(token)) return null;
    if (current) return current.client;
    if (loading) return loading;
    loading = (async () => {
      const make = createClient ?? (await loadClient()).createClient;
      if (!isCurrent(token)) return null;
      // Each SDK gets a private broadcast channel; stable mapped keys still survive this tab's reload.
      const sdkKey = `${AUTH_STORAGE_KEY}-${randomId()}`;
      const guarded = guardAuthStorage(storage, sdkKey, AUTH_STORAGE_KEY);
      const options = {auth: {flowType: 'pkce', storageKey: sdkKey,
        storage: guarded, persistSession: true, autoRefreshToken: true,
        detectSessionInUrl: false, debug: false}};
      if (fetchImpl) options.global = {fetch: fetchImpl};
      const client = make(configuration.url, configuration.key, options);
      const record = {client, storage: guarded, subscription: null};
      if (!isCurrent(token)) { release(record); return null; }
      current = record;
      record.subscription = client.auth.onAuthStateChange((event, value) => {
        if (!isCurrent(token)) return;
        if (event === 'SIGNED_OUT') {
          if (session.isSignedIn()) expire();
          else if (state !== 'signing_in') publish('signed_out');
        } else if (value) applySession(value, token);
      }).data.subscription;
      return client;
    })();
    try { return await loading; } finally { if (isCurrent(token)) loading = null; }
  }
  function unavailable() {
    if (closed) return {ok: false, ...read(), message: AUTH_MESSAGES.disposed};
    if (configuration) return null;
    publish('error', AUTH_MESSAGES.not_setup);
    return answer(false);
  }
  async function restore() {
    if (signOutTask) await signOutTask;
    const missing = unavailable(); if (missing) return missing;
    if (returnTask && returnEpoch === epoch) return returnTask;
    const token = epoch;
    try {
      const client = await clientFor(token); if (!client) return answer(false);
      const result = await client.auth.getSession();
      if (!isCurrent(token)) return answer(false);
      if (result.error) { expire(); return answer(false); }
      if (applySession(result.data?.session, token)) return answer(true);
      if (session.isSignedIn()) expire(); else publish('signed_out');
      return answer(true);
    } catch {
      if (isCurrent(token)) { if (session.isSignedIn()) expire(); else publish('error'); }
      return answer(false);
    }
  }
  async function beginSignIn(provider = 'github', upgrade = false) {
    if (signOutTask) await signOutTask;
    const missing = unavailable(); if (missing) return missing;
    if (!storage.canKeepVerifier()) { publish('error', AUTH_MESSAGES.storage); return answer(false); }
    const redirectTo = ownReturnAddress(href);
    if (!redirectTo) { publish('error'); return answer(false); }
    const token = epoch; publish('signing_in');
    try {
      const client = await clientFor(token); if (!client) return answer(false);
      const options = {provider, options: {redirectTo, skipBrowserRedirect: true}};
      // A guest keeps the same user id: linkIdentity attaches the provider through the same PKCE return.
      const result = upgrade ? await client.auth.linkIdentity(options) : await client.auth.signInWithOAuth(options);
      if (!isCurrent(token)) return answer(false);
      const address = !result.error && signInAddress(result.data?.url, configuration, {provider, upgrade});
      if (!address || !storage.canKeepVerifier()) {
        storage.clearVerifiers(); publish('error', address ? AUTH_MESSAGES.storage : AUTH_MESSAGES.error);
        return answer(false);
      }
      redirect(address);
      return answer(true);
    } catch {
      if (isCurrent(token)) { storage.clearVerifiers(); publish('error'); }
      return answer(false);
    }
  }
  function signIn(provider = 'github') {
    if (!AUTH_PROVIDERS.includes(provider)) return Promise.resolve({...answer(false), message: AUTH_MESSAGES.error});
    if (session.isSignedIn() && !closed) return Promise.resolve(answer(true));
    if (!signInTask) {
      const task = beginSignIn(provider).finally(() => { if (signInTask === task) signInTask = null; });
      signInTask = task;
    }
    return signInTask;
  }
  // Keep a guest's progress: link a provider to the anonymous user. Refused for any other session.
  function upgrade(provider = 'github') {
    if (!AUTH_PROVIDERS.includes(provider) || closed || !guest || !session.isSignedIn()) {
      return Promise.resolve(answer(false));
    }
    if (!signInTask) {
      const task = beginSignIn(provider, true).finally(() => { if (signInTask === task) signInTask = null; });
      signInTask = task;
    }
    return signInTask;
  }
  async function beginGuest() {
    if (signOutTask) await signOutTask;
    const missing = unavailable(); if (missing) return missing;
    if (session.isSignedIn()) return answer(true);
    const token = epoch; publish('signing_in');
    try {
      const client = await clientFor(token); if (!client) return answer(false);
      const result = await client.auth.signInAnonymously();
      if (!isCurrent(token)) return answer(false);
      if (!result?.error && applySession(result.data?.session, token)) return answer(true);
      publish('signed_out', AUTH_MESSAGES.signed_out); return answer(false);
    } catch {
      if (isCurrent(token)) publish('signed_out', AUTH_MESSAGES.signed_out);
      return answer(false);
    }
  }
  // Guest play: an anonymous Supabase user. The server decides whether guests may play right now.
  function signInAnonymously() {
    if (session.isSignedIn() && !closed) return Promise.resolve(answer(true));
    guestTask ??= beginGuest().finally(() => { guestTask = null; });
    return guestTask;
  }
  // Email code, step 1. A visitor gets a sign-in code (signInWithOtp, a new address makes a new
  // account). A guest gets a confirmation code for the address (updateUser), so the same user id
  // keeps its progress. No redirect: the player types the code into this tab.
  async function beginEmailCode(email, upgrade) {
    if (signOutTask) await signOutTask;
    const missing = unavailable(); if (missing) return missing;
    const refused = reason => ({...answer(false), reason});
    if (upgrade ? !guest || !session.isSignedIn() : session.isSignedIn()) return refused('not_allowed');
    const token = epoch;
    try {
      const client = await clientFor(token); if (!client) return refused('error');
      const result = upgrade ? await client.auth.updateUser({email})
        : await client.auth.signInWithOtp({email, options: {shouldCreateUser: true}});
      if (!isCurrent(token)) return refused('error');
      if (result?.error) { storage.clearVerifiers(); return refused(emailFailure(result.error, 'send')); }
      pendingEmail = {email, type: upgrade ? 'email_change' : 'email', epoch: token};
      return {...answer(true), reason: 'sent'};
    } catch {
      if (isCurrent(token)) storage.clearVerifiers();
      return refused('error');
    }
  }
  function sendEmailCode(value, {upgrade = false} = {}) {
    const email = normalEmail(value);
    if (!email) return Promise.resolve({...answer(false), reason: 'invalid_email'});
    if (closed) return Promise.resolve({...answer(false), reason: 'error', message: AUTH_MESSAGES.disposed});
    if (!emailTask) {
      const task = beginEmailCode(email, upgrade === true).finally(() => { if (emailTask === task) emailTask = null; });
      emailTask = task;
    }
    return emailTask;
  }
  // Email code, step 2: verifyOtp with the type step 1 used. A visitor signs in; a guest's address
  // is confirmed and the next token says is_anonymous false.
  async function finishEmailCode(email, code) {
    const missing = unavailable(); if (missing) return missing;
    const refused = reason => ({...answer(false), reason});
    const pending = pendingEmail;
    if (!pending || pending.epoch !== epoch || pending.email !== email) return refused('no_code');
    const token = epoch;
    try {
      const client = await clientFor(token); if (!client) return refused('error');
      const reply = await client.auth.verifyOtp({email, token: code, type: pending.type});
      if (!isCurrent(token)) return refused('error');
      if (reply?.error) return refused(emailFailure(reply.error, 'verify'));
      let value = reply?.data?.session;
      if (!value?.access_token && pending.type === 'email_change') {
        const renewed = await client.auth.refreshSession();
        if (!isCurrent(token)) return refused('error');
        value = renewed?.error ? null : renewed?.data?.session;
      }
      if (!applySession(value, token)) return refused('error');
      if (pendingEmail === pending) pendingEmail = null;
      storage.clearVerifiers();
      return {...answer(true), reason: pending.type === 'email_change' ? 'confirmed' : 'signed_in'};
    } catch { return refused('error'); }
  }
  function verifyEmailCode(value, code) {
    const email = normalEmail(value);
    if (!email || !validEmailCode(code)) return Promise.resolve({...answer(false), reason: 'wrong_code'});
    if (closed) return Promise.resolve({...answer(false), reason: 'error', message: AUTH_MESSAGES.disposed});
    if (!emailTask) {
      const task = finishEmailCode(email, code).finally(() => { if (emailTask === task) emailTask = null; });
      emailTask = task;
    }
    return emailTask;
  }
  async function exchange(result) {
    const missing = unavailable(); if (missing) { storage.clearVerifiers(); return missing; }
    if (!validAuthCode(result)) { storage.clearVerifiers(); publish('error'); return answer(false); }
    const token = epoch; publish('signing_in');
    try {
      const client = await clientFor(token); if (!client) return answer(false);
      const options = result.flowId ? {flowId: result.flowId} : undefined;
      const reply = await client.auth.exchangeCodeForSession(result.code, options);
      if (!isCurrent(token)) return answer(false);
      if (!reply.error && applySession(reply.data?.session, token)) return answer(true);
      publish('error'); return answer(false);
    } catch {
      if (isCurrent(token)) publish('error');
      return answer(false);
    } finally { if (isCurrent(token)) storage.clearVerifiers(); }
  }
  function handleReturn(result) {
    if (!returnTask) { returnEpoch = epoch; returnTask = exchange(result); }
    return returnTask;
  }
  async function refresh() {
    const missing = unavailable(); if (missing) return missing;
    if (signOutTask || !session.isSignedIn()) return answer(false);
    const token = epoch;
    try {
      const client = await clientFor(token); if (!client) return answer(false);
      const result = await client.auth.refreshSession();
      if (!isCurrent(token)) return answer(false);
      if (!result.error && applySession(result.data?.session, token)) return answer(true);
      expire(); return answer(false);
    } catch { if (isCurrent(token)) expire(); return answer(false); }
  }
  function renew() {
    if (!refreshTask) {
      const task = refresh().finally(() => { if (refreshTask === task) refreshTask = null; });
      refreshTask = task;
    }
    return refreshTask;
  }
  async function getAccessToken() {
    if (closed || !session.isSignedIn()) return null;
    if (expiresAt !== null && expiresAt <= now() + 30000 && !(await renew()).ok) return null;
    return closed ? null : session.getToken();
  }
  async function leave() {
    if (closed) return unavailable();
    epoch += 1; const record = current;
    current = null; loading = null; expiresAt = null; playerId = null; guest = false;
    signInTask = null; refreshTask = null; emailTask = null; pendingEmail = null;
    try { record?.subscription?.unsubscribe(); } catch { /* Local sign-out still completes. */ }
    record?.storage.detach();
    storage.clearSession();
    clearMemory(); publish('signed_out');
    leaving = record;
    await finishSdkSignOut(record);
    release(record);
    if (leaving === record) leaving = null;
    return answer(true);
  }
  function signOut() {
    signOutTask ??= leave().finally(() => { signOutTask = null; });
    return signOutTask;
  }
  async function ownRead(makeQuery, project, empty) {
    const failed = (status = 0) => ({ok: false, status, ...empty});
    if (closed || !configuration || !session.isSignedIn() || signOutTask) return failed();
    const token = epoch;
    try {
      const client = await clientFor(token); if (!client) return failed();
      const reply = await makeQuery(client);
      if (!isCurrent(token)) return failed();
      if (reply?.error || !Array.isArray(reply?.data)) {
        const status = Number.isInteger(reply?.status) && reply.status >= 400 && reply.status <= 599
          ? reply.status : 0;
        return failed(status);
      }
      return project(reply.data);
    } catch { return failed(); }
  }
  function readOwnLedger() {
    if (!playerId) return Promise.resolve({ok: false, status: 0, rows: []});
    return ownRead(client => client.from('wallet_transactions').select('delta,reason,created_at')
      .eq('player_id', playerId).order('created_at', {ascending: false}).limit(50),
    rows => ({ok: true, rows: rows.slice(0, 50).filter(row => Number.isSafeInteger(row.delta)
      && typeof row.reason === 'string' && /^[a-z_]+$/.test(row.reason)).map(row => ({
      amount: row.delta, reason: row.reason, created_at: typeof row.created_at === 'string' ? row.created_at : null,
    }))}), {rows: []});
  }
  function readCrewMemberIds(crewId) {
    if (typeof crewId !== 'string' || !/^[a-f0-9-]{36}$/i.test(crewId)) return Promise.resolve({ok: false, ids: []});
    return ownRead(client => client.from('crew_seats').select('player_id').eq('crew_id', crewId).limit(4),
      rows => ({ok: true, ids: [...new Set(rows.slice(0, 4).map(row => row.player_id)
        .filter(id => typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id)))]}), {ids: []});
  }
  function readCrewSeats(crewId) {
    const uuid = value => typeof value === 'string'
      && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
    const failed = () => ({ok: false, status: 0, seats: []});
    if (!uuid(crewId)) return Promise.resolve(failed());
    return ownRead(client => client.from('crew_seats').select('player_id,seat_no')
      .eq('crew_id', crewId).limit(4), rows => {
      if (rows.length > 4) return failed();
      const seats = [], players = new Set(), numbers = new Set();
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)
          || !Number.isInteger(row.seat_no) || row.seat_no < 1 || row.seat_no > 4
          || numbers.has(row.seat_no)) return failed();
        numbers.add(row.seat_no);
        if (row.player_id === null) continue;
        if (!uuid(row.player_id)) return failed();
        const playerId = row.player_id.toLowerCase();
        if (players.has(playerId)) return failed();
        players.add(playerId);
        seats.push({playerId, seatNo: row.seat_no});
      }
      return {ok: true, seats};
    }, {seats: []});
  }
  function subscribe(listener) {
    if (closed || typeof listener !== 'function') return () => {};
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }
  function dispose() {
    if (closed) return;
    closed = true; epoch += 1;
    leaving?.cancelSignOut?.(); release(leaving); leaving = null;
    release(current); current = null; loading = null;
    stopRenewal?.(); stopSession(); subscribers.clear();
    storage.close({clear: false}); clearMemory();
  }
  return {read, subscribe, signIn, upgrade, signInAnonymously, sendEmailCode, verifyEmailCode,
    handleReturn, restore, renew, getAccessToken,
    signOut, readOwnLedger, readCrewMemberIds, readCrewSeats, dispose};
}
