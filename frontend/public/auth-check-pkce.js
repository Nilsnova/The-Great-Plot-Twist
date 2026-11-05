// The secret of the sign-in check page, and its fingerprint (PKCE). A team check page, not the game.
//
// Why: after GitHub, Supabase sends the browser back with a ONE-TIME CODE in the address. The code
// alone is useless. It works only together with a secret that this page makes BEFORE it leaves
// and keeps in this tab until it comes back. So nobody who finds the code later (in the browser
// history, say) can use it. The standard behind this is called PKCE (RFC 7636).
//
// Two things leave the page:
//   - the fingerprint of the secret, in the address to Supabase (Supabase calls it code_challenge);
//   - the secret itself, later, to OUR server (POST /api/auth/exchange). Never to another site.
//
// The secret is not a login token. It waits in sessionStorage, which belongs to this tab only and
// is emptied when the tab closes. It is deleted the moment it is used.
//
// Plain JavaScript, no framework. Used by: auth-check.js and frontend/tests/auth-check-pkce.test.js.

// The name under which the secret waits in this tab while the browser visits GitHub.
export const VERIFIER_KEY = 'auth-check-verifier';

// 32 random bytes become 64 characters. PKCE asks for between 43 and 128.
const VERIFIER_BYTES = 32;

// A new secret: 64 characters from 0-9 and a-f, made by the browser's own random generator.
export function makeVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(VERIFIER_BYTES));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// "base64url" writes bytes as text: the letters of base64, with "-" and "_" instead of "+" and "/",
// and no "=" at the end. It is the way PKCE writes a fingerprint.
export function toBase64Url(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

// The fingerprint of a secret: its SHA-256 hash, written as base64url. Anyone may see it, but
// nobody can work backwards from it to the secret.
export async function makeChallenge(verifier) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(hash));
}

// Keep the secret in this tab. Returns false if the browser does not allow it.
export function saveVerifier(verifier) {
  try {
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    return true;
  } catch {
    return false; // sessionStorage can be blocked, for example by privacy settings
  }
}

// Take the secret out of this tab and delete it in the same step: it works only once.
// Returns null if there is none.
export function takeVerifier() {
  try {
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    sessionStorage.removeItem(VERIFIER_KEY);
    return verifier;
  } catch {
    return null;
  }
}
