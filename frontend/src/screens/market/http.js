// The HTTP mapping of the Exchange adapter: the only file that talks to the server. Used by: index.js.
//
//   const adapter = createMarketHttpAdapter({ getToken });
//   await adapter.board();                                    // GET  /api/market            (anyone, no token sent)
//   await adapter.portfolio();                                // GET  /api/market/portfolio  (Bearer token)
//   await adapter.open({ companyId, side, stake }, { uid });  // POST /api/market/open       (Bearer token)
//   await adapter.close({ positionId }, { uid });             // POST /api/market/close      (Bearer token)
//
// Every call resolves and none throws. The answer is { ok: true, data } or
// { ok: false, code, message, status, retryAfterSeconds }; status is 0 when no answer came at all.
// One uid belongs to one click: sending the same uid again can never trade twice (the server answers
// 409 already_applied). The browser never sends a price or a player id.
//
// When the outcome of open or close is not known (no answer, a timeout of 10 seconds, a 5xx that
// does not say "nothing was done", or an answer we cannot read) the code is "outcome_unknown".
import { makeActionUid } from './uid.js';
import { ERROR_FALLBACKS } from './words.js';

const BASE = '/api/market';
const DEFAULT_TIMEOUT_MS = 10000;
// Only these 503 answers say nothing was done. Other 5xx replies may arrive after the coins moved.
const CLEAR_REFUSALS = new Set(['market_unavailable', 'database_not_configured']);

const isObject = value => value !== null && typeof value === 'object';
const hasList = (value, key) => isObject(value) && Array.isArray(value[key]);
const hasId = value => isObject(value) && typeof value.positionId === 'string';
const SHAPES = {
  board: value => hasList(value, 'companies') && hasList(value.rules, 'stakeChoices'),
  portfolio: value => hasList(value, 'positions') && hasList(value, 'recentlyClosed'),
  open: hasId,
  close: hasId,
};

const failure = (code, message, status, retryAfterSeconds = null) => ({ ok: false, code, message, status, retryAfterSeconds });
const unknownOutcome = status => failure('outcome_unknown', ERROR_FALLBACKS.outcome_unknown, status);

function retryAfter(headers) {
  const raw = headers?.get?.('Retry-After')?.trim();
  return raw && /^\d+$/.test(raw) ? Number(raw) : null;
}

async function readJson(response) {
  try { return { value: await response.json() }; } catch { return { value: undefined }; }
}

export function createMarketHttpAdapter({ fetchImpl, getToken = () => null, makeUid = makeActionUid,
  timeoutMs = DEFAULT_TIMEOUT_MS, request, publicGet } = {}) {
  const send = fetchImpl ?? ((...args) => globalThis.fetch(...args));

  async function tokenNow() {
    try { return (await getToken()) || null; } catch { return null; }
  }

  // `trade` is true for open and close, whose outcome we must never guess.
  function interpret(name, response, body, trade) {
    if (response.ok) {
      if (SHAPES[name](body.value)) return { ok: true, data: body.value };
      return trade ? unknownOutcome(response.status) : failure('bad_response', '', response.status);
    }
    const error = body.value?.error;
    const code = typeof error?.code === 'string' && error.code ? error.code : (response.status >= 500 ? 'server_error' : 'bad_response');
    const nothingDone = response.status === 503 && CLEAR_REFUSALS.has(code);
    const unknown = response.status >= 500 && response.status <= 599 && !nothingDone;
    if (trade && unknown) return unknownOutcome(response.status);
    return failure(code, typeof error?.message === 'string' ? error.message : '', response.status, retryAfter(response.headers));
  }

  function fromFacade(name, result, trade) {
    const status = Number.isInteger(result?.status) ? result.status : result?.ok ? 200 : 0;
    if (!result || typeof result.ok !== 'boolean') return trade ? unknownOutcome(0) : failure('bad_response', '', 0);
    if (status === 0) return trade ? unknownOutcome(0) : failure('network_error', ERROR_FALLBACKS.network_error, 0);
    if (trade && !result.ok && status >= 200 && status < 300) return unknownOutcome(status);
    const code = status === 401 ? 'unauthorized' : status === 429 ? 'too_many_requests' : result.code;
    const wait = Number.isFinite(result.retryAfterSeconds) && result.retryAfterSeconds > 0 ? String(result.retryAfterSeconds) : '';
    return interpret(name, { ok: result.ok, status, headers: { get: () => wait } },
      { value: result.ok ? result.data : { error: { code, message: result.message } } }, trade);
  }

  async function call(name, { method = 'GET', path = BASE, body, auth = false, trade = false }) {
    const facade = auth ? request : publicGet;
    if (typeof facade === 'function') {
      try { return fromFacade(name, await (auth ? facade(path, { method, ...(body && { body }) }) : facade(path)), trade); }
      catch { return trade ? unknownOutcome(0) : failure('network_error', ERROR_FALLBACKS.network_error, 0); }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { Accept: 'application/json' };
      if (body) headers['Content-Type'] = 'application/json';
      const token = auth ? await tokenNow() : null;
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await send(path, { method, headers, signal: controller.signal, ...(body && { body: JSON.stringify(body) }) });
      return interpret(name, response, await readJson(response), trade);
    } catch {
      return trade ? unknownOutcome(0) : failure('network_error', ERROR_FALLBACKS.network_error, 0);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    board: () => call('board', {}),
    portfolio: () => call('portfolio', { path: `${BASE}/portfolio`, auth: true }),
    open: ({ companyId, side, stake } = {}, { uid } = {}) => call('open', {
      method: 'POST', path: `${BASE}/open`, auth: true, trade: true, body: { companyId, side, stake, actionUid: uid ?? makeUid() },
    }),
    close: ({ positionId } = {}, { uid } = {}) => call('close', {
      method: 'POST', path: `${BASE}/close`, auth: true, trade: true, body: { positionId, actionUid: uid ?? makeUid() },
    }),
  };
}
