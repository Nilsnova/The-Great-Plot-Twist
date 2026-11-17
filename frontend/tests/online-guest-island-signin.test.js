// Bug #141: "Join as guest" on a friend's link (and Join with a game code) sends
// signIn({guest: true, island: 'ISLE-…'}). The browser-side check must let that through,
// and still refuse bad shapes before anything reaches the server.
import {describe, expect, it} from 'vitest';
import {validateIntent} from '../src/online/adapter/validate.js';

const check = value => validateIntent('signIn', [value]);

describe('guest sign-in with an island code', () => {
  it('lets a guest start with an island code through', () => {
    expect(check({guest: true, island: 'ISLE-K7Q2M'})).toBeNull();
    expect(check({guest: true, island: 'isle-k7q2m'})).toBeNull();
    expect(check({guest: true, island: 'K7Q2M'})).toBeNull();
  });

  it('still lets the class-code guest start and GitHub sign-in through', () => {
    expect(check({guest: true, code: 'ABCDE'})).toBeNull();
    expect(check({provider: 'github'})).toBeNull();
  });

  it.each([
    ['without guest', {island: 'ISLE-K7Q2M'}],
    ['with guest false', {guest: false, island: 'ISLE-K7Q2M'}],
    ['not a string', {guest: true, island: 12345}],
    ['empty', {guest: true, island: ''}],
    ['too long', {guest: true, island: 'ISLE-' + 'K'.repeat(40)}],
    ['odd symbols', {guest: true, island: 'ISLE-<b>'}],
    ['together with a class code', {guest: true, island: 'ISLE-K7Q2M', code: 'ABCDE'}],
    ['together with a provider', {guest: true, island: 'ISLE-K7Q2M', provider: 'github'}],
    ['with an unknown field', {guest: true, island: 'ISLE-K7Q2M', extra: 1}],
  ])('refuses an island sign-in %s', (_name, value) => {
    expect(check(value)).toMatchObject({accepted: false, reason: 'invalid_request'});
  });
});
