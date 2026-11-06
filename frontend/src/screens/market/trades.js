// Opening and closing positions. One uid belongs to one click, so a repeat can never trade twice.
// When the outcome is not known the attempt is kept: "Send again" reuses its uid, and no new trade
// starts until it is settled. No DOM and no rules: the server decides, this only sends and explains.
// Used by: panel.js. Every result is { kind, message, refreshed } where `refreshed` settles after the lists update.
import { makeActionUid } from './uid.js';
import { errorWords, OUTCOME_UNKNOWN } from './words.js';
import { openedWords, closedWords, ALREADY_DONE, BLOCKED_WORDS, CHECKED_WORDS, FORGOTTEN_WORDS } from './result-words.js';

const SKIP_REFRESH = new Set(['unauthorized', 'too_many_requests']); // nothing changed, and asking more only adds load
const BUSY_WORDS = 'One moment: your last click is still being sent.';

export function createTrades({ adapter, session, makeUid = makeActionUid }) {
  let pending = null; // an attempt whose outcome we could not confirm: { kind, intent, uid }
  let busy = false;

  const quiet = () => Promise.resolve();
  const answer = (kind, message, extra = {}) => ({ kind, message, refreshed: quiet(), ...extra });
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

  function settle(attempt, result) {
    if (result.ok) {
      pending = null;
      const message = attempt.kind === 'open'
        ? openedWords(result.data, session.company(attempt.intent.companyId))
        : closedWords(result.data, companyOfPosition(attempt.intent.positionId));
      return afterwards({ kind: 'done', message, data: result.data }, 'all');
    }
    if (result.code === 'outcome_unknown') {
      pending = attempt;
      return afterwards({ kind: 'unknown', message: OUTCOME_UNKNOWN, code: result.code }, 'portfolio');
    }
    pending = null;
    if (result.code === 'already_applied') return afterwards({ kind: 'already_done', message: ALREADY_DONE, code: result.code }, 'all');
    const message = errorWords(result, { total: stakeTotal(attempt.intent) });
    const outcome = { kind: 'refused', code: result.code, message, retryAfterSeconds: result.retryAfterSeconds };
    return afterwards(outcome, SKIP_REFRESH.has(result.code) ? 'none' : 'all');
  }

  async function attempt(kind, intent, uid) {
    busy = true;
    let result;
    try { result = await adapter[kind](intent, { uid }); }
    catch { result = { ok: false, code: 'outcome_unknown', message: '', status: 0, retryAfterSeconds: null }; } // a throw: we cannot know what happened
    finally { busy = false; }
    return settle({ kind, intent, uid }, result);
  }

  function start(kind, intent) {
    if (busy) return Promise.resolve(answer('busy', BUSY_WORDS));
    if (pending) return Promise.resolve(answer('blocked', BLOCKED_WORDS));
    return attempt(kind, intent, makeUid());
  }

  return {
    get pending() { return pending; },
    get busy() { return busy; },
    open: intent => start('open', intent),
    close: intent => start('close', intent),
    sendAgain() {
      if (busy) return Promise.resolve(answer('busy', BUSY_WORDS));
      if (!pending) return Promise.resolve(answer('nothing', ''));
      return attempt(pending.kind, pending.intent, pending.uid);
    },
    async checkAgain() {
      await session.refreshPortfolio();
      return answer('checked', CHECKED_WORDS);
    },
    // The player gives up an attempt that could not be confirmed (the first try may never have reached the server).
    // Nothing is sent: the uid is dropped, so a new trade can start. Only when no attempt is on its way.
    forget() {
      if (busy || !pending) return answer('nothing', '');
      pending = null;
      return answer('forgotten', FORGOTTEN_WORDS);
    },
  };
}
