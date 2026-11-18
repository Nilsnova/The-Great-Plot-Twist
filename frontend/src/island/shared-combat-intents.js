// Durable actor/account/run-scoped repair intents. Stores no credentials or payment authority.
import {isSharedRepairQuote, isRootAction} from './shared-combat-receipts.js';
import {sameRepairOrigin} from './shared-combat-funds.js';

export function repairIntentKey(actor, origin, instance) {
  return `plot_twist_shared_repair_v1:${actor}:${origin.accountId}:${origin.runEpoch}:${instance}`;
}

export function savedRepairIntent(store, key, actor, origin, instance, makeBody) {
  if (!store || !['getItem', 'setItem', 'removeItem'].every(method => typeof store[method] === 'function')) {
    throw new Error('Repair retry storage is unavailable.');
  }
  const raw = store.getItem(key);
  if (raw !== null) {
    const saved = JSON.parse(raw);
    if (saved?.actor !== actor || !sameRepairOrigin(saved.origin, origin)
        || !isSharedRepairQuote(saved.body) || saved.body.instanceId !== instance || !isRootAction(saved.body.actionUid)
        || saved.body.economy?.mode !== origin.mode || saved.body.economy?.version !== origin.version
        || saved.body.economy?.islandOwner !== origin.islandOwner || saved.body.economy?.runEpoch !== origin.runEpoch) {
      throw new Error('The saved repair request could not be read.');
    }
    return saved.body;
  }
  const body = makeBody();
  if (!isSharedRepairQuote(body) || !isRootAction(body.actionUid)) throw new Error('The repair request is invalid.');
  const stored = JSON.stringify({actor, origin, body});
  store.setItem(key, stored);
  return JSON.parse(stored).body;
}
