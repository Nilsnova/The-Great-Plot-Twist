// Opening and closing positions. One uid belongs to one click, so a repeat can never trade twice.
// When the outcome is not known the attempt is kept: "Send again" reuses its uid, and no new trade
// starts until it is settled. No DOM and no rules: the server decides, this only sends and explains.
// Used by: panel.js. Every result is { kind, message, refreshed } where `refreshed` settles after the lists update.
import { makeActionUid } from './uid.js';
import {safeStatus} from './call-results.js';
import { errorWords, OUTCOME_UNKNOWN, SIGN_IN_WORDS } from './words.js';
import { openedWords, closedWords, ALREADY_DONE, BLOCKED_WORDS, CHECKED_WORDS, FORGOTTEN_WORDS } from './result-words.js';

const SKIP_REFRESH = new Set(['unauthorized', 'too_many_requests']); // nothing changed, and asking more only adds load
const BUSY_WORDS = 'One moment: your last click is still being sent.';

export function createTrades({ adapter, session, makeUid = makeActionUid, now = Date.now }) {
  let pending = null, pendingRead = null; // the held attempt and its existing readback
  let busy = false;
  let identity = 0, retryAt = 0;

  const quiet = () => Promise.resolve();
  const metadata = result => safeStatus(result?.status) === undefined ? {} : {status: result.status};
  const answer = (kind, message, extra = {}) => ({ kind, message, refreshed: quiet(), ...extra });
  const retrySeconds = () => Math.max(0, Math.ceil((retryAt - now()) / 1000));
  const waiting = () => answer('rate_limited', errorWords({ code: 'too_many_requests', retryAfterSeconds: retrySeconds() }),
    { code: 'too_many_requests', status: 429, retryAfterSeconds: retrySeconds() });
  const afterwards = (outcome, which) => {
    const load = { all: session.refreshAll, portfolio: session.refreshPortfolio }[which];
    return { ...outcome, refreshed: load ? load().then(quiet, quiet) : quiet() };
  };

  // The board's company, or the position itself when the board no longer lists the company (it knows its name and price style).
  const companyOfPosition = id => {
    const position = session.portfolio?.positions.find(item => item?.id === id);
    return session.company(position?.companyId) ?? position ?? null;
  };
  const stakeTotal = intent => session.board?.rules?.stakeChoices?.find(choice => choice.stake === intent.stake)?.total;

  function settle(attempt, result, uncertain = false) {
    if (result.ok) {
      pending = null; pendingRead = null;
      const message = attempt.kind === 'open'
        ? openedWords(result.data, session.company(attempt.intent.companyId))
        : closedWords(result.data, companyOfPosition(attempt.intent.positionId));
      return afterwards({ kind: 'done', message, data: result.data }, 'all');
    }
    if (result.code === 'already_applied') {
      pending = null; pendingRead = null;
      return afterwards({ kind: 'already_done', message: ALREADY_DONE, code: result.code }, 'all');
    }
    if (result.code === 'too_many_requests' && Number.isFinite(result.retryAfterSeconds) && result.retryAfterSeconds > 0) retryAt = now() + result.retryAfterSeconds * 1000;
    if (result.code === 'outcome_unknown' || uncertain) {
      pending = attempt;
      const message = result.code === 'outcome_unknown' ? OUTCOME_UNKNOWN : errorWords(result, {total: stakeTotal(attempt.intent)});
      const outcome = afterwards({kind: 'unknown', message, code: result.code, retryAfterSeconds: result.retryAfterSeconds, ...metadata(result)},
        SKIP_REFRESH.has(result.code) ? 'none' : 'portfolio');
      pendingRead = outcome.refreshed;
      return outcome;
    }
    pending = null; pendingRead = null;
    const message = errorWords(result, { total: stakeTotal(attempt.intent) });
    const outcome = { kind: 'refused', code: result.code, message, retryAfterSeconds: result.retryAfterSeconds, ...metadata(result) };
    return afterwards(outcome, SKIP_REFRESH.has(result.code) ? 'none' : 'all');
  }

  async function attempt(kind, intent, uid, held = null) {
    const scope = identity;
    busy = true;
    let result;
    try { result = await adapter[kind](intent, { uid }); }
    catch { result = { ok: false, code: 'outcome_unknown', message: '', status: 0, retryAfterSeconds: null }; } // a throw: we cannot know what happened
    finally { if (scope === identity) busy = false; }
    if (scope !== identity) return answer('expired', SIGN_IN_WORDS);
    return settle(held ?? { kind, intent, uid }, result, held !== null);
  }

  function start(kind, intent) {
    if (busy) return Promise.resolve(answer('busy', BUSY_WORDS));
    if (retrySeconds()) return Promise.resolve(waiting());
    if (pending) return Promise.resolve(answer('blocked', BLOCKED_WORDS));
    return attempt(kind, intent, makeUid());
  }

  return {
    get pending() { return pending; },
    get busy() { return busy; },
    get retryAfterSeconds() { return retrySeconds(); },
    get retryAfterMs() { return Math.max(0, retryAt - now()); },
    resetPrivate() { identity += 1; pending = null; pendingRead = null; busy = false; retryAt = 0; },
    open: intent => start('open', intent),
    close: intent => start('close', intent),
    async sendAgain() {
      if (busy) return Promise.resolve(answer('busy', BUSY_WORDS));
      if (retrySeconds()) return Promise.resolve(waiting());
      if (!pending) return Promise.resolve(answer('nothing', ''));
      const held = pending, scope = identity, readback = pendingRead;
      busy = true;
      try {
        await readback;
        if (scope !== identity || pending !== held) return answer('expired', SIGN_IN_WORDS);
        const read = await session.refreshPortfolio();
        if (scope !== identity || pending !== held) return answer('expired', SIGN_IN_WORDS);
        if (!read?.ok) {
          if (read?.code === 'too_many_requests' && Number.isFinite(read.retryAfterSeconds) && read.retryAfterSeconds > 0) {
            retryAt = now() + read.retryAfterSeconds * 1000;
          }
          return answer('unknown', errorWords(read ?? {code: 'network_error'}), {code: read?.code, retryAfterSeconds: read?.retryAfterSeconds, ...metadata(read)});
        }
        return await attempt(held.kind, held.intent, held.uid, held);
      } catch { return answer('unknown', errorWords({code: 'network_error'}), {code: 'network_error', status: 0}); }
      finally { if (scope === identity) busy = false; }
    },
    async checkAgain() {
      if (busy) return answer('busy', BUSY_WORDS);
      if (retrySeconds()) return waiting();
      if (!pending) return answer('nothing', '');
      const scope = identity, held = pending, readback = pendingRead;
      busy = true;
      try {
        await readback;
        if (scope !== identity || pending !== held) return answer('expired', SIGN_IN_WORDS);
        let read;
        try { read = await session.refreshPortfolio(); } catch { read = {code: 'network_error', status: 0}; }
        if (scope !== identity || pending !== held) return answer('expired', SIGN_IN_WORDS);
        if (read?.ok) return answer('checked', CHECKED_WORDS);
        if (read?.code === 'too_many_requests' && Number.isFinite(read.retryAfterSeconds) && read.retryAfterSeconds > 0) {
          retryAt = now() + read.retryAfterSeconds * 1000;
        }
        // The trade stays unknown; failed checking must not expose the panel's Forget action.
        return answer('unknown', errorWords(read ?? {code: 'network_error'}),
          {code: read?.code, retryAfterSeconds: read?.retryAfterSeconds, ...metadata(read)});
      } finally { if (scope === identity) busy = false; }
    },
    // The player gives up an attempt that could not be confirmed (the first try may never have reached the server).
    // Nothing is sent: the uid is dropped, so a new trade can start. Only when no attempt is on its way.
    forget() {
      if (busy || !pending) return answer('nothing', '');
      pending = null; pendingRead = null;
      return answer('forgotten', FORGOTTEN_WORDS);
    },
  };
}
