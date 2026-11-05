// The production guard recognises exact and escaped sentences, without private prose in tests.
import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {containsFingerprint} from '../scripts/spoiler-guard.js';
describe('production spoiler fingerprints',()=>{
  it('detects exact protected text and escaped source strings',()=>{const text="A private 'example' line.",fingerprint={prefix:text.slice(0,14),length:text.length,sha256:createHash('sha256').update(text).digest('hex')};expect(containsFingerprint('before '+text+' after',fingerprint)).toBe(true);expect(containsFingerprint(text.replaceAll("'","\\'"),fingerprint)).toBe(true);expect(containsFingerprint('A different sentence.',fingerprint)).toBe(false);});
});
