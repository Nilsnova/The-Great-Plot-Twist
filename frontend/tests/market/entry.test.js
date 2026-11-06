// Which adapter the entry point picks: the HTTP one, or the local fake only in a dev build with ?market=local.
import { describe, expect, it } from 'vitest';
import { chooseAdapterKind } from '../../src/screens/market/index.js';

describe('chooseAdapterKind', () => {
  it('uses the local fake only in a dev build and only when asked', () => {
    expect(chooseAdapterKind({ dev: true, search: '?market=local' })).toBe('fake');
    expect(chooseAdapterKind({ dev: true, search: '?demo=1&market=local' })).toBe('fake');
  });

  it('uses the real server in a dev build that did not ask for the fake', () => {
    expect(chooseAdapterKind({ dev: true, search: '' })).toBe('http');
    expect(chooseAdapterKind({ dev: true, search: '?market=remote' })).toBe('http');
  });

  it('never uses the fake in a production build, whatever the address says', () => {
    expect(chooseAdapterKind({ dev: false, search: '?market=local' })).toBe('http');
    expect(chooseAdapterKind({ dev: false, search: '' })).toBe('http');
  });

  it('copes with a missing address', () => {
    expect(chooseAdapterKind({ dev: true })).toBe('http');
    expect(chooseAdapterKind()).toBe('http');
  });
});
