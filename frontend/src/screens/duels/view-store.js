// The one view both adapters hand to the panel: the server's lists, the coins, one open duel for
// the reveal, a notice and a revision number. It only holds and copies data. The panel gets
// copies, so it can never change what an adapter holds, and a change is published only when
// something really differs, so a quiet poll does not redraw the screen.
// Used by: http-adapter.js and fake-adapter.js.
import { DEFAULT_RULES } from './logic.js';
import { messageFor } from './messages.js';

const CLOCK_SLACK_MS = 5000; // the server clock and the device clock differ by less than this: ignore it

export function createViewStore(first = {}) {
  let revision = 0, noticeId = 0, listSignature = '', disposed = false;
  const listeners = new Set();
  const view = {
    mode: 'loading', revision, rules: DEFAULT_RULES, coins: null, heldCoins: 0,
    incoming: [], openChallenges: [], yours: [], recent: [],
    selected: null, sealed: {}, serverOffsetMs: 0, polling: 'off', notice: null, canRetry: false,
    ...first,
  };

  const read = () => structuredClone(view);

  function publish() {
    view.revision = ++revision;
    for (const listener of [...listeners]) listener(read());
  }

  // Changes only the named fields, and publishes only if one of them really differs.
  function set(patch) {
    if(disposed)return false;
    const differs = Object.keys(patch).some(key => JSON.stringify(view[key]) !== JSON.stringify(patch[key]));
    if (!differs) return false;
    Object.assign(view, structuredClone(patch));
    publish();
    return true;
  }

  // Takes an answer of GET /api/duels. Tells the caller whether the lists changed, and which of the
  // challenges this player was waiting on have just been decided.
  function applyList(data, { nowMs, mode }) {
    if(disposed)return {changed:false,decided:[]};
    const waitingBefore = view.yours.map(duel => duel.id);
    const lists = [data.coins, data.heldCoins, data.incoming, data.openChallenges, data.yours, data.recent];
    const changed = JSON.stringify(lists) !== listSignature;
    listSignature = JSON.stringify(lists);
    const offset = Date.parse(data.serverTime) - nowMs;
    set({
      mode, rules: { ...DEFAULT_RULES, ...data.rules }, coins: data.coins, heldCoins: data.heldCoins,
      incoming: data.incoming, openChallenges: data.openChallenges, yours: data.yours, recent: data.recent,
      serverOffsetMs: Math.abs(offset - view.serverOffsetMs) > CLOCK_SLACK_MS ? offset : view.serverOffsetMs,
    });
    const decided = data.recent.filter(duel => waitingBefore.includes(duel.id) && duel.status === 'finished');
    return { changed, decided };
  }

  // One duel in full (for the reveal). Remembers the player's own sealed signals for the cards.
  function showDetail(detail) {
    if(disposed||!detail||typeof detail!=='object')return;
    const sealed = detail.yourSignals ? { ...view.sealed, [detail.id]: detail.yourSignals } : view.sealed;
    set({ selected: detail, sealed });
  }

  // Shows a sentence for a code. A code with no sentence (already_applied) shows nothing.
  function notify(code, extra = {}) {
    const message = extra.message ?? messageFor(code);
    if (message) set({ notice: { id: ++noticeId, code, message, ...extra } });
  }

  // With a list of codes, clears the notice only if it is one of them (a failure that has passed).
  function clearNotice(codes) {
    if (!view.notice || (codes && !codes.includes(view.notice.code))) return;
    set({ notice: null });
  }

  return {
    read, set, applyList, showDetail, notify, clearNotice,
    reset(mode='signed_out'){
      listSignature='';set({mode,rules:DEFAULT_RULES,coins:null,heldCoins:0,incoming:[],openChallenges:[],
        yours:[],recent:[],selected:null,sealed:{},serverOffsetMs:0,notice:null,canRetry:false});
    },
    subscribe(listener) {
      if(disposed)return ()=>{};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() { listeners.clear();listSignature='';Object.assign(view,{mode:'signed_out',coins:null,heldCoins:0,
      incoming:[],openChallenges:[],yours:[],recent:[],selected:null,sealed:{},notice:null,canRetry:false,polling:'off'});disposed=true; },
  };
}
