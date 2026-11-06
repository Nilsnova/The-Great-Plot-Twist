// The session: the last good board and portfolio, a note when a refresh fails, and the notice when a
// position closes at zero. No DOM. Used by: panel.js (to draw) and trades.js (to refresh after a trade).
import { timeText, UNKNOWN } from './format.js';
import { errorWords } from './words.js';
import { zeroNotices } from './result-words.js';

// "Could not refresh (last update 12:05)" when there is something to keep, else the reason in words.
function failureNote(result, kept, timeZone) {
  if (!kept) return errorWords(result);
  const when = timeText(kept.generatedAt, { timeZone });
  return when === UNKNOWN ? 'Could not refresh' : `Could not refresh (last update ${when})`;
}

export function createMarketSession({ adapter, timeZone, onNotice } = {}) {
  const state = { board: null, portfolio: null, signedIn: null, boardNote: null, portfolioNote: null };
  const listeners = new Set();
  const inFlight = new Map();

  // Overlapping refreshes of the same thing share one request.
  function once(name, load) {
    if (!inFlight.has(name)) inFlight.set(name, load().finally(() => inFlight.delete(name)));
    return inFlight.get(name);
  }
  const tell = () => { for (const listener of [...listeners]) listener(); };
  // An adapter never throws. If one does, it counts as a failed read, so the last good view stays.
  async function look(method) {
    try { return await adapter[method](); } catch { return { ok: false, code: 'network_error', message: '', status: 0, retryAfterSeconds: null }; }
  }

  const refreshBoard = () => once('board', async () => {
    const result = await look('board');
    if (result.ok) { state.board = result.data; state.boardNote = null; } else state.boardNote = failureNote(result, state.board, timeZone);
    tell();
    return result;
  });

  const refreshPortfolio = () => once('portfolio', async () => {
    const result = await look('portfolio');
    if (result.ok) {
      const notices = zeroNotices(state.portfolio, result.data);
      Object.assign(state, { portfolio: result.data, signedIn: true, portfolioNote: null });
      if (notices.length) onNotice?.(notices.join(' '));
    } else if (result.code === 'unauthorized') {
      Object.assign(state, { portfolio: null, signedIn: false, portfolioNote: null });
    } else state.portfolioNote = failureNote(result, state.portfolio, timeZone);
    tell();
    return result;
  });

  return {
    get board() { return state.board; },
    get portfolio() { return state.portfolio; },
    get signedIn() { return state.signedIn; },
    get boardNote() { return state.boardNote; },
    get portfolioNote() { return state.portfolioNote; },
    company: id => state.board?.companies.find(company => company?.id === id) ?? null,
    refreshBoard,
    refreshPortfolio,
    refreshAll: () => Promise.all([refreshBoard(), refreshPortfolio()]),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
