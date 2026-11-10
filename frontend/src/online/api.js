// The browser's way to talk to our own server: api.get, api.post, api.put and api.del.
//
//   const result = await api.get('/api/me');
//   if (result.ok) show(result.data); else showError(result.message);
//
// What it does for every call:
//   * adds the login token from session.js as "Authorization: Bearer <token>", but only when the
//     player is signed in. The token never goes into the address.
//   * sends a body as JSON, with "Content-Type: application/json".
//   * never throws for a problem with the call itself. It always answers with an object:
//       { ok: true, status, data }                                 data is null for an empty answer
//       { ok: false, status, code, message, retryAfterSeconds? }   code and message are ready to show
//     `code` is the server's own short word (see the error shape in docs/INTERFACES.md). Without one
//     it is a word for the status, or network_error or timeout (status 0).
//   * turns 401, 409 and 429 into messages a player can read:
//       401  renews once when auth is available, then asks for sign-in if the retry is refused.
//       409  the server's own message (it explains, for example "This was already done."). The code
//            is kept, so a caller can treat already_applied, already_seated and already_started as done.
//       429  "Wait N seconds", from the Retry-After header of the server.
//   * gives up after 10 seconds.
//
// A path that could send the token to another site is a bug of the caller, so it throws a TypeError
// at once and never calls fetch: the path must start with /api/ and must not contain // (this also
// refuses ://). Use createApi in a test, with a fake session and a fake fetch.
//
// Used by: the sign-in screen and every screen that talks to the server (later), and
// tests/online-api.test.js.

import { session } from './session.js';

export const REQUEST_TIMEOUT_MS = 10000; // a call that takes longer is cancelled

export const MESSAGES = {
  unauthorized: 'Please sign in again.',
  conflict: 'That clashes with what is saved. Reload and try again.',
  tooMany: 'Too many tries. Wait a moment, then try again.',
  tooManyAfter: seconds => `Too many tries. Wait ${seconds} ${seconds === 1 ? 'second' : 'seconds'}, then try again.`,
  network: 'No connection to the server. Check your internet and try again.',
  timeout: 'The server took too long to answer. Try again.',
  unknown: 'Something went wrong. Try again.',
};

// The word the server uses for a status (CODE_BY_STATUS in backend/server/errors.py), for an answer
// that carries no code of its own.
const CODE_BY_STATUS = {
  400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 405: 'method_not_allowed',
  409: 'conflict', 422: 'validation_error', 429: 'too_many_requests', 500: 'server_error', 503: 'unavailable',
};

function checkPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/api/') || path.includes('//')) {
    throw new TypeError('api: the path must start with /api/ and must not contain //');
  }
}

function failure(status, code, message, extra = {}) {
  return { ok: false, status, code, message, ...extra };
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// The server's error: {"error": {"code": "...", "message": "..."}}. Either part may be missing.
function readServerError(body) {
  const error = body && typeof body === 'object' ? body.error : null;
  const code = typeof error?.code === 'string' && error.code ? error.code : null;
  const message = typeof error?.message === 'string' && error.message.trim() ? error.message : null;
  return { code, message };
}

// Retry-After is a whole number of seconds. Anything else (a date, a word) is ignored.
function readRetryAfter(response) {
  const text = response.headers.get('Retry-After');
  if (text === null || !/^\d+$/.test(text.trim())) return null;
  const seconds = Number(text);
  return seconds > 0 ? seconds : null;
}

function describeFailure(response, body, session) {
  const { status } = response;
  const serverError = readServerError(body);
  const code = serverError.code || CODE_BY_STATUS[status] || 'http_error';
  if (status === 401) {
    session.clearToken(); // the token is no good any more: the game shows the sign-in again
    return failure(status, code, MESSAGES.unauthorized);
  }
  if (status === 409) return failure(status, code, serverError.message || MESSAGES.conflict);
  if (status === 429) {
    const seconds = readRetryAfter(response);
    if (seconds === null) return failure(status, code, MESSAGES.tooMany);
    return failure(status, code, MESSAGES.tooManyAfter(seconds), { retryAfterSeconds: seconds });
  }
  return failure(status, code, serverError.message || MESSAGES.unknown);
}

export function createApi({ session, fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  if (!session || typeof session.getToken !== 'function' || typeof session.clearToken !== 'function') {
    throw new TypeError('createApi needs a session.');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('createApi needs a fetch function.');
  const limit = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : REQUEST_TIMEOUT_MS;

  // The options for fetch. It runs before the call, so a bad path or body throws at once.
  function prepare(method, path, body) {
    checkPath(path);
    const headers = {};
    const publicRead = method === 'GET'
      && ['/api/config', '/api/market'].includes(path.split('?')[0]);
    const token = publicRead ? null : session.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const options = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    return options;
  }

  function sameSession(scope, token) {
    if (typeof session.getScope === 'function') return session.getScope() === scope;
    return session.getToken() === token;
  }

  function waitForRenewal(signal) {
    return new Promise(resolve => {
      let done = false;
      const aborted = () => finish(false);
      function finish(result) {
        if (done) return;
        done = true;
        signal.removeEventListener('abort', aborted);
        resolve(result === true);
      }
      signal.addEventListener('abort', aborted, {once: true});
      Promise.resolve().then(() => session.renewToken()).then(finish, () => finish(false));
      if (signal.aborted) aborted();
    });
  }

  async function renewedOptions(options, scope, signal) {
    const token = options.headers.Authorization?.slice(7);
    if (!token || !sameSession(scope, token) || signal.aborted) return null;
    let renewed = session.getToken() !== token;
    if (!renewed && typeof session.renewToken === 'function') renewed = await waitForRenewal(signal);
    if (!renewed || !sameSession(scope, token) || signal.aborted) return null;
    const fresh = session.getToken();
    if (!fresh) return null;
    return {...options, headers: {...options.headers, Authorization: `Bearer ${fresh}`}};
  }

  async function send(path, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limit);
    const scope = session.getScope?.();
    let sent = options;
    try {
      let response = await fetchImpl(path, { ...sent, signal: controller.signal });
      if (response.status === 401) {
        const retry = await renewedOptions(sent, scope, controller.signal);
        if (controller.signal.aborted) return failure(0, 'timeout', MESSAGES.timeout);
        if (retry) {
          const firstBody = await readBody(response);
          if (controller.signal.aborted) return failure(0, 'timeout', MESSAGES.timeout);
          const retryToken = retry.headers.Authorization.slice(7);
          if (!sameSession(scope, retryToken) || session.getToken() !== retryToken) {
            return describeFailure(response, firstBody, {clearToken() {}});
          }
          sent = retry;
          response = await fetchImpl(path, {...sent, signal: controller.signal});
        }
      }
      const body = await readBody(response);
      if (response.ok) return { ok: true, status: response.status, data: body };
      const sentToken = sent.headers.Authorization?.slice(7);
      return describeFailure(response, body, {clearToken() {
        if (sentToken && sameSession(scope, sentToken) && session.getToken() === sentToken) {
          session.clearToken();
        }
      }});
    } catch {
      if (controller.signal.aborted) return failure(0, 'timeout', MESSAGES.timeout);
      return failure(0, 'network_error', MESSAGES.network);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get: path => send(path, prepare('GET', path)),
    post: (path, body) => send(path, prepare('POST', path, body)),
    put: (path, body) => send(path, prepare('PUT', path, body)),
    del: (path, body) => send(path, prepare('DELETE', path, body)),
  };
}

// The one api of the game, bound to the one session.
export const api = createApi({ session });
