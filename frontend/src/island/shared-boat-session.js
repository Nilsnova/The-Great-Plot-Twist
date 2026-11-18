// Durable actor-scoped original boat operations. Storage holds identities and scores, never tokens.
import {makeActionUid} from '../screens/islet/action-uid.js';
import {boatOrigin, sameBoatOrigin} from './shared-boat-shapes.js';
const PREFIX = 'plot_twist_shared_boat_v1:';
const keepForRetry = answer => answer?.status === 0 || answer?.status === 429 || answer?.status >= 500 || answer?.code === 'wave_running';
const failed = (code, message) => ({ok: false, status: 409, code, message});
const uid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value) && !/^(fx_|sys_)/.test(value);

export function createBoatRoundSession({api, getEconomy, getActorId, storage, makeUid = makeActionUid, lock = globalThis.navigator?.locks} = {}) {
  let active = null, finishing = false, tail = Promise.resolve();
  const serial = work => {
    const run = () => lock?.request ? lock.request(`${PREFIX}${getActorId?.()}`, work) : work();
    const result = tail.then(run); tail = result.catch(() => {}); return result;
  };
  const key = record => `${PREFIX}${record.actorId}:${record.startUid}`;
  function save(record) {
    try { if (!storage) throw new Error('storage'); storage.setItem(key(record), JSON.stringify(record)); return true; } catch { return false; }
  }
  function remove(record) { try { storage.removeItem(key(record)); } catch { /* An original UID may replay again safely. */ } }
  function records(actor) {
    const result = [];
    try {
      for (let i = 0; i < storage.length; i++) {
        const name = storage.key(i);
        if (!name?.startsWith(`${PREFIX}${actor}:`)) continue;
        const record = JSON.parse(storage.getItem(name));
        if (record?.actorId !== actor || !uid(record.startUid) || !uid(record.claimUid) || !boatOrigin(record.origin) || !['start', 'playing', 'claim'].includes(record.phase) || !['dash', 'broadside'].includes(record.game)) continue;
        if (record.phase === 'claim' && (!uid(record.claimUid) || !Number.isInteger(record.stars) || record.stars < 0 || record.stars > 3 || typeof record.round?.id !== 'string')) continue;
        result.push(record);
      }
    } catch { return null; }
    return result;
  }
  async function sendClaim(record) {
    if (getActorId?.() !== record.actorId) return failed('session_expired', 'Sign in with the player who started this round.');
    const answer = await api.claim({roundId: record.round.id, economy: record.origin, actorId: record.actorId, stars: record.stars, actionUid: record.claimUid});
    if (answer.ok || !keepForRetry(answer)) remove(record);
    if (answer.ok && active?.startUid === record.startUid) active = null;
    return answer;
  }
  async function recoverClaims(actor) {
    const saved = records(actor);
    if (!saved) return failed('storage_unavailable', 'Boat retry storage is unavailable.');
    let last = {ok: true, status: 200, data: null};
    for (const record of saved.filter(item => item.phase === 'claim')) {
      last = await sendClaim(record);
      if (!last.ok) return last;
    }
    return last;
  }
  return {
    recover: () => serial(() => recoverClaims(getActorId?.())),
    begin: game => serial(async () => {
      const actorId = getActorId?.(), origin = boatOrigin(getEconomy?.());
      if (!actorId || !origin) return failed('economy_context_required', 'Read the current island treasury before sailing.');
      const recovered = await recoverClaims(actorId);
      if (!recovered.ok) return recovered;
      const saved = records(actorId);
      if (!saved) return failed('storage_unavailable', 'Boat retry storage is unavailable.');
      let record = saved.find(item => item.game === game && item.phase !== 'claim' && sameBoatOrigin(item.origin, origin));
      if (!record) record = {actorId, origin, game, startUid: makeUid(), claimUid: makeUid(), phase: 'start'};
      if (!save(record)) return failed('storage_unavailable', 'Enable local storage so this round can be retried safely.');
      if (record.phase === 'start') {
        const answer = await api.start({game, economy: record.origin, actorId, actionUid: record.startUid});
        if (!answer.ok) { if (!keepForRetry(answer)) remove(record); return answer; }
        record = {...record, phase: 'playing', round: answer.data.receipt.result.round};
        if (!save(record)) return failed('storage_unavailable', 'Keep this page open until retry storage is available.');
      }
      if (getActorId?.() !== actorId || !sameBoatOrigin(getEconomy?.(), record.origin)) return failed('economy_epoch_mismatch', 'The island context changed while starting this round.');
      active = record;
      return {ok: true, status: 200, data: {round: record.round, origin: record.origin}};
    }),
    finish: stars => {
      finishing = true;
      return serial(async () => {
      if (!active) return failed('no_such_round', 'Start a boat round before submitting its score.');
      try {
        const latest = JSON.parse(storage.getItem(key(active)));
        if (latest?.phase === 'claim' && latest.startUid === active.startUid) active = latest;
      } catch { return failed('storage_unavailable', 'Read the saved score before retrying.'); }
      if (!Number.isInteger(stars) || stars < 0 || stars > 3) return failed('bad_stars', 'A boat score is zero to three stars.');
      if (active.phase === 'claim' && active.stars !== stars) return failed('idempotency_conflict', 'Retry the original score for this round.');
      if (active.phase !== 'claim') active = {...active, phase: 'claim', stars};
      if (!save(active)) return failed('storage_unavailable', 'The score was not sent because retry storage is unavailable.');
      return sendClaim(active);
      }).finally(() => { finishing = false; });
    },
    cancel() {
      if (finishing || active?.phase !== 'playing') return;
      try {
        const latest = JSON.parse(storage.getItem(key(active)));
        if (latest?.phase === 'claim') { active = latest; return; }
      } catch { return; }
      remove(active); active = null;
    },
  };
}
