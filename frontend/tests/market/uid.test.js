// Action ids: one per click, in the form the server accepts (8 to 64 letters, digits, hyphens or underscores).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeActionUid } from '../../src/screens/market/uid.js';

afterEach(() => { vi.unstubAllGlobals(); });

describe('makeActionUid', () => {
  it('makes an id the server accepts', () => {
    for (let i = 0; i < 50; i += 1) expect(makeActionUid()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('makes a different id every time', () => {
    const ids = new Set(Array.from({ length: 200 }, makeActionUid));
    expect(ids.size).toBe(200);
  });

  it('still works on a page where crypto.randomUUID is missing, such as an unencrypted address', () => {
    let counter = 0;
    vi.stubGlobal('crypto', { getRandomValues: array => { for (let i = 0; i < array.length; i += 1) array[i] = (counter += 7) % 256; return array; } });
    const first = makeActionUid(), second = makeActionUid();
    expect(first).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(second).not.toBe(first);
  });

  it('uses randomUUID when the browser has it', () => {
    vi.stubGlobal('crypto', { randomUUID: () => '123e4567-e89b-42d3-a456-426614174000' });
    expect(makeActionUid()).toBe('123e4567-e89b-42d3-a456-426614174000');
  });
});
