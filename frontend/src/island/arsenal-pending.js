// Durable original shared intent, used by the arsenal API. Never stores tokens or credentials.
import {arsenalOrigin, isArsenalId, sameArsenalOrigin} from './arsenal-shared-state.js';

export function defaultArsenalPendingStore() {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

export function pendingArsenalIntent(store, actor, economy, kind, body, makeUid) {
  if (!store || !isArsenalId(actor)) return null;
  const origin = arsenalOrigin(economy), resource = kind === 'buy' ? body.weapon : `${body.copy}:${body.holderGeneration}`;
  const key = `plot_twist_arsenal_v1:${actor}:${origin.islandOwner}:${origin.accountId}:${origin.runEpoch}:${kind}:${resource}`;
  try {
    const saved = store.getItem(key);
    if (saved !== null) {
      const record = JSON.parse(saved), original = {...record.body}; delete original.actionUid;
      if (record.actor !== actor || !sameArsenalOrigin(record.origin, origin) || JSON.stringify(original) !== JSON.stringify(body)
        || !/^[A-Za-z0-9_-]{8,64}$/.test(record.body?.actionUid ?? '') || /^(fx_|sys_)/.test(record.body.actionUid)) return null;
      return {key, body: record.body, origin};
    }
    const payload = {...body, actionUid: makeUid()}, serialized = JSON.stringify({actor, origin, body: payload});
    store.setItem(key, serialized);
    return store.getItem(key) === serialized ? {key, body: payload, origin} : null;
  } catch { return null; }
}
