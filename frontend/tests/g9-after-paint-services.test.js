// After-paint composition uses real private ownership and controlled native event surfaces, without a browser or service.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {startAfterPaint} from '../src/shell/after-paint.js';
import {createSession} from '../src/online/session.js';
import {findPanelEntry} from '../src/online/panel-services.js';
const seams = vi.hoisted(() => ({festival: vi.fn(), arena: vi.fn(), title: vi.fn(), banner: vi.fn()}));
vi.mock('../src/shell/world-loader.js', () => ({loadFestivalModule: seams.festival}));
vi.mock('../src/online/arena-entry.js', () => ({createArenaEntry: seams.arena}));
vi.mock('../src/shell/title-input.js', () => ({startTitleInput: seams.title}));
vi.mock('../src/ui/connection-banner.js', () => ({createConnectionBanner: seams.banner}));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
class TrackedSurface extends EventTarget {
  listeners = new Map();
  addEventListener(type, listener, options) {
    super.addEventListener(type, listener, options);
    if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener, options) { super.removeEventListener(type, listener, options); this.listeners.get(type)?.delete(listener); }
  listenerCount(type) { return this.listeners.get(type)?.size ?? 0; }
}
function dialog(open = true) { return {open, matches: selector => selector === '.duel-modal'}; }
function surface() {
  const target = new TrackedSurface(); let current = null;
  target.append = vi.fn();
  target.querySelector = vi.fn(selector => selector === '.duel-modal' ? current
    : selector === '.duel-modal[open]' && current?.open ? current : null);
  target.setDialog = element => { current = element; };
  target.nativeClose = element => {
    const event = new Event('close');
    // EventTarget has no ancestor tree: supply the native event's descendant target at the capture boundary.
    Object.defineProperty(event, 'target', {value: element}); target.dispatchEvent(event);
  };
  return target;
}
function key({code = 'Escape', repeat = false, prevented = false} = {}) {
  const event = new Event('keydown', {cancelable: true});
  Object.defineProperties(event, {code: {value: code}, repeat: {value: repeat}});
  if (prevented) event.preventDefault();
  window.dispatchEvent(event); return event;
}
function arenaFixture() {
  const state = {pending: false, active: false, disposed: false};
  const arena = {
    get pending() { return !state.disposed && state.pending; },
    get active() { return !state.disposed && (state.pending || state.active); },
    open: vi.fn(() => { if (!state.disposed) state.pending = true; }),
    close: vi.fn(() => { state.pending = state.active = false; }),
    dispose: vi.fn(() => { state.disposed = true; state.pending = state.active = false; }),
  };
  return {state, arena};
}
function festivalFixture() {
  const state = {available: true, active: false};
  const entry = {get available() { return state.available; }, get active() { return state.active; },
    check: vi.fn(async () => state.available), open: vi.fn(() => { state.active = true; }),
    close: vi.fn(() => { state.active = false; }), dispose: vi.fn(() => { state.active = false; })};
  return {state, entry, createFestivalEntry: vi.fn(() => entry)};
}
const fixtures = [];
function setup() {
  const session = createSession(); session.setToken(`fixture-${crypto.randomUUID()}`);
  const container = surface(), imported = deferred(), ring = arenaFixture(), festival = festivalFixture();
  const title = {dispose: vi.fn()}, banner = {element: {}, update: vi.fn(), dispose: vi.fn()};
  const stopAdapter = vi.fn(), runtime = {resetInput: vi.fn()}, focus = vi.fn(), openAccount = vi.fn();
  let adapterListener = null, applicationDisposed = false;
  const initial = {connection: 'fixture'};
  const adapter = {read: vi.fn(() => initial), subscribe: vi.fn(listener => { adapterListener = listener; return stopAdapter; })};
  seams.arena.mockReturnValue(ring.arena); seams.title.mockReturnValue(title); seams.banner.mockReturnValue(banner);
  seams.festival.mockImplementation(() => {
    expect(findPanelEntry(session, 'arena')).toBe(ring.arena); return imported.promise;
  });
  const ctx = {session, container, adapter, focus, openAccount, runtime: () => runtime,
    shell: () => ({mode: 'title'}), caption: vi.fn(), send: vi.fn(), isLoading: () => false,
    isDisposed: () => applicationDisposed};
  const background = startAfterPaint(ctx);
  const fixture = {session, container, imported, ...ring, festival, title, banner, stopAdapter, runtime, focus, openAccount, ctx, background,
    updateAdapter: view => adapterListener({view}), appDisposed: () => { applicationDisposed = true; }};
  fixtures.push(fixture); return fixture;
}
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('window', new TrackedSurface()); });
afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.background.dispose(); expect(findPanelEntry(fixture.session, 'arena')).toBeNull();
  }
  vi.unstubAllGlobals();
});

describe('after-paint private presentation composition', () => {
  it('retains Account navigation and the shared arena getter when the optional festival chunk fails', async () => {
    const f = setup(); f.imported.reject(new Error(`fixture-${crypto.randomUUID()}`));
    const facade = await f.background.festivalReady;
    expect(facade).not.toBeNull(); expect(facade.available).toBe(false); expect(await facade.check()).toBe(false);
    facade.openAccount(); expect(f.openAccount).toHaveBeenCalledOnce();
    f.state.pending = true; expect(facade.active).toBe(true); f.state.pending = false; expect(facade.active).toBe(false);
    f.state.active = true; expect(facade.active).toBe(true); facade.close(); expect(f.arena.close).toHaveBeenCalledOnce();
    expect(facade.active).toBe(false); expect(f.festival.createFestivalEntry).not.toHaveBeenCalled();
  });

  it('injects G13 openDuel into the exact registry owner and forwards the private Account callback', async () => {
    const f = setup(); f.imported.resolve(f.festival); const facade = await f.background.festivalReady;
    const context = f.festival.createFestivalEntry.mock.calls[0][0], owner = findPanelEntry(f.session, 'arena');
    expect(owner).toBe(f.arena); expect(seams.arena).toHaveBeenCalledOnce();
    expect(seams.arena.mock.calls[0][0].session).toBe(f.session);
    const duelId = crypto.randomUUID(); context.openDuel(duelId);
    expect(owner.open).toHaveBeenCalledExactlyOnceWith(duelId); expect(facade.active).toBe(true);
    expect(context.openAccount).toBe(f.openAccount); context.openAccount(); expect(f.openAccount).toHaveBeenCalledOnce();
    const arenaContext = seams.arena.mock.calls[0][0]; arenaContext.onSignIn();
    expect(f.arena.close).toHaveBeenCalledOnce(); expect(f.openAccount).toHaveBeenCalledTimes(2);
    arenaContext.resetInput(); expect(f.runtime.resetInput).toHaveBeenCalledOnce();
    f.festival.state.active = true; expect(facade.active).toBe(true);
    facade.close(); expect(f.festival.entry.close).toHaveBeenCalledOnce();
  });

  it('cancels a pending no-dialog Escape and lets the existing native dialog own reveal Escape', async () => {
    const f = setup(); f.state.pending = true;
    for (const options of [{code: 'Enter'}, {repeat: true}, {prevented: true}]) key(options);
    expect(f.arena.close).not.toHaveBeenCalled();
    const event = key(); expect(event.defaultPrevented).toBe(true); expect(f.arena.close).toHaveBeenCalledOnce();
    expect(f.runtime.resetInput).toHaveBeenCalledOnce(); expect(f.focus).toHaveBeenCalledOnce();
    f.state.pending = true; const native = dialog(true); f.container.setDialog(native);
    const revealEscape = key(); expect(revealEscape.defaultPrevented).toBe(false);
    expect(f.arena.close).toHaveBeenCalledOnce(); expect(f.state.pending).toBe(true);
    f.container.nativeClose(native); expect(f.arena.close).toHaveBeenCalledOnce();
  });

  it('cancels a held detail only after the current dialog actually closes', () => {
    const f = setup(), native = dialog(true); f.state.pending = true; f.container.setDialog(native);
    f.container.nativeClose(native); expect(f.arena.close).not.toHaveBeenCalled();
    native.open = false; f.container.nativeClose(native);
    expect(f.arena.close).toHaveBeenCalledOnce(); expect(f.arena.active).toBe(false);
    f.container.nativeClose(native); expect(f.arena.close).toHaveBeenCalledOnce();
  });

  it('ignores a delayed removed-dialog close rather than cancelling its replacement', () => {
    const f = setup(), old = dialog(false), replacement = dialog(false);
    f.state.pending = true; f.container.setDialog(replacement); f.container.nativeClose(old);
    expect(f.arena.close).not.toHaveBeenCalled(); expect(f.arena.pending).toBe(true);
    f.container.nativeClose(replacement); expect(f.arena.close).toHaveBeenCalledOnce();
  });

  it.each(['resolve', 'reject'])('cleans up before the optional module %s and prevents late festival construction', async finish => {
    const f = setup(); f.state.pending = true; f.background.dispose(); f.background.dispose();
    expect(findPanelEntry(f.session, 'arena')).toBeNull();
    f.imported[finish](finish === 'resolve' ? f.festival : new Error(`fixture-${crypto.randomUUID()}`));
    expect(await f.background.festivalReady).toBeNull(); expect(f.festival.createFestivalEntry).not.toHaveBeenCalled();
    expect(f.title.dispose).toHaveBeenCalledOnce(); expect(f.banner.dispose).toHaveBeenCalledOnce(); expect(f.stopAdapter).toHaveBeenCalledOnce();
    expect(window.listenerCount('keydown')).toBe(0); expect(f.container.listenerCount('close')).toBe(0);
    f.state.pending = true; const calls = f.arena.close.mock.calls.length;
    key(); f.container.setDialog(dialog(false)); f.container.nativeClose(f.container.querySelector('.duel-modal'));
    expect(f.arena.close).toHaveBeenCalledTimes(calls);
  });

  it('disposes an adopted festival and removes callbacks/listeners without disturbing another explicit session', async () => {
    const f = setup(); f.imported.resolve(f.festival); const facade = await f.background.festivalReady;
    f.updateAdapter({connection: 'later'}); expect(f.banner.update).toHaveBeenLastCalledWith({connection: 'later'});
    const other = setup(); other.imported.reject(new Error('Optional fixture failure')); const otherFacade = await other.background.festivalReady;
    other.state.pending = true; f.background.dispose(); facade.openAccount(); facade.open();
    expect(f.openAccount).not.toHaveBeenCalled(); expect(f.festival.entry.open).not.toHaveBeenCalled();
    expect(f.festival.entry.dispose).toHaveBeenCalledOnce(); expect(facade.active).toBe(false);
    expect(findPanelEntry(f.session, 'arena')).toBeNull(); expect(findPanelEntry(other.session, 'arena')).toBe(other.arena);
    expect(otherFacade.active).toBe(true); otherFacade.openAccount(); expect(other.openAccount).toHaveBeenCalledOnce();
  });

  it('disposes a newly constructed protected entry if composition shuts down during construction', async () => {
    const f = setup(); f.festival.createFestivalEntry.mockImplementationOnce(() => {
      f.background.dispose(); return f.festival.entry;
    });
    f.imported.resolve(f.festival); expect(await f.background.festivalReady).toBeNull();
    expect(f.festival.entry.dispose).toHaveBeenCalledOnce(); expect(findPanelEntry(f.session, 'arena')).toBeNull();
  });

  it('does not construct an optional protected entry after its application reports disposal', async () => {
    const f = setup(); f.appDisposed(); f.imported.resolve(f.festival);
    expect(await f.background.festivalReady).toBeNull(); expect(f.festival.createFestivalEntry).not.toHaveBeenCalled();
  });
});
