// One pending stake belongs to one signed-in session. Unknown answers retain the exact UID/body.
// No outcome, payout or pool arithmetic is decided here; only the server can accept an intent.
import { makeActionUid } from '../market/uid.js';

export function createSportsActions({ adapter, getToken = () => null, makeUid = makeActionUid }) {
  let account = null, pending = null, busy = false, version = 0;
  function sync() {
    const next = getToken() || null;
    if (next !== account) { account = next; pending = null; busy = false; version++; }
    return account;
  }
  async function run(kind, body) {
    if (!sync()) return { ok: false, status: 401, message: 'Sign in to use your play coins.' };
    if (busy) return { ok: false, code: 'busy', message: 'Waiting for the server…' };
    if (pending && kind !== 'stake') return { ok: false, code: 'pending', message: 'Resolve your pending stake first.' };
    if (kind === 'stake') pending ??= Object.freeze({ fixtureId: body.fixtureId, pick: body.pick,
      amount: body.amount, stakeId: makeUid() });
    const current = version;
    busy = true;
    let reply;
    try { reply = await adapter[kind](kind === 'stake' ? pending : body); }
    catch { reply = { ok: false, unknown: true, message: 'The server did not answer.' }; }
    sync();
    if (current !== version) return { ok: false, code: 'session_changed', message: 'Your sign-in changed. Refresh your stakes.' };
    busy = false;
    if (kind === 'stake' && reply.ok && ['fixtureId', 'pick', 'amount'].some(key => reply.data?.[key] !== pending[key])) {
      reply = { ok: false, unknown: true, message: 'The server answer did not match your stake. Retry the same reference.' };
    }
    if (kind === 'stake' && (reply.ok || (!reply.unknown && reply.status !== 429))) pending = null;
    return reply;
  }
  return {
    stake: draft => run('stake', draft), settle: fixtureId => run('settle', { fixtureId }),
    get pending() { sync(); return pending; }, get busy() { sync(); return busy; },
    sync, dispose() { pending = null; busy = false; version++; },
  };
}
