// Initial private reads must reconcile both copies before a scene autosave can write.
import {describe, expect, it, vi} from 'vitest';
import {createRealCaseAdapter} from '../src/online/case-adapter/index.js';
import {createSession} from '../src/online/session.js';

const okay = data => ({ok: true, status: 200, data});
const deviceActions = ['to_desk', 'take_key'];
const otherReplay = {kind: 'intro', actions: ['to_shore'], place: 'lighthouse_isle'};
function deferred() {
  let resolve;
  const promise = new Promise(finish => { resolve = finish; });
  return {promise, resolve};
}
async function settle() {
  // Drain the injected replies and their production continuation chains without a wall-clock delay.
  for (let step = 0; step < 20; step++) await Promise.resolve();
}
function setup({delayedStartup = false} = {}) {
  const session = createSession();
  session.setToken(`fixture-${crypto.randomUUID()}`);
  const journal = {version: 1, actions: ['to_desk']};
  const me = {id: crypto.randomUUID(), captainName: 'Recorded Captain', coins: 0,
    kit: 'witness', place: 'saltreach_harbor', crews: []};
  let cloud = {version: 1, data: {}, updatedAt: null};
  let held = null;
  const listeners = new Map();
  const readLocalSave = vi.fn(() => structuredClone(journal));
  const clearLocalSave = vi.fn();
  function holdHydration() {
    held = {save: deferred(), crew: deferred(), saveDone: false, crewDone: false};
    const task = held;
    return {
      save(value = {version: 7, data: otherReplay, updatedAt: null}) {
        cloud = structuredClone(value); task.saveDone = true; task.save.resolve(okay(cloud));
      },
      crew() { task.crewDone = true; task.crew.resolve(okay({crew: null})); },
    };
  }
  const api = {
    get: vi.fn(async path => {
      if (path === '/api/config') return okay({flags: {sign_in: true}});
      if (path === '/api/me') return okay(me);
      if (path === '/api/save') return held && !held.saveDone ? held.save.promise : okay(cloud);
      if (path === '/api/crews/me') return held && !held.crewDone ? held.crew.promise : okay({crew: null});
      throw new Error('Unexpected fixture route');
    }),
    post: vi.fn(async () => okay({captainName: me.captainName, rerollsLeft: 1})),
    put: vi.fn(async (_path, body) => {
      cloud = {version: body.version + 1, data: structuredClone(body.data), updatedAt: null};
      return okay({version: cloud.version, updatedAt: null});
    }),
  };
  const firstHydration = delayedStartup ? holdHydration() : null;
  const auth = {signOut: vi.fn(async () => {}), dispose() {},
    signIn: vi.fn(async () => {
      session.setToken(`fixture-${crypto.randomUUID()}`);
      return {ok: true};
    }),
    readOwnLedger: async () => ({ok: true, rows: []}),
  };
  const adapter = createRealCaseAdapter({session, api, publicApi: api, auth,
    readLocalSave, clearLocalSave, document: {}, window: {},
    on(name, callback) { listeners.set(name, callback); return () => listeners.delete(name); }});
  const arrive = place => listeners.get('arrived')?.({place});
  const waitForHeldReads = () => vi.waitFor(() => {
    expect(api.get.mock.calls.some(([path]) => path === '/api/save')).toBe(true);
    expect(api.get.mock.calls.some(([path]) => path === '/api/crews/me')).toBe(true);
  });
  async function stageScene(place = 'saltreach_harbor') {
    journal.actions = [...deviceActions];
    arrive(place);
    await settle();
  }
  async function exposeConflict(hold) {
    hold.save();
    await vi.waitFor(() => expect(adapter.read().account.save.cloud.state).toBe('saved'));
    await settle();
    expect(api.put).not.toHaveBeenCalled();
    expect(journal.actions).toEqual(deviceActions);
    hold.crew();
    await vi.waitFor(() => expect(adapter.read().account.save.state).toBe('conflict'));
    expect(adapter.read().account.canContinue).toBe(false);
    expect(api.put).not.toHaveBeenCalled();
  }
  async function keepDeviceAndContinue() {
    expect((await adapter.resolveSaveConflict('keep_this_device')).accepted).toBe(true);
    expect(api.put).toHaveBeenCalledExactlyOnceWith('/api/save', {version: 7,
      data: {kind: 'intro', actions: deviceActions, place: 'lighthouse_isle'}});
    expect(adapter.read().account).toMatchObject({canContinue: true, save: {state: 'saved'}});
    expect((await adapter.continueGame()).view.continuation).toEqual({source: 'cloud', kind: 'intro',
      actions: deviceActions, place: 'lighthouse_isle'});
    expect(clearLocalSave).not.toHaveBeenCalled();
    expect(journal.actions).toEqual(deviceActions);
  }
  return {session, journal, me, api, adapter, auth, clearLocalSave, firstHydration, holdHydration, arrive,
    stageScene, waitForHeldReads, exposeConflict, keepDeviceAndContinue};
}

describe('account autosave during initial private hydration', () => {
  it('retains startup scene progress until the divergent cloud save is explicitly chosen', async () => {
    const test = setup({delayedStartup: true});
    try {
      await test.waitForHeldReads();
      test.arrive('lighthouse_isle');
      await test.stageScene();
      expect(test.api.put).not.toHaveBeenCalled();
      await test.exposeConflict(test.firstHydration);
      await test.keepDeviceAndContinue();
    } finally { test.adapter.dispose(); }
  });

  it('keeps dirty device progress across logout and a different identity with delayed save and crew reads', async () => {
    const test = setup();
    let signingIn;
    try {
      await vi.waitFor(() => expect(test.adapter.read().account.canReroll).toBe(true));
      // Finish initial hydration before changing accounts; the empty cloud has no conflict.
      await test.adapter.signIn();
      test.arrive('lighthouse_isle');
      await test.adapter.signOut();
      await test.stageScene();
      expect(test.api.put).not.toHaveBeenCalled();
      const hold = test.holdHydration();
      Object.assign(test.me, {id: crypto.randomUUID(), captainName: 'Second Recorded Captain'});
      test.api.get.mockClear();
      signingIn = test.adapter.signIn();
      await test.waitForHeldReads();
      await test.stageScene('home_islet');
      expect(test.api.put).not.toHaveBeenCalled();
      // A stale conflict-choice intent cannot bypass the new identity's pending reconciliation.
      expect((await test.adapter.resolveSaveConflict('keep_this_device')).reason).toBe('not_ready');
      await test.exposeConflict(hold);
      expect((await signingIn).accepted).toBe(true);
      await test.keepDeviceAndContinue();
    } finally { test.adapter.dispose(); }
  });

  it('keeps Continue from selecting a new identity cloud replay before reconciliation and an explicit choice', async () => {
    const test=setup();
    let signingIn,continuing;
    try {
      await test.adapter.signIn();
      test.arrive('lighthouse_isle');
      await test.adapter.signOut();
      await test.stageScene();
      const hold=test.holdHydration();
      Object.assign(test.me,{id:crypto.randomUUID(),captainName:'Second Recorded Captain'});
      test.api.get.mockClear();
      signingIn=test.adapter.signIn();
      await test.waitForHeldReads();
      let result=null;
      continuing=test.adapter.continueGame().then(value=>{result=value;return value;});
      hold.save();
      await vi.waitFor(()=>expect(test.adapter.read().account.save.cloud.state).toBe('saved'));
      await settle();
      expect(result?.accepted??false).toBe(false);
      expect(test.adapter.read().continuation).toBeNull();
      expect(test.journal.actions).toEqual(deviceActions);
      expect(test.api.put).not.toHaveBeenCalled();
      expect(test.clearLocalSave).not.toHaveBeenCalled();

      hold.crew();
      expect((await continuing).reason).toBe('save_conflict');
      expect((await signingIn).accepted).toBe(true);
      expect(test.adapter.read().account.save.state).toBe('conflict');
      expect((await test.adapter.continueGame()).reason).toBe('save_conflict');
      expect(test.adapter.read().continuation).toBeNull();
      expect(test.journal.actions).toEqual(deviceActions);
      expect(test.api.put).not.toHaveBeenCalled();
      await test.keepDeviceAndContinue();
    } finally { test.adapter.dispose(); }
  });

  it('resumes a staged scene autosave after the current identity reconciles an empty cloud save', async () => {
    const test = setup({delayedStartup: true});
    try {
      await test.waitForHeldReads();
      test.arrive('lighthouse_isle');
      await test.stageScene();
      test.firstHydration.save({version: 7, data: {}, updatedAt: null});
      await settle();
      expect(test.api.put).not.toHaveBeenCalled();
      test.firstHydration.crew();
      await test.adapter.signIn();
      await test.stageScene('home_islet');
      expect(test.api.put).toHaveBeenCalledExactlyOnceWith('/api/save', {version: 7,
        data: {kind: 'intro', actions: deviceActions, place: 'lighthouse_isle'}});
      expect(test.adapter.read().account).toMatchObject({canContinue: true, save: {state: 'saved'}});
      expect(test.journal.actions).toEqual(deviceActions);
    } finally { test.adapter.dispose(); }
  });
});
