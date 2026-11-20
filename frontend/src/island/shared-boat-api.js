// Authenticated shared boat calls; no client-selected coins, account payer or fallback path.
import {ECONOMY_CAPABILITY_HEADERS} from '../online/api.js';
import {boatIntent, boatOrigin, isBoatStatus, readBoatReceipt, sameBoatOrigin} from './shared-boat-shapes.js';

const failure = (code, message, status = 409) => ({ok: false, status, code, message});
export function createSharedBoatApi({transport, getEconomy, onEconomy = () => {}} = {}) {
  const options = {headers: ECONOMY_CAPABILITY_HEADERS};
  async function ask(send, accept) {
    let reply;
    try { reply = await send(); } catch { return failure('network_error', 'No connection. Retry this boat operation.', 0); }
    if (!reply?.ok) return reply ?? failure('network_error', 'No connection. Retry this boat operation.', 0);
    return accept(reply.data) ? reply : failure('unreadable', 'The boat reply could not be verified. Retry the same operation.', 502);
  }
  return {
    status: ({code = null} = {}) => ask(() => transport.get(`/api/island/boat${code ? `?code=${encodeURIComponent(code)}` : ''}`, options), isBoatStatus),
    start({game, economy, actorId, actionUid}) {
      const origin = boatOrigin(economy);
      if (!origin) return Promise.resolve(failure('economy_context_required', 'Read the island treasury before sailing.'));
      return ask(() => transport.post('/api/island/boat/start', {economy: boatIntent(origin), game, actionUid}, options),
        data => !!readBoatReceipt(data, {action: 'boat:start', actionUid, actorId, origin, game}));
    },
    async claim({roundId, economy, actorId, stars, actionUid}) {
      const origin = boatOrigin(economy);
      if (!origin) return failure('economy_context_required', 'This round needs its original island context.');
      const reply = await ask(() => transport.post('/api/island/boat/claim', {economy: boatIntent(origin), roundId, stars, actionUid}, options),
        data => !!readBoatReceipt(data, {action: 'boat:claim', actionUid, actorId, origin, roundId, stars}));
      if (reply.ok && reply.data.currentEconomy && sameBoatOrigin(getEconomy?.(), origin)) onEconomy(reply.data.currentEconomy, origin);
      return reply;
    },
  };
}
