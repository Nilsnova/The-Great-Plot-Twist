// Deferred private capabilities. Every provider and UI owner belongs to one explicit session object.
const providers = new WeakMap(), watchers = new WeakMap(), entries = new WeakMap();
const weakKey = value => value !== null && ['object', 'function'].includes(typeof value);
const safely = (read, fallback = null) => { try { return read(); } catch { return fallback; } };
const refusal = (code = 'not_ready', status = 503) => ({ok: false, status, code,
  message: code === 'method_not_allowed' ? 'This request is not available.' : 'This part is not ready yet. You can keep exploring.'});
function callListener(listener, args) {
  try {
    const result = listener(...args);
    if (typeof result?.then === 'function') Promise.resolve(result).catch(() => {});
  } catch { /* A failed consumer cannot interrupt another private lifecycle. */ }
}

function tell(records, key, payload) {
  for (const record of [...records]) {
    if (!records.has(record)) continue;
    const next = key();
    if (Object.is(record.last, next)) continue;
    record.last = next;
    callListener(record.listener, payload(next));
  }
}
function publishProvider(session) {
  const records = watchers.get(session);
  if (records) tell(records, () => findPanelServices(session), value => [value]);
}
export function findPanelServices(session) {
  return weakKey(session) ? providers.get(session) ?? null : null;
}
export function watchPanelServices(session, listener) {
  if (!weakKey(session) || typeof listener !== 'function') return () => {};
  const records = watchers.get(session) ?? new Set();
  watchers.set(session, records);
  const record = {listener, last: findPanelServices(session)};
  records.add(record); callListener(listener, [record.last]);
  return () => { records.delete(record); if (!records.size && watchers.get(session) === records) watchers.delete(session); };
}

function readFlags(getFlags) {
  const raw = safely(() => getFlags?.(), {});
  return Object.freeze(Object.fromEntries(safely(() => Object.keys(raw ?? {}), [])
    .map(key => [key, safely(() => raw[key], false) === true])));
}
export function registerPanelServices(session, {api, publicApi, getFlags, isReady, getIdentity, getIslet: provideIslet} = {}) {
  if (!weakKey(session)) throw new TypeError('Panel services need an explicit session.');
  const subscribers = new Set(), identities = new Set(), tickets = new WeakMap(), revisions = new Map();
  let closed = false, sampling = false, lifetime = 0, version = 0, stopSession = null;
  const signedIn = () => safely(() => session.isSignedIn(), false) === true;
  const readSnapshot = () => ({ready: safely(() => isReady?.(), false) === true,
    identity: signedIn() ? safely(() => getIdentity ? getIdentity() : session.getScope()) ?? null : null,
    flags: readFlags(getFlags)});
  let snapshot = readSnapshot();
  const owned = () => !closed && providers.get(session) === lease;
  const usable = privateRead => owned() && snapshot.ready && (!privateRead || snapshot.identity !== null);
  const notify = () => {
    tell(identities, () => snapshot.identity, value => [{signedIn: value !== null}]);
    tell(subscribers, () => version, () => []);
  };
  function subscribe(records, listener, last) {
    if (closed || typeof listener !== 'function') return () => {};
    const record = {listener, last}; records.add(record);
    return () => records.delete(record);
  }
  function refresh() {
    if (!owned() || sampling) return lease;
    sampling = true;
    const next = readSnapshot(); sampling = false;
    const changedFlags = [...new Set([...Object.keys(snapshot.flags), ...Object.keys(next.flags)])]
      .filter(key => (snapshot.flags[key] === true) !== (next.flags[key] === true));
    const accountChanged = !Object.is(snapshot.identity, next.identity), readinessChanged = snapshot.ready !== next.ready;
    snapshot = next;
    if (!accountChanged && !readinessChanged && !changedFlags.length) return lease;
    if (accountChanged || readinessChanged) lifetime += 1;
    for (const feature of changedFlags) revisions.set(feature, (revisions.get(feature) ?? 0) + 1);
    version += 1; notify(); return lease;
  }
  async function invoke(client, method, path, body, privateRead) {
    refresh();
    if (!usable(privateRead)) return refusal();
    try {
      const send = client?.[method];
      if (typeof send !== 'function') return refusal();
      return await (method === 'post' ? send.call(client, path, body) : send.call(client, path));
    } catch { return refusal('unavailable'); }
  }
  const publicGet = path => invoke(publicApi, 'get', path, undefined, false);
  const request = Object.freeze({get: path => invoke(api, 'get', path, undefined, true),
    post: (path, body) => invoke(api, 'post', path, body, true), publicGet});
  function capture(feature, {privateRead = false, allowFlagOff = false} = {}) {
    refresh();
    if (typeof feature !== 'string' || !feature || !usable(privateRead === true)) return null;
    if (allowFlagOff === true && (feature !== 'market' || privateRead !== false)) return null;
    if (snapshot.flags[feature] !== true && allowFlagOff !== true) return null;
    const ticket = Object.freeze({});
    tickets.set(ticket, {feature, lifetime, identity: snapshot.identity, revision: revisions.get(feature) ?? 0,
      privateRead: privateRead === true, allowFlagOff: allowFlagOff === true});
    return ticket;
  }
  function current(ticket) {
    refresh();
    const saved = weakKey(ticket) ? tickets.get(ticket) : null;
    return !!saved && usable(saved.privateRead) && saved.lifetime === lifetime
      && Object.is(saved.identity, snapshot.identity) && saved.revision === (revisions.get(saved.feature) ?? 0)
      && (snapshot.flags[saved.feature] === true || saved.allowFlagOff);
  }
  function invalidate() {
    if (!owned()) return;
    lifetime += 1; version += 1; notify();
  }
  function dispose() {
    if (closed) return;
    closed = true; lifetime += 1; version += 1;
    snapshot = {...snapshot, ready: false, identity: null};
    safely(() => stopSession?.()); stopSession = null;
    const registered = providers.get(session) === lease;
    if (registered) providers.delete(session);
    notify(); subscribers.clear(); identities.clear();
    if (registered) publishProvider(session);
  }
  const lease = {request, publicGet,
    isReady() { refresh(); return usable(false); },
    getLifetime() { refresh(); return owned() ? lifetime : null; },
    async getIslet() {
      refresh();
      if (!usable(true) || typeof provideIslet !== 'function') return null;
      const owner = lifetime, identity = snapshot.identity;
      let adapter;
      try { adapter = await provideIslet(); } catch { return null; }
      refresh();
      return usable(true) && lifetime === owner && Object.is(snapshot.identity, identity) ? adapter : null;
    },
    getFlags: () => owned() ? {...snapshot.flags} : {},
    getIdentity: () => owned() ? snapshot.identity : null,
    getToken: () => usable(true) ? safely(() => session.getToken()) : null,
    marketRequest(path, {method = 'GET', body} = {}) {
      if (method === 'GET') return request.get(path);
      if (method === 'POST') return request.post(path, body);
      return Promise.resolve(refusal('method_not_allowed', 405));
    },
    subscribe: listener => subscribe(subscribers, listener, version),
    onIdentityChange: listener => subscribe(identities, listener, snapshot.identity),
    onSessionChange: listener => subscribe(identities, listener, snapshot.identity),
    capture, current, refresh, invalidate, dispose};
  const previous = providers.get(session);
  providers.set(session, lease); previous?.dispose();
  if (owned()) {
    const stop = safely(() => session.onChange?.(refresh));
    if (closed) safely(() => stop?.()); else stopSession = stop;
    if (owned()) refresh();
    if (owned()) publishProvider(session);
  }
  return lease;
}

// References only: the app owner, rather than this registry, closes/disposes its arena entry.
export function findPanelEntry(session, name) {
  return weakKey(session) && name === 'arena' ? entries.get(session)?.entry ?? null : null;
}
export function claimPanelEntry(session, name, factory) {
  if (!weakKey(session) || name !== 'arena' || typeof factory !== 'function') return null;
  const held = entries.get(session);
  if (held) return held.entry;
  const claim = {entry: null}; entries.set(session, claim);
  claim.entry = safely(factory);
  if (!weakKey(claim.entry)) { if (entries.get(session) === claim) entries.delete(session); return null; }
  return claim.entry;
}
export function releasePanelEntry(session, name, entry) {
  if (!weakKey(session) || name !== 'arena' || !entry || entries.get(session)?.entry !== entry) return false;
  entries.delete(session); return true;
}
