// The click id: 16 lowercase letters and digits that fit the server's rule for an actionUid.
import {describe, expect, it, vi} from 'vitest';
import {ACTION_UID_LENGTH, makeActionUid} from '../src/screens/islet/action-uid.js';

// backend/server/routes/islet.py takes 8 to 64 characters of letters, digits, underscore and hyphen.
const SERVER_RULE = /^[A-Za-z0-9_-]{8,64}$/;
const repeatBytes = values => length => Uint8Array.from({length}, (_, index) => values[index % values.length]);

describe('makeActionUid', () => {
  it('makes 16 characters, each a lowercase letter or a digit', () => {
    expect(ACTION_UID_LENGTH).toBe(16);
    expect(makeActionUid()).toMatch(/^[a-z0-9]{16}$/);
  });

  it('asks the random source for exactly one byte per character', () => {
    const randomBytes = vi.fn(repeatBytes([0]));
    makeActionUid(randomBytes);
    expect(randomBytes).toHaveBeenCalledTimes(1);
    expect(randomBytes).toHaveBeenCalledWith(16);
  });

  it('turns bytes into letters first and digits second, wrapping around after 36', () => {
    // 0 is a, 1 is b, 25 is z, 26 is 0, 35 is 9, 36 wraps to a, 71 wraps to 9, 255 wraps to d.
    const uid = makeActionUid(repeatBytes([0, 1, 25, 26, 35, 36, 71, 255]));
    expect(uid).toBe('abz09a9dabz09a9d');
  });

  it('fits the pattern and the length the server accepts', () => {
    expect(makeActionUid()).toMatch(SERVER_RULE);
  });

  it('makes a new id on every call with the real random source', () => {
    const ids = new Set(Array.from({length: 50}, () => makeActionUid()));
    expect(ids.size).toBe(50);
  });
});
