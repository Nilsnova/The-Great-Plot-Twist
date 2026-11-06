// The desk's own small wrapper around fetch. It answers in the same two shapes as the game's sign-in
// client (src/online/api.js, package A2):
//   { ok: true, status, data }                                  data is null for an empty answer
//   { ok: false, status, code, message, retryAfterSeconds? }    status 0 means no answer at all
//
//   const request = createRequest({ getToken: () => session.getToken() });
//   const answer = await request.get('/api/predictions/mine');
//
// What it does on every call:
//   * refuses any path outside /api/predictions before it calls fetch (a TypeError), so a bug in the
//     desk can never send the login token to another address;
//   * adds "Authorization: Bearer <token>" only when getToken() returns a token, and never when the
//     call is marked anonymous (the public list). The token never goes into the address;
//   * gives up after 10 seconds and never throws for a problem with the call itself.
//
// The game has no sign-in yet, so adapter.js passes a getToken that returns null. When A2 is merged,
// adapter.js hands A2's `api` to the adapter instead (it has the same get and post), and this file can go.
//
// Used by: adapter.js, adapter-http.js (through the object it is given) and the tests.

export const REQUEST_TIMEOUT_MS = 10000;

// Only the desk's own routes: /api/predictions and one lowercase word below it. No query, no dots, no double slash.
const DESK_PATH = /^\/api\/predictions(\/[a-z-]+)?$/;

const MESSAGES = {
  network: 'No connection to the server. Check your internet and try again.',
  timeout: 'The server took too long to answer. Try again.',
  unknown: 'Something went wrong. Try again.',
};

// The word the server uses for a status when an answer carries no code of its own (backend/server/errors.py).
const CODE_BY_STATUS = {
  400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 405: 'method_not_allowed',
  409: 'conflict', 422: 'validation_error', 429: 'too_many_requests', 500: 'server_error', 503: 'unavailable',
};

const failure = (status, code, message, extra = {}) => ({ ok: false, status, code, message, ...extra });

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Retry-After is a whole number of seconds. Anything else (a date, a word) is ignored.
function readRetryAfter(response) {
  const text = response.headers.get('Retry-After');
  if (text === null || !/^\d+$/.test(text.trim())) return null;
  const seconds = Number(text);
  return seconds > 0 ? seconds : null;
}

// The server's error looks like {"error": {"code": "...", "message": "..."}}. Either part may be missing.
function describeFailure(response, body) {
  const error = body && typeof body === 'object' ? body.error : null;
  const code = typeof error?.code === 'string' && error.code ? error.code : CODE_BY_STATUS[response.status] ?? 'http_error';
  const message = typeof error?.message === 'string' && error.message.trim() ? error.message : MESSAGES.unknown;
  const seconds = response.status === 429 ? readRetryAfter(response) : null;
  return failure(response.status, code, message, seconds === null ? {} : { retryAfterSeconds: seconds });
}

// fetchImpl is only for tests. By default the browser's own fetch is looked up at the moment of each call.
export function createRequest({ getToken = () => null, fetchImpl, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  if (fetchImpl !== undefined && typeof fetchImpl !== 'function') throw new TypeError('createRequest: fetchImpl must be a function.');

  // The options for fetch. It runs before the call, so a bad path throws at once.
  function prepare(method, path, body, anonymous) {
    if (typeof path !== 'string' || !DESK_PATH.test(path)) {
      throw new TypeError('The prediction desk may only call /api/predictions and the routes below it.');
    }
    const headers = {};
    const token = anonymous ? null : getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const options = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    return options;
  }

  async function send(path, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await (fetchImpl ?? globalThis.fetch)(path, { ...options, signal: controller.signal });
      const body = await readBody(response);
      if (response.ok) return { ok: true, status: response.status, data: body };
      return describeFailure(response, body);
    } catch {
      if (controller.signal.aborted) return failure(0, 'timeout', MESSAGES.timeout);
      return failure(0, 'network_error', MESSAGES.network);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get: (path, { anonymous = false } = {}) => send(path, prepare('GET', path, undefined, anonymous)),
    post: (path, body) => send(path, prepare('POST', path, body, false)),
  };
}
