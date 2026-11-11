// The host wires the islet to the game: it picks the transport, opens the panel on a plot click and tells the world what stands.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {attachIsletPanel} from '../src/screens/islet/host.js';
import {createIsletAdapter} from '../src/screens/islet/adapter.js';
import {createFakeIsletTransport} from '../src/screens/islet/fake-transport.js';

// A tiny event bus with the same on/emit shape as src/core/events.js, so each test starts clean.
function createBus() {
  const listeners = new Map();
  return {
    on(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
      return () => listeners.get(type).delete(listener);
    },
    emit(event) { for (const listener of [...(listeners.get(event.type) ?? [])]) listener(event); },
    count: type => listeners.get(type)?.size ?? 0,
  };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};

// A stand-in for panel.js, so these tests need no DOM.
function fakePanelModule() {
  const panel = {
    opened: [], closed: 0, disposed: 0, active: false,
    open(plot) { this.opened.push(plot); this.active = true; },
    close() { this.closed += 1; this.active = false; },
    dispose() { this.disposed += 1; this.active = false; },
  };
  const contexts = [];
  const loadPanel = vi.fn(async () => ({createIsletPanel(context) { contexts.push(context); return panel; }}));
  return {panel, contexts, loadPanel};
}

function attach(options = {}) {
  const bus = createBus();
  const module = fakePanelModule();
  const changes = [];
  bus.on('islet_changed', event => changes.push(event));
  const context = {container: {id: 'game'}, on: bus.on, emit: bus.emit, resetInput: vi.fn(), focus: vi.fn(), loadPanel: module.loadPanel, search: '', dev: false, ...options};
  const stop = attachIsletPanel(context);
  return {bus, stop, changes, context, ...module};
}
const click = (bus, plot) => bus.emit({type: 'plot_clicked', plot});
const arrive = (bus, place) => bus.emit({type: 'arrived', place});

afterEach(() => {
  vi.unstubAllGlobals();
  delete globalThis.__isletLocal;
});

describe('factory-owned shared islet adapter', () => {
  it('does not announce or call the private projection after an earlier shared observer stops the host', async () => {
    const shared = createIsletAdapter({transport: createFakeIsletTransport(), mode: 'live'}), onView = vi.fn();
    let f; const unsubscribe = shared.subscribe(event => { if (event.answered) f.stop(); });
    f = attach({suppliedAdapter: shared, onView});
    try {
      expect(await f.stop.refresh()).toMatchObject({accepted: false, code: 'disposed'});
      expect(f.changes).toEqual([]); expect(onView).not.toHaveBeenCalled();
    } finally { f.stop(); unsubscribe(); shared.dispose(); }
  });
  it('does not run the private projection when an accepted world event synchronously stops the host', async () => {
    const onView = vi.fn(), f = attach({transport: createFakeIsletTransport(), onView});
    f.bus.on('islet_changed', () => f.stop());
    try {
      await f.stop.refresh(); expect(f.changes).toHaveLength(1); expect(onView).not.toHaveBeenCalled();
    } finally { f.stop(); }
  });
  it('uses the supplied instance while leaving its reset and disposal to the factory', async () => {
    const shared = createIsletAdapter({transport: createFakeIsletTransport(), mode: 'live'});
    const reset = vi.spyOn(shared, 'resetPrivate'), dispose = vi.spyOn(shared, 'dispose'), privateReset = vi.fn();
    let identity;
    const stopped = vi.fn(), f = attach({suppliedAdapter: shared, onPrivateReset: privateReset,
      onSessionChange: listener => { identity = listener; return stopped; }});
    try {
      await f.stop.refresh(); await f.stop.open('plot_2');
      expect(f.contexts[0].adapter).toBe(shared);
      identity({signedIn: false});
      expect(f.panel.disposed).toBe(1); expect(f.stop.active).toBe(false);
      expect(reset).not.toHaveBeenCalled(); expect(privateReset).toHaveBeenCalledOnce();
      f.stop(); expect(dispose).not.toHaveBeenCalled(); expect(stopped).toHaveBeenCalledOnce();
      expect(shared.read().spots).toHaveLength(5);
      shared.resetPrivate(); expect(shared.read().spots).toEqual([]);
    } finally { f.stop(); shared.dispose(); }
  });
  it('lets an explicit dev local rehearsal own its fake instead of adopting the supplied live instance', async () => {
    const shared = createIsletAdapter({transport: createFakeIsletTransport(), mode: 'live'});
    const read = vi.spyOn(shared, 'refresh'), reset = vi.spyOn(shared, 'resetPrivate'), dispose = vi.spyOn(shared, 'dispose');
    const f = attach({suppliedAdapter: shared, dev: true, search: '?islet=local',
      loadFake: async () => ({createFakeIsletTransport}), canAsk: () => false});
    try {
      await f.stop.refresh(); await f.stop.open('plot_2');
      expect(f.contexts[0].adapter).not.toBe(shared); expect(f.contexts[0].adapter.read().mode).toBe('local');
      expect(read).not.toHaveBeenCalled(); expect(reset).not.toHaveBeenCalled();
      f.stop(); expect(dispose).not.toHaveBeenCalled(); expect(globalThis.__isletLocal).toBeUndefined();
    } finally { f.stop(); shared.dispose(); }
  });
  it('publishes only an accepted read snapshot to the private callback without changing the world event', async () => {
    const onView = vi.fn(({view}) => { view.coins = 0; view.spots.length = 0; });
    const f = attach({transport: createFakeIsletTransport(), onView});
    try {
      await f.stop.refresh();
      expect(onView).toHaveBeenCalledOnce(); expect(onView.mock.calls[0][0].answered).toBe(true);
      expect(f.changes).toEqual([{type: 'islet_changed', built: ['plot_1'], signalStationBuilt: false}]);
      await f.stop.open('plot_2'); expect(f.contexts[0].adapter.read().coins).toBe(1000);
      expect(f.contexts[0].adapter.read().spots).toHaveLength(5);
    } finally { f.stop(); }
  });
});

describe('opening the panel', () => {
  it('counts a pending import as active and cancels it through close before a late panel can open', async () => {
    const slow = deferred(), module = fakePanelModule();
    const f = attach({transport: createFakeIsletTransport(), loadPanel: () => slow.promise});
    try {
      const opening = f.stop.open('plot_2'); expect(f.stop.active).toBe(true);
      expect(f.stop.close()).toBe(true); expect(f.stop.active).toBe(false);
      slow.resolve({createIsletPanel(context) { module.contexts.push(context); return module.panel; }});
      expect(await opening).toBe(false); expect(module.contexts).toEqual([]); expect(module.panel.opened).toEqual([]);
      expect(f.stop.active).toBe(false); expect(f.stop.close()).toBe(false);
    } finally { f.stop(); }
  });
  it('loads the panel once and opens it at the plot that was clicked', async () => {
    const {bus, loadPanel, panel} = attach({transport: createFakeIsletTransport()});
    click(bus, 'plot_2');
    await settle();
    click(bus, 'plot_3');
    await settle();
    expect(loadPanel).toHaveBeenCalledTimes(1);
    expect(panel.opened).toEqual(['plot_2', 'plot_3']);
  });

  it('gives the panel the container, the game callbacks and an adapter', async () => {
    const {bus, context, contexts} = attach({transport: createFakeIsletTransport()});
    click(bus, 'plot_2');
    await settle();
    expect(contexts[0]).toMatchObject({container: context.container, resetInput: context.resetInput, focus: context.focus});
    expect(contexts[0].adapter.read().mode).toBe('live');
  });

  it('opens only the last click when two clicks come before the panel has loaded', async () => {
    const {bus, panel} = attach({transport: createFakeIsletTransport()});
    click(bus, 'plot_2');
    click(bus, 'plot_3');
    await settle();
    expect(panel.opened).toEqual(['plot_3']);
  });

  it('opens the panel at the signal station hotspot too, since the finale screen left with the mystery', async () => {
    const {bus, loadPanel, panel} = attach({transport: createFakeIsletTransport()});
    click(bus, 'islet_signal_station');
    await settle();
    expect(loadPanel).toHaveBeenCalledOnce();
    expect(panel.opened).toEqual(['islet_signal_station']);
  });

  it('closes the panel when the player travels', async () => {
    const {bus, panel} = attach({transport: createFakeIsletTransport()});
    click(bus, 'plot_2');
    await settle();
    bus.emit({type: 'travel', to: 'saltreach_harbor'});
    expect(panel.closed).toBe(1);
  });

  it('does not open a panel that was still loading when the player travelled', async () => {
    const slow = deferred();
    const {bus, panel, contexts} = attach({transport: createFakeIsletTransport(), loadPanel: () => slow.promise});
    click(bus, 'plot_2');
    bus.emit({type: 'travel', to: 'saltreach_harbor'});
    slow.resolve({createIsletPanel(context) { contexts.push(context); return panel; }});
    await settle();
    expect(panel.opened).toEqual([]);
  });

  it('logs a panel that failed to load and tries again on the next click', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const module = fakePanelModule();
    const loadPanel = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation(module.loadPanel);
    const {bus} = attach({transport: createFakeIsletTransport(), loadPanel});
    click(bus, 'plot_2');
    await settle();
    expect(error).toHaveBeenCalledTimes(1);
    expect(module.panel.opened).toEqual([]);
    click(bus, 'plot_2');
    await settle();
    expect(loadPanel).toHaveBeenCalledTimes(2);
    expect(module.panel.opened).toEqual(['plot_2']);
    error.mockRestore();
  });
});

describe('stop.active', () => {
  it('is false until a panel has been opened', () => {
    const {stop} = attach({transport: createFakeIsletTransport()});
    expect(stop.active).toBe(false);
  });

  it('is true while the panel is open, so game.js can count it as an overlay', async () => {
    const {bus, stop} = attach({transport: createFakeIsletTransport()});
    click(bus, 'plot_2');
    await settle();
    expect(stop.active).toBe(true);
  });

  it('is false again after the player travels', async () => {
    const {bus, stop} = attach({transport: createFakeIsletTransport()});
    click(bus, 'plot_2');
    await settle();
    bus.emit({type: 'travel', to: 'saltreach_harbor'});
    expect(stop.active).toBe(false);
  });

  it('is false after stop', async () => {
    const {bus, stop} = attach({transport: createFakeIsletTransport()});
    click(bus, 'plot_2');
    await settle();
    stop();
    expect(stop.active).toBe(false);
  });
});

describe('arriving at the home islet', () => {
  it('refreshes the islet from the server', async () => {
    const transport = {get: vi.fn(async () => ({ok: true, status: 200, data: (await createFakeIsletTransport().get('/api/islet')).data})), post: vi.fn()};
    const {bus} = attach({transport});
    arrive(bus, 'home_islet');
    await settle();
    expect(transport.get).toHaveBeenCalledTimes(1);
    expect(transport.get).toHaveBeenCalledWith('/api/islet');
  });

  it('ignores arrivals at every other place', async () => {
    const transport = {get: vi.fn(), post: vi.fn()};
    const {bus} = attach({transport});
    arrive(bus, 'saltreach_harbor');
    await settle();
    expect(transport.get).not.toHaveBeenCalled();
  });

  it('does not ask the server on arrival while canAsk says nobody is signed in, so sailing home starts no sign-in prompt', async () => {
    const transport = {get: vi.fn(), post: vi.fn()};
    const {bus} = attach({transport, canAsk: () => false});
    arrive(bus, 'home_islet');
    await settle();
    expect(transport.get).not.toHaveBeenCalled();
  });

  it('asks on the next arrival once canAsk says the player is signed in', async () => {
    let signedIn = false;
    const get = vi.fn(async () => ({ok: true, status: 200, data: (await createFakeIsletTransport().get('/api/islet')).data}));
    const {bus} = attach({transport: {get, post: vi.fn()}, canAsk: () => signedIn});
    arrive(bus, 'home_islet');
    await settle();
    expect(get).not.toHaveBeenCalled();
    signedIn = true;
    arrive(bus, 'home_islet');
    await settle();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('asks on arrival when canAsk is not given', async () => {
    const get = vi.fn(async () => ({ok: true, status: 200, data: (await createFakeIsletTransport().get('/api/islet')).data}));
    const {bus} = attach({transport: {get, post: vi.fn()}});
    arrive(bus, 'home_islet');
    await settle();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('still opens the panel on a click while canAsk is false, because the player asked for it', async () => {
    const {bus, panel} = attach({transport: createFakeIsletTransport(), canAsk: () => false});
    click(bus, 'plot_2');
    await settle();
    expect(panel.opened).toEqual(['plot_2']);
  });

  it('leaves the local rehearsal alone: the fake answers on arrival whatever canAsk says', async () => {
    const {bus, changes} = attach({dev: true, search: '?islet=local', canAsk: () => false});
    arrive(bus, 'home_islet');
    await vi.waitFor(() => expect(changes).toHaveLength(1));
    expect(changes[0]).toEqual({type: 'islet_changed', built: ['plot_1'], signalStationBuilt: false});
  });
});

describe('telling the world what stands', () => {
  it('emits islet_changed with the built plots after a good answer', async () => {
    const {bus, changes} = attach({transport: createFakeIsletTransport()});
    arrive(bus, 'home_islet');
    await vi.waitFor(() => expect(changes).toHaveLength(1));
    expect(changes[0]).toEqual({type: 'islet_changed', built: ['plot_1'], signalStationBuilt: false});
  });

  it('emits it again after a build, with the station on the list', async () => {
    const {bus, changes, contexts} = attach({transport: createFakeIsletTransport()});
    click(bus, 'plot_2');
    await settle();
    const {adapter} = contexts[0];
    await adapter.refresh();
    await adapter.build('islet_signal_station');
    expect(changes.at(-1)).toEqual({type: 'islet_changed', built: ['plot_1', 'islet_signal_station'], signalStationBuilt: true});
  });

  it('emits nothing for a failed answer', async () => {
    const fake = createFakeIsletTransport();
    fake.dev.failNext('network');
    const {bus, changes} = attach({transport: fake});
    arrive(bus, 'home_islet');
    await settle();
    expect(changes).toEqual([]);
  });

  it('never emits it in unavailable mode', async () => {
    const {bus, changes, contexts} = attach();
    arrive(bus, 'home_islet');
    click(bus, 'plot_2');
    await settle();
    await contexts[0].adapter.refresh();
    expect(changes).toEqual([]);
  });

  it('sends no request at all in unavailable mode', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const {bus, contexts} = attach();
    arrive(bus, 'home_islet');
    click(bus, 'plot_2');
    await settle();
    await contexts[0].adapter.build('plot_2');
    expect(fetch).not.toHaveBeenCalled();
    expect(contexts[0].adapter.read().mode).toBe('unavailable');
  });
});

describe('choosing the transport', () => {
  const modeAfterClick = async options => {
    const {bus, contexts, ...rest} = attach(options);
    click(bus, 'plot_2');
    await vi.waitFor(() => expect(contexts).toHaveLength(1));
    return {mode: contexts[0].adapter.read().mode, contexts, ...rest};
  };

  it('uses the local fake in a dev build with ?islet=local', async () => {
    const {mode, contexts} = await modeAfterClick({dev: true, search: '?islet=local'});
    expect(mode).toBe('local');
    await contexts[0].adapter.refresh();
    expect(contexts[0].adapter.read()).toMatchObject({status: 'ready', coins: 1000, timber: 20});
  });

  it('uses the given transport in live mode', async () => {
    const transport = createFakeIsletTransport();
    const {mode} = await modeAfterClick({transport});
    expect(mode).toBe('live');
  });

  it('ignores ?islet=local in a build that is not a dev build, and never loads the fake', async () => {
    const loadFake = vi.fn();
    const {mode} = await modeAfterClick({transport: createFakeIsletTransport(), dev: false, search: '?islet=local', loadFake});
    expect(mode).toBe('live');
    expect(loadFake).not.toHaveBeenCalled();
  });

  it('prefers the local fake over a given transport when a dev build asks for it', async () => {
    const transport = {get: vi.fn(), post: vi.fn()};
    const {mode, contexts} = await modeAfterClick({transport, dev: true, search: '?islet=local'});
    await contexts[0].adapter.refresh();
    expect(mode).toBe('local');
    expect(transport.get).not.toHaveBeenCalled();
  });

  it('ignores any other value of the islet parameter', async () => {
    const {mode} = await modeAfterClick({transport: createFakeIsletTransport(), dev: true, search: '?islet=remote'});
    expect(mode).toBe('live');
  });

  it('is unavailable with no transport and no flag', async () => {
    expect((await modeAfterClick({})).mode).toBe('unavailable');
  });

  it('is unavailable when ?islet=local comes without a dev build and without a transport', async () => {
    expect((await modeAfterClick({dev: false, search: '?islet=local'})).mode).toBe('unavailable');
  });

  it('offers the dev helpers of the fake in local mode and takes them away on stop', async () => {
    const {stop} = await modeAfterClick({dev: true, search: '?islet=local'});
    await vi.waitFor(() => expect(globalThis.__isletLocal).toBeDefined());
    expect(typeof globalThis.__isletLocal.dev.failNext).toBe('function');
    stop();
    expect(globalThis.__isletLocal).toBeUndefined();
  });
});

describe('stop', () => {
  it('stops listening to every event', () => {
    const {bus, stop} = attach({transport: createFakeIsletTransport()});
    stop();
    expect([bus.count('plot_clicked'), bus.count('travel'), bus.count('arrived')]).toEqual([0, 0, 0]);
  });

  it('disposes the panel and the adapter', async () => {
    const {bus, stop, panel, contexts} = attach({transport: createFakeIsletTransport()});
    click(bus, 'plot_2');
    await settle();
    stop();
    expect(panel.disposed).toBe(1);
    expect(await contexts[0].adapter.refresh()).toMatchObject({accepted: false, code: 'disposed'});
  });

  it('does nothing when called a second time', async () => {
    const {bus, stop, panel} = attach({transport: createFakeIsletTransport()});
    click(bus, 'plot_2');
    await settle();
    stop();
    stop();
    expect(panel.disposed).toBe(1);
  });

  it('never creates a panel that finished loading after stop', async () => {
    const slow = deferred();
    const {bus, stop, contexts, panel} = attach({transport: createFakeIsletTransport(), loadPanel: () => slow.promise});
    click(bus, 'plot_2');
    stop();
    slow.resolve({createIsletPanel(context) { contexts.push(context); return panel; }});
    await settle();
    expect(contexts).toEqual([]);
  });

  it('stops telling the world what stands', async () => {
    const {bus, stop, changes} = attach({transport: createFakeIsletTransport()});
    stop();
    arrive(bus, 'home_islet');
    await settle();
    expect(changes).toEqual([]);
  });
});

describe('explicit refresh, navigation and private identity boundaries', () => {
  it('reads startup state and opens the station directly without inventing arrival or plot events', async () => {
    const transport = {get: vi.fn(path => createFakeIsletTransport().get(path)), post: vi.fn()};
    const f = attach({transport}), arrival = vi.fn(), plot = vi.fn();
    f.bus.on('arrived', arrival); f.bus.on('plot_clicked', plot);
    try {
      expect((await f.stop.refresh()).accepted).toBe(true);
      expect(transport.get).toHaveBeenCalledExactlyOnceWith('/api/islet');
      expect(f.changes).toEqual([{type: 'islet_changed', built: ['plot_1'], signalStationBuilt: false}]);
      expect(f.loadPanel).not.toHaveBeenCalled();
      expect(await f.stop.open()).toBe(true);
      expect(f.panel.opened).toEqual(['islet_signal_station']);
      expect(arrival).not.toHaveBeenCalled(); expect(plot).not.toHaveBeenCalled();
      expect(f.stop.active).toBe(true);
    } finally { f.stop(); }
  });

  it('gates silent live refreshes and shares an overlapping current-identity startup read', async () => {
    let signedIn = false;
    const wait = deferred(), transport = {get: vi.fn(() => wait.promise), post: vi.fn()};
    const f = attach({transport, canAsk: () => signedIn});
    try {
      expect(await f.stop.refresh()).toMatchObject({accepted: false, code: 'sign_in_required'});
      expect(transport.get).not.toHaveBeenCalled();
      signedIn = true;
      const first = f.stop.refresh(), second = f.stop.refresh();
      expect(second).toBe(first); expect(transport.get).toHaveBeenCalledTimes(1);
      wait.resolve(await createFakeIsletTransport().get('/api/islet'));
      expect((await first).accepted).toBe(true); expect(f.changes).toHaveLength(1);
    } finally { f.stop(); }
  });

  it('disposes private panel data, blocks an old read and keeps the next identity refresh independent', async () => {
    const answer = await createFakeIsletTransport().get('/api/islet'), old = deferred(), fresh = deferred();
    const transport = {get: vi.fn().mockResolvedValueOnce(answer)
      .mockImplementationOnce(() => old.promise).mockImplementationOnce(() => fresh.promise), post: vi.fn()};
    let signedIn = true, changed;
    const unsubscribe = vi.fn(), onPrivateReset = vi.fn();
    const f = attach({transport, canAsk: () => signedIn, onPrivateReset,
      onSessionChange(listener) { changed = listener; return unsubscribe; }});
    try {
      await f.stop.open('plot_2'); await f.stop.refresh();
      const adapter = f.contexts[0].adapter, revision = adapter.read().revision;
      expect(adapter.read().coins).toBe(1000); f.changes.length = 0;
      const oldRead = f.stop.refresh();
      signedIn = false; changed({signedIn: false});
      expect(f.panel.disposed).toBe(1); expect(f.stop.active).toBe(false);
      expect(adapter.read()).toMatchObject({coins: null, timber: null, spots: [], notice: null, busyPlot: null});
      expect(adapter.read().revision).toBeGreaterThan(revision); expect(f.changes).toEqual([]);
      signedIn = true; changed({signedIn: true}); const nextRead = f.stop.refresh();
      expect(transport.get).toHaveBeenCalledTimes(3);
      old.resolve(answer);
      expect(await oldRead).toMatchObject({accepted: false, code: 'session_expired'});
      expect(f.stop.refresh()).toBe(nextRead); expect(transport.get).toHaveBeenCalledTimes(3);
      const current = structuredClone(answer); current.data.coins = 27; fresh.resolve(current);
      expect((await nextRead).accepted).toBe(true); expect(adapter.read().coins).toBe(27);
      expect(f.changes).toEqual([{type: 'islet_changed', built: ['plot_1'], signalStationBuilt: false}]);
      expect(onPrivateReset).toHaveBeenCalledTimes(2);
      await f.stop.open(); expect(f.contexts).toHaveLength(2);
      f.stop(); expect(unsubscribe).toHaveBeenCalledTimes(1);
      const reads = transport.get.mock.calls.length; changed({signedIn: true});
      expect(transport.get).toHaveBeenCalledTimes(reads);
    } finally { f.stop(); }
  });

  it('cancels a pending panel chunk on identity change and never opens after stop', async () => {
    const wait = deferred(), module = fakePanelModule(); let changed;
    const f = attach({transport: createFakeIsletTransport(), loadPanel: () => wait.promise,
      canAsk: () => false, onSessionChange(listener) { changed = listener; return () => {}; }});
    try {
      const opening = f.stop.open(); changed({signedIn: false});
      wait.resolve({createIsletPanel(context) { module.contexts.push(context); return module.panel; }});
      expect(await opening).toBe(false); expect(module.contexts).toEqual([]);
      f.stop(); expect(await f.stop.open()).toBe(false);
      expect(await f.stop.refresh()).toMatchObject({accepted: false, code: 'disposed'});
    } finally { f.stop(); }
  });

  it.each([{dev: true, search: '?islet=local'}, {dev: false, search: ''}])
  ('keeps local and unavailable modes independent of real auth events: %j', async options => {
    const onSessionChange = vi.fn(), onPrivateReset = vi.fn();
    const f = attach({...options, onSessionChange, onPrivateReset, canAsk: () => false});
    try {
      await f.stop.refresh();
      expect(onSessionChange).not.toHaveBeenCalled(); expect(onPrivateReset).not.toHaveBeenCalled();
      if (options.dev) expect(f.changes).toHaveLength(1); else expect(f.changes).toEqual([]);
    } finally { f.stop(); }
  });
});

describe('with the islands on (isOff)', () => {
  it('never reads GET /api/islet and never opens the old panel while the island game owns home_islet', async () => {
    const reads = [];
    const transport = {get: vi.fn(async path => { reads.push(path); return {ok: true, status: 200, data: {}}; }), post: vi.fn()};
    let off = true;
    const {bus, stop, loadPanel, panel} = attach({transport, isOff: () => off});
    arrive(bus, 'home_islet');
    click(bus, 'islet_signal_station');
    expect(await stop.refresh()).toMatchObject({accepted: false, code: 'feature_off'});
    expect(await stop.open()).toBe(false);
    await settle();
    expect(reads).toEqual([]);
    expect(loadPanel).not.toHaveBeenCalled();
    expect(panel.opened).toEqual([]);
    // The flag off again: the old islet works as before.
    off = false;
    arrive(bus, 'home_islet');
    await settle();
    expect(reads.length).toBeGreaterThan(0);
    stop();
  });
});
