// Delayed auth chunks never restore a signed-out tab or publish results after teardown.
import {describe, expect, it, vi} from 'vitest';
import {createLazyAuth} from '../src/online/lazy-auth.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
function setup(overrides = {}) {
  const storage = {clearSession: vi.fn(), close: vi.fn()};
  const session = {clearToken: vi.fn()};
  const callbacks = [];
  const controller = {
    restore: vi.fn(async () => ({ok: true})), signIn: vi.fn(async () => ({ok: true})),
    renew: vi.fn(async () => ({ok: true})), getAccessToken: vi.fn(async () => 'placeholder'),
    signOut: vi.fn(async () => ({ok: true})), dispose: vi.fn(),
    readOwnLedger: vi.fn(async () => ({ok: true, rows: []})),
    readCrewMemberIds: vi.fn(async () => ({ok: true, ids: []})),
  };
  const createAuth = vi.fn(options => { callbacks.push(options.onState); return controller; });
  const loadAuth = vi.fn(async () => ({createAuth}));
  const auth = createLazyAuth({supabaseUrl: 'https://placeholder.supabase.co',
    publishableKey: `public-${crypto.randomUUID()}`, storage, session, loadAuth, ...overrides});
  return {auth, storage, session, controller, createAuth, loadAuth, callbacks};
}

describe('lazy auth lifetime', () => {
  it('loads only once for concurrent initial methods', async () => {
    const {auth, controller, loadAuth} = setup();
    await Promise.all([auth.restore(), auth.signIn()]);
    expect(loadAuth).toHaveBeenCalledTimes(1);
    expect(controller.restore).toHaveBeenCalledTimes(1);
    expect(controller.signIn).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending restore when sign-out happens before the chunk resolves', async () => {
    const wait = deferred();
    const {auth, createAuth, storage, session} = setup({loadAuth: () => wait.promise});
    const pending = auth.restore();
    await auth.signOut();
    wait.resolve({createAuth});
    expect((await pending).ok).toBe(false);
    expect(createAuth).not.toHaveBeenCalled();
    expect(storage.clearSession).toHaveBeenCalled();
    expect(session.clearToken).toHaveBeenCalled();
    expect(auth.read().state).toBe('signed_out');
  });

  it('lets a new sign-in load independently of the canceled import', async () => {
    const old = deferred();
    const loadAuth = vi.fn().mockImplementationOnce(() => old.promise);
    const {auth, controller, createAuth} = setup({loadAuth});
    loadAuth.mockResolvedValue({createAuth});
    const pending = auth.restore();
    await vi.waitFor(() => expect(loadAuth).toHaveBeenCalledTimes(1));
    await auth.signOut();
    expect((await auth.signIn()).ok).toBe(true);
    old.resolve({createAuth});
    expect((await pending).ok).toBe(false);
    expect(createAuth).toHaveBeenCalledTimes(1);
    expect(controller.restore).not.toHaveBeenCalled();
    expect(controller.signIn).toHaveBeenCalledTimes(1);
  });

  it('retries a failed chunk on the next tap', async () => {
    const loadAuth = vi.fn().mockRejectedValueOnce(new Error('chunk unavailable'));
    const {auth, controller, createAuth} = setup({loadAuth});
    loadAuth.mockResolvedValue({createAuth});
    expect((await auth.signIn()).ok).toBe(false);
    expect(auth.read().state).toBe('error');
    expect((await auth.signIn()).ok).toBe(true);
    expect(loadAuth).toHaveBeenCalledTimes(2);
    expect(controller.signIn).toHaveBeenCalledTimes(1);
  });

  it('does not publish a stale loader error after sign-out', async () => {
    const old = deferred();
    const {auth} = setup({loadAuth: () => old.promise});
    const listener = vi.fn();
    auth.subscribe(listener);
    const pending = auth.restore();
    await auth.signOut();
    const count = listener.mock.calls.length;
    old.reject(new Error('late chunk failure'));
    expect((await pending).ok).toBe(false);
    expect(listener).toHaveBeenCalledTimes(count);
    expect(auth.read().state).toBe('signed_out');
  });

  it('discards a private read that completes after sign-out', async () => {
    const wait = deferred();
    const {auth, controller} = setup();
    controller.readOwnLedger.mockImplementation(() => wait.promise);
    const pending = auth.readOwnLedger();
    await vi.waitFor(() => expect(controller.readOwnLedger).toHaveBeenCalledTimes(1));
    await auth.signOut();
    wait.resolve({ok: true, rows: [{reason: 'kit_grant', amount: 1000}]});
    expect(await pending).toEqual({ok: false, rows: []});
  });

  it('discards a token that completes after sign-out', async () => {
    const wait = deferred();
    const {auth, controller} = setup();
    controller.getAccessToken.mockImplementation(() => wait.promise);
    const pending = auth.getAccessToken();
    await vi.waitFor(() => expect(controller.getAccessToken).toHaveBeenCalledTimes(1));
    await auth.signOut();
    wait.resolve(`test-${crypto.randomUUID()}`);
    expect(await pending).toBeNull();
  });

  it('reuses a loaded controller and keeps subscriptions after logout', async () => {
    const {auth, createAuth, callbacks, controller} = setup();
    const listener = vi.fn();
    const stop = auth.subscribe(listener);
    await auth.restore();
    callbacks[0]({state: 'signed_in', message: '', configured: true});
    await auth.signOut();
    await auth.signIn();
    callbacks[0]({state: 'signing_in', message: '', configured: true});
    expect(createAuth).toHaveBeenCalledTimes(1);
    expect(controller.signOut).toHaveBeenCalledTimes(1);
    expect(listener.mock.lastCall[0].state).toBe('signing_in');
    stop();
    const count = listener.mock.calls.length;
    callbacks[0]({state: 'signed_in', message: '', configured: true});
    expect(listener).toHaveBeenCalledTimes(count);
  });

  it('disposes a loaded controller once and ignores later publication', async () => {
    const {auth, storage, controller, callbacks} = setup();
    await auth.restore();
    const listener = vi.fn();
    auth.subscribe(listener);
    auth.dispose(); auth.dispose();
    callbacks[0]({state: 'signed_in', configured: true});
    expect(controller.dispose).toHaveBeenCalledTimes(1);
    expect(storage.close).toHaveBeenCalledWith({clear: false});
    expect(listener).not.toHaveBeenCalled();
    expect(await auth.getAccessToken()).toBeNull();
  });

  it('disposes without constructing a delayed controller', async () => {
    const wait = deferred();
    const {auth, createAuth, storage} = setup({loadAuth: () => wait.promise});
    const pending = auth.restore();
    auth.dispose();
    wait.resolve({createAuth});
    expect((await pending).ok).toBe(false);
    expect(createAuth).not.toHaveBeenCalled();
    expect(storage.close).toHaveBeenCalledWith({clear: false});
  });

  it('keeps late method errors from replacing signed-out state', async () => {
    const wait = deferred();
    const {auth, controller} = setup();
    controller.renew.mockImplementation(() => wait.promise);
    const pending = auth.renew();
    await vi.waitFor(() => expect(controller.renew).toHaveBeenCalledTimes(1));
    await auth.signOut();
    wait.reject(new Error('late refresh failure'));
    expect((await pending).ok).toBe(false);
    expect(auth.read().state).toBe('signed_out');
  });

  it('does not load an unconfigured build', async () => {
    const {auth, loadAuth} = setup({supabaseUrl: '', publishableKey: ''});
    expect(await auth.getAccessToken()).toBeNull();
    expect((await auth.restore()).ok).toBe(false);
    expect(loadAuth).not.toHaveBeenCalled();
  });
});
