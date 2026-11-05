// The sign-in check page makes a secret and a fingerprint of it (PKCE). A wrong fingerprint would
// make every sign-in fail at Supabase, so the maths is checked here, without a browser.
import { describe, expect, it } from 'vitest';
import { makeChallenge, makeVerifier, toBase64Url } from '../public/auth-check-pkce.js';

describe('the sign-in secret and its fingerprint', () => {
  it('turns the example secret of the PKCE standard (RFC 7636, appendix B) into the example fingerprint', async () => {
    const secretOfTheStandard = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const fingerprintOfTheStandard = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    expect(await makeChallenge(secretOfTheStandard)).toBe(fingerprintOfTheStandard);
  });

  it('writes base64url: "-" and "_" instead of "+" and "/", and no "=" at the end', () => {
    expect(toBase64Url(new Uint8Array([0xfb, 0xff, 0xfe]))).toBe('-__-'); // plain base64 is "+//+"
    expect(toBase64Url(new Uint8Array([0xff]))).toBe('_w'); // plain base64 is "/w=="
  });

  it('makes a secret of 64 characters from 0-9 and a-f, and a new one every time', () => {
    const first = makeVerifier();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(makeVerifier()).not.toBe(first);
  });

  it('makes a secret that fits what the server accepts (43 to 128 characters)', () => {
    const length = makeVerifier().length;
    expect(length).toBeGreaterThanOrEqual(43);
    expect(length).toBeLessThanOrEqual(128);
  });

  it('makes a fingerprint of 43 characters that never holds the secret', async () => {
    const secret = makeVerifier();
    const fingerprint = await makeChallenge(secret);
    expect(fingerprint).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fingerprint).not.toContain(secret);
  });
});
