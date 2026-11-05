// The calls that the sign-in check page makes to OUR server. A team check page, not the game.
//
//   GET  /api/config         how to sign in (the Supabase address)
//   POST /api/auth/exchange  swaps a one-time sign-in code for a login token
//   GET  /api/me             who the server says you are
//
// Each function returns plain data and never writes to the page. Nothing in this file saves or
// logs a token. The page talks to no other server (its Content-Security-Policy would refuse).
//
// Plain JavaScript, no framework. Used by: auth-check.js.

function isWebAddress(text) {
  return typeof text === 'string' && (text.startsWith('https://') || text.startsWith('http://'));
}

// Step 1. Ask our server how to sign in. Returns { provider, supabaseUrl }, or null if we cannot.
export async function loadSignInConfig() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    const auth = response.ok && config.auth;
    if (!auth || !isWebAddress(auth.supabaseUrl)) return null;
    return { provider: auth.provider, supabaseUrl: auth.supabaseUrl };
  } catch {
    return null; // the server is not reachable, or it did not answer with JSON
  }
}

// Step 4. Give the one-time code and the secret to our server. It swaps them for a login token.
export async function exchangeCodeForToken(code, codeVerifier) {
  const response = await fetch('/api/auth/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier }),
  });
  const body = await response.json().catch(() => null); // null if the answer is not JSON
  return { status: response.status, body };
}

// Step 5. Show the token to our server (as a "Bearer" header) and read its answer.
export async function askServerWhoIAm(token) {
  const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

// The server's error answers look like {"error": {"code": "...", "message": "..."}}.
export function errorMessage(body) {
  return body && body.error && body.error.message ? body.error.message : 'No details.';
}
