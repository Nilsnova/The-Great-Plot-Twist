// Confirmed deletion clears device data; late replies cannot delete a newer session's local progress.
import {describe, expect, it, vi} from 'vitest';
import {createRealCaseAdapter} from '../src/online/case-adapter/index.js';
import {createSession} from '../src/online/session.js';

const okay = data => ({ok: true, status: 200, data});
function setup({authOverrides = {}, cloudSave = {version: 1, data: {}}, meOverrides = {}} = {}) {
  const session = createSession();
  session.setToken(`fixture-${crypto.randomUUID()}`);
  const clear = vi.fn();
  const me = {id: 'private-placeholder', captainName: 'Recorded Captain', coins: 0,
    kit: null, place: null, crews: [], ...meOverrides};
  const api = {
    get: vi.fn(async path => okay(path === '/api/config' ? {flags: {sign_in: true}}
      : path === '/api/me' ? me : path === '/api/crews/me' ? {crew: null} : cloudSave)),
    post: vi.fn(async () => okay({captainName: me.captainName, rerollsLeft: 1})),
    del: vi.fn(async () => okay({deleted: true})),
  };
  const auth = {signOut: vi.fn(async () => {}), dispose() {},
    readOwnLedger: async () => ({ok: true, rows: []}), ...authOverrides};
  const adapter = createRealCaseAdapter({session, api, publicApi: api, auth, clearLocalSave: clear,
    readLocalSave: () => ({version: 1, actions: ['to_desk']}), document: {}, window: {}});
  const ready = () => vi.waitFor(() => expect(adapter.read().account.canReroll).toBe(true));
  return {session, clear, api, auth, adapter, ready, me, cloudSave};
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
  it('shows an anonymous ending replay as saved on this device without a cloud write', async () => {
    const test = setup();
    try {
      await test.ready();
      await test.adapter.signOut();
      const before = test.api.post.mock.calls.length;
      expect((await test.adapter.completeIntro({actions:['to_desk','take_key']})).reason).toBe('sign_in_required');
      expect(test.adapter.read().account).toMatchObject({canContinue:true,
        save:{state:'saved',device:{state:'saved'},cloud:{state:'idle'}}});
      expect(test.api.post).toHaveBeenCalledTimes(before);
      expect(test.api.put).toBeUndefined();
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
  it('keeps local progress on ordinary sign-out', async () => {
    const test = setup();
    try {
      await test.ready();
      await test.adapter.signOut();
      expect(test.clear).not.toHaveBeenCalled();
      expect(test.adapter.read().account.save.device.state).toBe('saved');
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
  it('removes a checked crew code on logout and keeps it out of the next identity', async () => {
    const test = setup({meOverrides: {kit: 'witness', place: 'saltreach_harbor'}});
    try {
      await test.ready();
      expect((await test.adapter.joinCrew('old-22x')).accepted).toBe(true);
      expect(test.adapter.read().crew.joinPreview?.code).toBe('OLD22X');
      await test.adapter.signOut();
      expect(test.adapter.read().crew.joinPreview).toBeNull();
      Object.assign(test.me, {id: crypto.randomUUID(), captainName: 'Second Recorded Captain', kit: null, place: null});
      test.auth.signIn = vi.fn(async () => {
        test.session.setToken(`fixture-${crypto.randomUUID()}`);
        return {ok: true};
      });
      expect((await test.adapter.signIn()).accepted).toBe(true);
      const view = test.adapter.read();
      expect(view.account.captainName).toBe('Second Recorded Captain');
      expect(view.crew.joinPreview).toBeNull();
      expect(JSON.stringify(view)).not.toContain('OLD22X');
    } finally { test.adapter.dispose(); }
  });
  it('leaves a conflicting cloud save behind while preserving local Continue for the next identity', async () => {
    const test = setup({cloudSave: {version: 2, data: {
      kind: 'intro', actions: ['to_shore'], place: 'lighthouse_isle'}, updatedAt: null}});
    try {
      await test.ready();
      await vi.waitFor(() => expect(test.adapter.read().account.save.state).toBe('conflict'));
      expect(test.adapter.read().account.canContinue).toBe(false);
      await test.adapter.signOut();
      expect(test.adapter.read().account).toMatchObject({state: 'signed_out', canContinue: true,
        save: {state: 'saved', device: {state: 'saved'}, cloud: {state: 'idle'}}});
      const reads = test.api.get.mock.calls.length;
      expect(await test.adapter.continueGame()).toMatchObject({accepted: true,
        view: {continuation: {source: 'local', kind: 'intro'}}});
      expect(test.api.get).toHaveBeenCalledTimes(reads);
      Object.assign(test.cloudSave, {version: 1, data: {}, updatedAt: null});
      Object.assign(test.me, {id: crypto.randomUUID(), captainName: 'Second Recorded Captain'});
      test.auth.signIn = vi.fn(async () => {
        test.session.setToken(`fixture-${crypto.randomUUID()}`);
        return {ok: true};
      });
      expect((await test.adapter.signIn()).accepted).toBe(true);
      expect(test.adapter.read().account).toMatchObject({state: 'signed_in', canContinue: true,
        captainName: 'Second Recorded Captain', save: {state: 'saved', source: 'device'}});
      expect(test.clear).not.toHaveBeenCalled();
    } finally { test.adapter.dispose(); }
  });
  it('clears the journal only after an explicitly confirmed, validated deletion', async () => {
    const test = setup();
    try {
      await test.ready();
      expect((await test.adapter.deleteMyData({confirm: false})).reason).toBe('confirmation_required');
      expect(test.api.del).not.toHaveBeenCalled();
      expect(test.clear).not.toHaveBeenCalled();
      expect((await test.adapter.deleteMyData({confirm: true})).accepted).toBe(true);
      expect(test.api.del).toHaveBeenCalledWith('/api/me', {confirm: true});
      expect(test.clear).toHaveBeenCalledOnce();
      expect(test.adapter.read().account).toMatchObject({state: 'signed_out',
        captainName: null, save: {device: {state: 'idle'}, cloud: {state: 'idle'}}});
    } finally { test.adapter.dispose(); }
  });
  it('does not clear device data after a malformed deletion reply', async () => {
    const test = setup();
    try {
      await test.ready();
      test.api.del.mockResolvedValueOnce(okay({deleted: 'true'}));
      expect((await test.adapter.deleteMyData({confirm: true})).accepted).toBe(false);
      expect(test.clear).not.toHaveBeenCalled();
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
      expect(test.clear).not.toHaveBeenCalled();
      expect(test.session.isSignedIn()).toBe(true);
    } finally { test.adapter.dispose(); }
  });
});
