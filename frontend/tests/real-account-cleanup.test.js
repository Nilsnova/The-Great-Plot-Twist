// Confirmed deletion signs out; late replies cannot act on a newer session.
import {describe, expect, it, vi} from 'vitest';
import {createRealAdapter} from '../src/online/adapter/index.js';
import {createSession} from '../src/online/session.js';

const okay = data => ({ok: true, status: 200, data});
function setup({authOverrides = {}, meOverrides = {}} = {}) {
  const session = createSession();
  session.setToken(`fixture-${crypto.randomUUID()}`);
  const me = {id: 'private-placeholder', captainName: 'Recorded Captain', coins: 0,
    kit: null, place: null, crews: [], ...meOverrides};
  const api = {
    get: vi.fn(async path => okay(path === '/api/config' ? {flags: {sign_in: true}}
      : path === '/api/me' ? me : null)),
    post: vi.fn(async () => okay({captainName: me.captainName, rerollsLeft: 1})),
    del: vi.fn(async () => okay({deleted: true})),
  };
  const auth = {signOut: vi.fn(async () => {}), dispose() {}, ...authOverrides};
  const adapter = createRealAdapter({session, api, publicApi: api, auth, document: {}, window: {}});
  const ready = () => vi.waitFor(() => expect(adapter.read().account.canReroll).toBe(true));
  return {session, api, auth, adapter, ready, me};
}
describe('account deletion device cleanup', () => {
  it('accepts a current successful sign-in that fills the in-memory session', async () => {
    const test = setup();
    try {
      await test.ready();
      test.session.clearToken();
      test.auth.signIn = vi.fn(async () => {
        test.session.setToken(`fixture-${crypto.randomUUID()}`);
        return {ok: true};
      });
      expect((await test.adapter.signIn()).accepted).toBe(true);
      expect(test.adapter.read().account.state).toBe('signed_in');
      expect(test.adapter.read().account.canReroll).toBe(true);
    } finally { test.adapter.dispose(); }
  });
  it('keeps an explicit sign-out after an older sign-in finishes unsuccessfully', async () => {
    const test = setup();
    try {
      await test.ready();
      test.session.clearToken();
      let finish;
      test.auth.signIn = vi.fn(() => new Promise(resolve => { finish = resolve; }));
      const pending = test.adapter.signIn();
      await vi.waitFor(() => expect(typeof finish).toBe('function'));
      await test.adapter.signOut();
      const reads = test.api.get.mock.calls.length;
      finish({ok: false, state: 'signed_out'});
      expect((await pending).reason).toBe('session_expired');
      expect(test.adapter.read().account.state).toBe('signed_out');
      expect(test.api.get).toHaveBeenCalledTimes(reads);
    } finally { test.adapter.dispose(); }
  });
  it('does not hydrate a new identity for an older successful sign-in intent', async () => {
    const test = setup();
    try {
      await test.ready();
      test.session.clearToken();
      let finish;
      test.auth.signIn = vi.fn(() => new Promise(resolve => { finish = resolve; }));
      const pending = test.adapter.signIn();
      await vi.waitFor(() => expect(typeof finish).toBe('function'));
      await test.adapter.signOut();
      test.session.setToken(`fixture-${crypto.randomUUID()}`);
      await test.ready();
      const reads = test.api.get.mock.calls.length;
      finish({ok: true});
      expect((await pending).reason).toBe('session_expired');
      expect(test.adapter.read().account.state).toBe('signed_in');
      expect(test.api.get).toHaveBeenCalledTimes(reads);
    } finally { test.adapter.dispose(); }
  });
  it('does not hydrate or change the held view after disposal during sign-in', async () => {
    const test = setup();
    try {
      await test.ready();
      test.session.clearToken();
      let finish;
      test.auth.signIn = vi.fn(() => new Promise(resolve => { finish = resolve; }));
      const pending = test.adapter.signIn();
      await vi.waitFor(() => expect(typeof finish).toBe('function'));
      test.adapter.dispose();
      const before = test.adapter.read(), reads = test.api.get.mock.calls.length;
      finish({ok: true});
      expect((await pending).reason).toBe('disposed');
      expect(test.adapter.read()).toEqual(before);
      expect(test.api.get).toHaveBeenCalledTimes(reads);
    } finally { test.adapter.dispose(); }
  });
  it('signs out without deleting any data', async () => {
    const test = setup();
    try {
      await test.ready();
      await test.adapter.signOut();
      expect(test.api.del).not.toHaveBeenCalled();
      expect(test.adapter.read().account.state).toBe('signed_out');
    } finally { test.adapter.dispose(); }
  });
  it('shows the current signed-out auth message even when logout notifies synchronously', async () => {
    let state = {state: 'signed_in', configured: true, message: 'You are signed in.'};
    const listeners = new Set();
    const authOverrides = {
      read: () => ({...state}),
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      signOut: vi.fn(async () => {
        state = {state: 'signed_out', configured: true,
          message: 'You are signed out. Your progress on this device is kept.'};
        for (const listener of listeners) listener({...state});
      }),
    };
    const test = setup({authOverrides});
    try {
      await test.ready();
      expect(test.adapter.read().account.signInMessage).toBe('You are signed in.');
      await test.adapter.signOut();
      expect(test.adapter.read().account).toMatchObject({state: 'signed_out',
        signInMessage: 'You are signed out. Your progress on this device is kept.'});
    } finally { test.adapter.dispose(); }
  });
  it('signs out only after an explicitly confirmed, validated deletion', async () => {
    const test = setup();
    try {
      await test.ready();
      expect((await test.adapter.deleteMyData({confirm: false})).reason).toBe('confirmation_required');
      expect(test.api.del).not.toHaveBeenCalled();
      expect((await test.adapter.deleteMyData({confirm: true})).accepted).toBe(true);
      expect(test.api.del).toHaveBeenCalledWith('/api/me', {confirm: true});
      expect(test.adapter.read().account).toMatchObject({state: 'signed_out', captainName: null});
      expect(test.session.isSignedIn()).toBe(false);
    } finally { test.adapter.dispose(); }
  });
  it('stays signed in after a malformed deletion reply', async () => {
    const test = setup();
    try {
      await test.ready();
      test.api.del.mockResolvedValueOnce(okay({deleted: 'true'}));
      expect((await test.adapter.deleteMyData({confirm: true})).accepted).toBe(false);
      expect(test.session.isSignedIn()).toBe(true);
    } finally { test.adapter.dispose(); }
  });
  it('rejects an old successful delete reply after another sign-in', async () => {
    const test = setup();
    try {
      await test.ready();
      let finish;
      test.api.del.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      const pending = test.adapter.deleteMyData({confirm: true});
      await vi.waitFor(() => expect(typeof finish).toBe('function'));
      await test.adapter.signOut();
      test.session.setToken(`fixture-${crypto.randomUUID()}`);
      finish(okay({deleted: true}));
      expect((await pending).reason).toBe('session_expired');
      expect(test.session.isSignedIn()).toBe(true);
    } finally { test.adapter.dispose(); }
  });
});
