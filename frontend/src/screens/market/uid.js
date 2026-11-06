// Makes the action id of one click. The server keeps it as a safe-repeat key: the same id never trades twice.
// Used by: trades.js (one id per click) and http.js (when the caller gives none).

// The server accepts 8 to 64 letters, digits, hyphens or underscores. A UUID fits.
export function makeActionUid() {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID exists only on encrypted pages; an unencrypted address (for example a phone on the same network) needs this.
  const bytes = new Uint8Array(16);
  if (typeof crypto?.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
