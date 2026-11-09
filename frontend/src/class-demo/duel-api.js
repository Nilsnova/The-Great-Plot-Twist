// The duel shortcut's calls: a friendly named challenge, the answer, one duel's detail, the list and a
// decline, all through the game's api.js (Lantern Duels routes, docs/INTERFACES.md). Plain data back.
// Used by: duel-overlay.js and index.js. Tested with a fake fetch in tests/class-demo-api.test.js.
import {friendlyChallenge} from './duel-shortcut.js';

const duelPath = id => `/api/duels/${encodeURIComponent(id)}`;

export function createDuelApi({api}) {
  return {
    challenge: ({opponentName, signals, actionUid}) => api.post('/api/duels', friendlyChallenge({opponentName, signals, actionUid})),
    answer: ({id, signals, actionUid}) => api.post(`${duelPath(id)}/move`, {signals: [...signals], actionUid}),
    decline: id => api.post(`${duelPath(id)}/cancel`),
    detail: id => api.get(duelPath(id)),
    list: () => api.get('/api/duels'),
  };
}

// A named friendly challenge for me that is still open, from GET /api/duels.
export function pendingInvite(list, seen = new Set()) {
  return (list?.incoming ?? []).find(duel => duel?.id && duel.stake === 0 && duel.canAnswer === true && !seen.has(duel.id)) ?? null;
}
