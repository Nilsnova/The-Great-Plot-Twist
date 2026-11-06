// Makes the id of one build click: 16 lowercase letters and digits. The same id is sent again on a retry.
export const ACTION_UID_LENGTH = 16;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

// The browser's strong random source. A test passes its own, so it can get the same id every time.
const browserRandomBytes = length => crypto.getRandomValues(new Uint8Array(length));

// Each random byte picks one character. A tiny bias toward the first letters does not matter,
// because the id has to be unique, not secret. The server accepts 8 to 64 of these characters.
export function makeActionUid(randomBytes = browserRandomBytes) {
  const bytes = randomBytes(ACTION_UID_LENGTH);
  return Array.from(bytes, byte => ALPHABET[byte % ALPHABET.length]).join('');
}
