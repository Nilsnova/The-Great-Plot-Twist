// Autosaves read accepted journals off the frame loop and stop on hidden pages or disposal.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createAccountLifecycle} from '../src/online/case-adapter/account-lifecycle.js';

afterEach(() => vi.useRealTimers());
function setup() {
  vi.useFakeTimers();
  const document = new EventTarget();
  document.hidden = false;
  const state = {deviceSave: {data: {kind: 'intro', actions: ['to_desk'], place: 'lighthouse_isle'}},
    cloudSave: null, me: {place: 'lighthouse_isle'}};
  const journal = {version: 1, actions: ['to_desk']};
  const listeners = new Map();
  const saves = {stageReplay: vi.fn(async () => {}), tick: vi.fn(async () => {}), reconcile: vi.fn()};
  const read = vi.fn(() => JSON.stringify(journal));
  let signedIn = true;
  const lifecycle = createAccountLifecycle({state, document, saves, readLocalSave: read,
    session: {isSignedIn: () => signedIn}, store: {commit: patch => Object.assign(state, patch)},
    on: (name, callback) => { listeners.set(name, callback); return () => listeners.delete(name); }});
  return {lifecycle, document, state, journal, saves, read, setSignedIn:value=>{signedIn=value;},
    arrive: place => listeners.get('arrived')?.({place})};
}
describe('account journal lifecycle', () => {
  it('stages anonymous journal changes locally while leaving immediate cloud saves off',async()=>{
    const f=setup();
    try{
      f.setSignedIn(false);f.saves.stageReplay.mockResolvedValue({accepted:true});
      f.arrive('lighthouse_isle');f.arrive('saltreach_harbor');
      await vi.waitFor(()=>expect(f.saves.stageReplay).toHaveBeenCalledOnce());
      expect(f.saves.stageReplay).toHaveBeenCalledWith(
        {kind:'intro',actions:['to_desk'],place:'lighthouse_isle'},{immediate:false});
      expect(f.state.saveState).toBe('saved');
    }finally{f.lifecycle.dispose();}
  });
  it('reads and stages once per minute without work on a frame callback', async () => {
    const f = setup();
    try {
      expect(f.read).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(59999);
      expect(f.read).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(f.read).toHaveBeenCalledTimes(1);
      expect(f.saves.stageReplay).toHaveBeenCalledWith(
        {kind: 'intro', actions: ['to_desk'], place: 'lighthouse_isle'}, {immediate: false});
      expect(f.saves.tick).toHaveBeenCalledOnce();
    } finally { f.lifecycle.dispose(); }
  });
  it('skips bootstrap arrival and saves later scene changes immediately', async () => {
    const f = setup();
    try {
      f.arrive('lighthouse_isle');
      expect(f.saves.stageReplay).not.toHaveBeenCalled();
      f.state.deviceSave.data.kind = 'world';
      f.arrive('saltreach_harbor');
      expect(f.saves.stageReplay).toHaveBeenCalledWith(
        {kind: 'world', actions: ['to_desk'], place: 'saltreach_harbor'}, {immediate: true});
    } finally { f.lifecycle.dispose(); }
  });
  it('pauses the minute timer and scene writes while hidden', async () => {
    const f = setup();
    try {
      f.document.hidden = true;
      f.document.dispatchEvent(new Event('visibilitychange'));
      f.arrive('lighthouse_isle');f.arrive('saltreach_harbor');
      await vi.advanceTimersByTimeAsync(180000);
      expect(f.read).not.toHaveBeenCalled();
      f.document.hidden = false;
      f.document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(60000);
      expect(f.read).toHaveBeenCalledOnce();
    } finally { f.lifecycle.dispose(); }
  });
  it('adopts a cloud world place when the device has the identical move history', () => {
    const f = setup();
    try {
      f.state.cloudSave = {data: {kind: 'world', actions: ['to_desk'], place: 'saltreach_harbor'}};
      f.lifecycle.reconcile();
      expect(f.state.deviceSave.data).toEqual(f.state.cloudSave.data);
      expect(f.saves.reconcile).toHaveBeenCalledOnce();
    } finally { f.lifecycle.dispose(); }
  });
  it('treats a restarted or changed journal as an intro until the server confirms its ending', async () => {
    const f = setup();
    try {
      f.state.deviceSave.data.kind = 'world';
      f.journal.actions = [];
      await vi.advanceTimersByTimeAsync(60000);
      expect(f.saves.stageReplay).toHaveBeenCalledWith(
        {kind: 'intro', actions: [], place: 'lighthouse_isle'}, {immediate: false});
    } finally { f.lifecycle.dispose(); }
  });
  it('rejects malformed journals and removes its timer and scene subscription on disposal', async () => {
    const f = setup();
    f.journal.actions = ['INVALID ACTION'];
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.saves.stageReplay).not.toHaveBeenCalled();
    f.lifecycle.dispose();
    const reads = f.read.mock.calls.length;
    f.arrive('lighthouse_isle');f.arrive('saltreach_harbor');
    await vi.advanceTimersByTimeAsync(180000);
    expect(f.read).toHaveBeenCalledTimes(reads);
    expect(vi.getTimerCount()).toBe(0);
  });
});
