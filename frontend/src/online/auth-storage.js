// SDK storage owns one namespace; PKCE always stays in this tab, independent of session persistence.
export const AUTH_STORAGE_MODE = 'session';
export const AUTH_STORAGE_KEY = 'plot-twist-auth-v1';
const mainKey = AUTH_STORAGE_KEY;
const userKey = `${mainKey}-user`;
const probeKey = `${mainKey}-storage-probe`;
const verifierKey = name => typeof name === 'string' && name.startsWith(`${mainKey}-`)
  && name.endsWith('-code-verifier');
const ownedKey = name => name === mainKey || name === userKey || verifierKey(name);

export function createAuthStorage({mode = AUTH_STORAGE_MODE,
  sessionStorage = () => globalThis.sessionStorage,
  localStorage = () => globalThis.localStorage} = {}) {
  const memory = new Map();
  const known = new Set([mainKey, userKey, `${mainKey}-code-verifier`, `${mainKey}-flows-code-verifier`, probeKey]);
  const failed = new Set();
  const sources = {session: sessionStorage, local: localStorage};
  const selected = ['memory', 'session', 'local'].includes(mode) ? mode : AUTH_STORAGE_MODE;
  let closed = false;
  const target = name => verifierKey(name) ? 'session' : selected;

  function backend(kind, cleanup = false) {
    if (kind === 'memory' || (!cleanup && failed.has(kind))) return null;
    try {
      const store = sources[kind]();
      if (!store) failed.add(kind);
      return store ?? null;
    } catch { failed.add(kind); return null; }
  }

  function getItem(name) {
    if (closed || !ownedKey(name)) return null;
    known.add(name);
    const kind = target(name);
    const store = backend(kind);
    if (store) {
      try {
        const value = store.getItem(name);
        if (typeof value === 'string') memory.set(name, value);
        else memory.delete(name);
      } catch { failed.add(kind); }
    }
    return memory.get(name) ?? null;
  }

  function setItem(name, value) {
    if (closed || !ownedKey(name) || typeof value !== 'string') return;
    known.add(name);
    memory.set(name, value);
    const kind = target(name);
    const store = backend(kind);
    if (!store) return;
    try { store.setItem(name, value); } catch { failed.add(kind); }
  }

  function removeItem(name) {
    if (closed || !ownedKey(name)) return;
    memory.delete(name);
    const kind = target(name);
    const store = backend(kind, true);
    if (!store) return;
    try { store.removeItem(name); } catch { failed.add(kind); }
  }

  function namesIn(store, kind) {
    const names = new Set(known);
    try {
      const count = store.length;
      for (let index = 0; index < count; index += 1) {
        const name = store.key(index);
        if (typeof name === 'string') names.add(name);
      }
    } catch { failed.add(kind); }
    return names;
  }

  function clearMatching(matches) {
    for (const name of memory.keys()) if (matches(name)) memory.delete(name);
    for (const kind of ['session', 'local']) {
      const store = backend(kind, true);
      if (!store) continue;
      for (const name of namesIn(store, kind)) {
        if (!matches(name)) continue;
        try { store.removeItem(name); } catch { failed.add(kind); }
      }
    }
  }

  function canKeepVerifier() {
    if (closed || failed.has('session')) return false;
    const store = backend('session');
    if (!store) return false;
    try {
      store.setItem(probeKey, 'available');
      const kept = store.getItem(probeKey) === 'available';
      store.removeItem(probeKey);
      if (!kept) failed.add('session');
      return kept;
    } catch {
      failed.add('session');
      try { store.removeItem(probeKey); } catch { /* A blocked store may retain only this nonsecret probe. */ }
      return false;
    }
  }

  const clearVerifiers = () => clearMatching(verifierKey);
  const clearSession = () => clearMatching(name => ownedKey(name) || name === probeKey);
  function close({clear = true} = {}) {
    if (closed) return;
    closed = true;
    if (clear) clearSession();
    else memory.clear();
  }
  return {getItem, setItem, removeItem, clearVerifiers, canKeepVerifier, clearSession, close};
}
