// The islet adapter maps two intents to the two routes, keeps one click id per build, and never decides a rule.
import {describe, expect, it, vi} from 'vitest';
import {createIsletAdapter} from '../src/screens/islet/adapter.js';
import {createFakeIsletTransport} from '../src/screens/islet/fake-transport.js';

const ISLET = '/api/islet';
const BUILD = '/api/islet/build';
const STATION = 'islet_signal_station';
const SIGN_IN_AGAIN = {ok: false, status: 401, code: 'unauthorized', message: 'Please sign in again.'};

// Wraps a transport so a test can see every request it was asked to send.
function watch(transport) {
  const calls = [];
  return {
    calls,
    get: path => { calls.push({method: 'GET', path}); return transport.get(path); },
    post: (path, body) => { calls.push({method: 'POST', path, body}); return transport.post(path, body); },
    posts: () => calls.filter(call => call.method === 'POST'),
    gets: () => calls.filter(call => call.method === 'GET'),
  };
}
function counter() {
  let count = 0;
  return () => `click-${String(++count).padStart(4, '0')}`;
}
function setup(mode = 'live') {
  const fake = createFakeIsletTransport({now: () => new Date('2026-11-16T10:00:00Z')});
  const transport = watch(fake);
  const adapter = createIsletAdapter({transport, mode, makeUid: counter()});
  return {fake, transport, adapter};
}
const spotOf = (adapter, plot) => adapter.read().spots.find(spot => spot.plot === plot);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};

describe('the view', () => {
  it('starts with the documented shape and nothing known yet', () => {
    const {adapter} = setup();
    expect(adapter.read()).toMatchObject({
      schema: 1, mode: 'live', status: 'loading', busyPlot: null, coins: null, timber: null, signalStationBuilt: false, spots: [], notice: null, revision: 0,
    });
  });

  it('is a copy, so changing it changes nothing inside the adapter', async () => {
    const {adapter} = setup();
    await adapter.refresh();
    adapter.read().spots.length = 0;
    expect(adapter.read().spots).toHaveLength(5);
  });
});

describe('refresh', () => {
  it('sends GET /api/islet once and copies the answer as it is', async () => {
    const {adapter, transport} = setup();
    const result = await adapter.refresh();
    expect(result.accepted).toBe(true);
    expect(transport.calls).toEqual([{method: 'GET', path: ISLET}]);
    expect(adapter.read()).toMatchObject({status: 'ready', coins: 1000, timber: 20, signalStationBuilt: false, notice: null});
    expect(adapter.read().spots.map(spot => spot.plot)).toEqual(['plot_1', 'plot_2', 'plot_3', 'plot_4', STATION]);
    expect(spotOf(adapter, 'plot_2')).toMatchObject({state: 'empty', canBuild: true, retry: false});
  });

  it('shows Please sign in again for a 401', async () => {
    const adapter = createIsletAdapter({transport: {get: async () => SIGN_IN_AGAIN}, mode: 'live'});
    await adapter.refresh();
    expect(adapter.read()).toMatchObject({status: 'error', notice: {tone: 'error', code: 'unauthorized', message: 'Please sign in again.'}});
  });

  it('keeps the last good view and shows the message when a later refresh fails', async () => {
    const {fake, adapter} = setup();
    await adapter.refresh();
    fake.dev.failNext('server');
    const result = await adapter.refresh();
    expect(result).toMatchObject({accepted: false, code: 'database_unavailable'});
    expect(adapter.read()).toMatchObject({status: 'ready', coins: 1000, notice: {tone: 'error', code: 'database_unavailable'}});
    expect(adapter.read().spots).toHaveLength(5);
  });

  it('treats a network failure as a failed refresh', async () => {
    const {fake, adapter} = setup();
    fake.dev.failNext('network');
    await adapter.refresh();
    expect(adapter.read()).toMatchObject({status: 'error', notice: {code: 'network_error'}});
  });

  it('treats a transport that throws as a network failure', async () => {
    const adapter = createIsletAdapter({transport: {get: () => { throw new TypeError('bad path'); }}, mode: 'live'});
    await adapter.refresh();
    expect(adapter.read().notice).toMatchObject({tone: 'error', code: 'network_error'});
  });

  it('treats an answer it cannot read as a failure and keeps the last good view', async () => {
    const answers = [await createFakeIsletTransport().get(ISLET), {ok: true, status: 200, data: {coins: 'many'}}];
    const adapter = createIsletAdapter({transport: {get: async () => answers.shift()}, mode: 'live'});
    await adapter.refresh();
    await adapter.refresh();
    expect(adapter.read()).toMatchObject({status: 'ready', coins: 1000, notice: {tone: 'error', code: 'unreadable'}});
  });

  it('clears an old notice once a refresh works', async () => {
    const {fake, adapter} = setup();
    fake.dev.failNext('network');
    await adapter.refresh();
    await adapter.refresh();
    expect(adapter.read().notice).toBeNull();
  });

  it('ignores an old answer that arrives after a newer one', async () => {
    const slow = deferred();
    const fake = createFakeIsletTransport();
    let calls = 0;
    const transport = {get: () => (++calls === 1 ? slow.promise : fake.get(ISLET))};
    const adapter = createIsletAdapter({transport, mode: 'live'});
    const older = adapter.refresh();
    await adapter.refresh();
    const oldAnswer = await createFakeIsletTransport({coins: 5}).get(ISLET);
    slow.resolve(oldAnswer);
    await older;
    expect(adapter.read().coins).toBe(1000);
  });
});

describe('latest started read ownership', () => {
  it.each(['reset', 'dispose'])('returns safely when a failure publication causes a reentrant %s', async cleanup => {
    const adapter = createIsletAdapter({mode: 'live', transport: {
      get: async () => ({ok: false, status: 503, code: 'database_unavailable'}),
    }});
    let changed = false;
    adapter.subscribe(event => {
      if (!event.view.notice || changed) return;
      changed = true; if (cleanup === 'reset') adapter.resetPrivate(); else adapter.dispose();
    });
    await expect(adapter.refresh()).resolves.toMatchObject({accepted: false, code: cleanup === 'reset' ? 'session_expired' : 'disposed'});
    expect(adapter.read().notice).toBeNull(); adapter.dispose();
  });
  it('stops an accepted publication after a prior observer resets its private epoch', async () => {
    const {adapter} = setup(); await adapter.refresh(); let reset = false;
    adapter.subscribe(event => { if (event.answered && !reset) { reset = true; adapter.resetPrivate(); } });
    const later = vi.fn(); adapter.subscribe(later);
    expect(await adapter.refresh()).toMatchObject({accepted: false, code: 'session_expired'});
    expect(later).toHaveBeenCalledOnce(); expect(later.mock.calls[0][0]).toMatchObject({answered: false, view: {coins: null, spots: []}});
    expect(adapter.read().spots).toEqual([]); adapter.dispose();
  });
  it.each(['success', 'error'])('ignores a pre-build %s response after the newer recovery read fails', async olderResult => {
    const fake = createFakeIsletTransport(), held = deferred();
    let reads = 0;
    const transport = {get: () => ++reads === 2 ? held.promise : reads === 3
      ? Promise.resolve({ok: false, status: 0, code: 'network_error'}) : fake.get(ISLET),
      post: async () => ({ok: false, status: 503, code: 'database_unavailable'})};
    const adapter = createIsletAdapter({transport, mode: 'live', makeUid: () => crypto.randomUUID()});
    try {
      await adapter.refresh(); const old = adapter.refresh();
      expect((await adapter.build(STATION)).code).toBe('unconfirmed');
      const current = adapter.read(), listener = vi.fn(); adapter.subscribe(listener);
      held.resolve(olderResult === 'success' ? await createFakeIsletTransport({coins: 5}).get(ISLET)
        : {ok: false, status: 503, code: 'database_unavailable'});
      expect((await old).code).toBe('superseded');
      expect(adapter.read()).toEqual(current); expect(listener).not.toHaveBeenCalled();
    } finally { adapter.dispose(); }
  });
});

describe('build: the normal path', () => {
  it('posts plot, type and actionUid, with the type copied from the spot the server sent', async () => {
    const answer = await createFakeIsletTransport().get(ISLET);
    const post = vi.fn(async () => ({ok: false, status: 404, code: 'no_such_building', message: 'No such building.'}));
    const adapter = createIsletAdapter({transport: {get: async () => answer, post}, mode: 'live', makeUid: counter()});
    await adapter.refresh();
    await adapter.build('plot_2');
    expect(post).toHaveBeenCalledWith(BUILD, {plot: 'plot_2', type: answer.data.spots[1].type, actionUid: 'click-0001'});
  });
  it('refuses an unpublished plot/type snapshot before it can authorize a build', async () => {
    const answer = await createFakeIsletTransport().get(ISLET); answer.data.spots[1].type = 'odd_type';
    const post = vi.fn(), adapter = createIsletAdapter({transport: {get: async () => answer, post}, mode: 'live'});
    expect((await adapter.refresh()).accepted).toBe(false);
    expect((await adapter.build('plot_2')).code).toBe('no_such_plot'); expect(post).not.toHaveBeenCalled();
  });

  it('shows the receipt, then the fresh islet, and frees the buttons', async () => {
    const {adapter} = setup();
    await adapter.refresh();
    const result = await adapter.build(STATION);
    expect(result).toMatchObject({accepted: true, code: 'built'});
    expect(adapter.read()).toMatchObject({
      busyPlot: null, coins: 700, timber: 10, signalStationBuilt: true,
      notice: {tone: 'success', code: 'built', message: 'Signal station built. You have 700 coins and 10 timber left.'},
    });
    expect(spotOf(adapter, STATION)).toMatchObject({state: 'built', level: 1, builtAt: '2026-11-16T10:00:00Z', canBuild: false, retry: false});
  });

  it('sets busyPlot while the request runs', async () => {
    const {adapter} = setup();
    await adapter.refresh();
    const busy = [];
    adapter.subscribe(event => busy.push(event.view.busyPlot));
    await adapter.build('plot_2');
    expect(busy).toContain('plot_2');
    expect(adapter.read().busyPlot).toBeNull();
  });

  it('sends one request when two builds are started without waiting', async () => {
    const {adapter, transport} = setup();
    await adapter.refresh();
    const first = adapter.build('plot_2');
    const second = adapter.build(STATION);
    expect(await second).toMatchObject({accepted: false, code: 'busy'});
    await first;
    expect(transport.posts()).toHaveLength(1);
  });

  it('sends nothing for a plot the server did not list', async () => {
    const {adapter, transport} = setup();
    await adapter.refresh();
    expect(await adapter.build('plot_9')).toMatchObject({accepted: false, code: 'no_such_plot'});
    expect(transport.posts()).toHaveLength(0);
  });

  it('sends nothing before the first answer has arrived', async () => {
    const {adapter, transport} = setup();
    expect(await adapter.build('plot_2')).toMatchObject({accepted: false, code: 'no_such_plot'});
    expect(transport.calls).toEqual([]);
  });

  it('says so when the islet could not be reloaded after a good build', async () => {
    const fake = createFakeIsletTransport();
    let reloadFails = false;
    const lost = {ok: false, status: 0, code: 'network_error', message: 'No connection to the server. Check your internet and try again.'};
    const transport = {
      get: async path => (reloadFails ? lost : fake.get(path)),
      post: async (path, body) => { const answer = await fake.post(path, body); reloadFails = true; return answer; },
    };
    const adapter = createIsletAdapter({transport, mode: 'live', makeUid: counter()});
    await adapter.refresh();
    const result = await adapter.build(STATION);
    expect(result).toMatchObject({accepted: true, code: 'built'});
    expect(adapter.read().notice).toEqual({
      tone: 'success', code: 'built',
      message: 'Signal station built. You have 700 coins and 10 timber left. We could not reload your islet. Press Refresh.',
    });
  });
});

describe('build: answers that say what happened', () => {
  it('shows the message of the server for a refusal, frees the click id and refreshes', async () => {
    const {fake, adapter, transport} = setup();
    await adapter.refresh();
    fake.dev.setCoins(100);
    const result = await adapter.build(STATION);
    expect(result).toMatchObject({accepted: false, code: 'insufficient_funds'});
    expect(adapter.read().notice).toEqual({tone: 'error', code: 'insufficient_funds', message: 'The signal station costs 300 coins. You do not have enough coins.'});
    expect(adapter.read().busyPlot).toBeNull();
    expect(spotOf(adapter, STATION).retry).toBe(false);
    expect(transport.gets()).toHaveLength(2);
  });

  it('makes a new click id for the next click after a refusal', async () => {
    const {fake, adapter, transport} = setup();
    await adapter.refresh();
    fake.dev.setCoins(100);
    await adapter.build(STATION);
    fake.dev.setCoins(1000);
    await adapter.build(STATION);
    const [first, second] = transport.posts().map(call => call.body.actionUid);
    expect(second).not.toBe(first);
  });

  it('treats 409 already_applied as done, with a refresh and a friendly note', async () => {
    const {fake, adapter} = setup();
    await adapter.refresh();
    await fake.post(BUILD, {plot: STATION, type: 'signal_station', actionUid: 'click-0001'});
    const result = await adapter.build(STATION);
    expect(result).toMatchObject({accepted: true, code: 'already_applied'});
    expect(adapter.read()).toMatchObject({
      coins: 700, notice: {tone: 'success', code: 'already_applied', message: 'Built. It was already counted, so you were not charged twice.'},
    });
    expect(spotOf(adapter, STATION).state).toBe('built');
  });

  it('shows Please sign in again when the build is answered with a 401', async () => {
    const answer = await createFakeIsletTransport().get(ISLET);
    const transport = {get: async () => answer, post: async () => SIGN_IN_AGAIN};
    const adapter = createIsletAdapter({transport, mode: 'live'});
    await adapter.refresh();
    await adapter.build('plot_2');
    expect(adapter.read().notice).toMatchObject({tone: 'error', code: 'unauthorized', message: 'Please sign in again.'});
  });
});

describe('build: answers that do not say what happened', () => {
  it('keeps the click id after a lost answer, and shows Built when the refresh finds the building', async () => {
    const {fake, adapter, transport} = setup();
    await adapter.refresh();
    fake.dev.failNext('timeout');
    const result = await adapter.build(STATION);
    expect(result).toMatchObject({accepted: true, code: 'confirmed'});
    expect(adapter.read().notice).toEqual({tone: 'success', code: 'confirmed', message: 'Built.'});
    expect(spotOf(adapter, STATION)).toMatchObject({state: 'built', retry: false});
    expect(transport.posts()).toHaveLength(1);
  });

  it('marks the spot for a safe retry when the refresh cannot confirm, then retries with the same id', async () => {
    const {fake, adapter, transport} = setup();
    await adapter.refresh();
    fake.dev.failNext('timeout');
    fake.dev.failNext('network');
    const first = await adapter.build(STATION);
    expect(first).toMatchObject({accepted: false, code: 'unconfirmed'});
    expect(spotOf(adapter, STATION)).toMatchObject({state: 'empty', retry: true});
    expect(adapter.read().notice).toMatchObject({tone: 'error', code: 'unconfirmed'});

    const retry = await adapter.build(STATION);
    expect(retry).toMatchObject({accepted: true, code: 'already_applied'});
    const [one, two] = transport.posts().map(call => call.body.actionUid);
    expect(two).toBe(one);
    expect(spotOf(adapter, STATION)).toMatchObject({state: 'built', retry: false});
    expect(adapter.read().coins).toBe(700);
  });

  it('keeps the click id after a 503, and the retry builds once when the first request never arrived', async () => {
    const {fake, adapter, transport} = setup();
    await adapter.refresh();
    fake.dev.failNext('server');
    const first = await adapter.build(STATION);
    expect(first).toMatchObject({accepted: false, code: 'unconfirmed'});
    expect(adapter.read().notice).toMatchObject({tone: 'info', code: 'not_done'});
    expect(spotOf(adapter, STATION).retry).toBe(true);

    await adapter.build(STATION);
    const [one, two] = transport.posts().map(call => call.body.actionUid);
    expect(two).toBe(one);
    expect(adapter.read()).toMatchObject({coins: 700, timber: 10});
  });

  it('says it is checking while it refreshes after a lost answer', async () => {
    const {fake, adapter} = setup();
    await adapter.refresh();
    fake.dev.failNext('timeout');
    const notices = [];
    adapter.subscribe(event => notices.push(event.view.notice?.code));
    await adapter.build(STATION);
    expect(notices).toContain('checking');
  });

  it('forgets a kept click id once a refresh shows the building, for example built on another device', async () => {
    const {fake, adapter, transport} = setup();
    await adapter.refresh();
    fake.dev.failNext('server');
    await adapter.build(STATION);
    await fake.post(BUILD, {plot: STATION, type: 'signal_station', actionUid: 'other-device-1'});
    await adapter.refresh();
    expect(spotOf(adapter, STATION)).toMatchObject({state: 'built', retry: false});
    expect(transport.posts()).toHaveLength(1);
  });
});

describe('unavailable mode', () => {
  it('never calls the transport and says the islet will be saved once sign-in is connected', async () => {
    const transport = {get: vi.fn(), post: vi.fn()};
    const adapter = createIsletAdapter({transport, mode: 'unavailable'});
    expect(await adapter.refresh()).toMatchObject({accepted: false, code: 'not_connected'});
    expect(await adapter.build('plot_2')).toMatchObject({accepted: false, code: 'not_connected'});
    expect(transport.get).not.toHaveBeenCalled();
    expect(transport.post).not.toHaveBeenCalled();
    expect(adapter.read()).toMatchObject({mode: 'unavailable', status: 'unavailable', notice: {message: 'Your islet will be saved to your account once sign-in is connected.'}});
  });

  it('works without any transport at all', async () => {
    const adapter = createIsletAdapter({transport: null, mode: 'unavailable'});
    expect(await adapter.refresh()).toMatchObject({accepted: false});
  });
});

describe('subscribe and dispose', () => {
  it('tells listeners about every change and marks the ones that came from a good answer', async () => {
    const {adapter} = setup();
    const events = [];
    adapter.subscribe(event => events.push(event));
    await adapter.refresh();
    expect(events.every(event => event.type === 'islet_updated')).toBe(true);
    expect(events.filter(event => event.answered)).toHaveLength(1);
    expect(events.at(-1).view.spots).toHaveLength(5);
  });

  it('does not mark a failed refresh as answered', async () => {
    const {fake, adapter} = setup();
    const events = [];
    adapter.subscribe(event => events.push(event));
    fake.dev.failNext('network');
    await adapter.refresh();
    expect(events.some(event => event.answered)).toBe(false);
  });

  it('counts every change in the revision', async () => {
    const {adapter} = setup();
    const before = adapter.read().revision;
    await adapter.refresh();
    expect(adapter.read().revision).toBeGreaterThan(before);
  });

  it('stops telling a listener that unsubscribed', async () => {
    const {adapter} = setup();
    const listener = vi.fn();
    const stop = adapter.subscribe(listener);
    stop();
    await adapter.refresh();
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops everything on dispose, even for an answer that is still on its way', async () => {
    const slow = deferred();
    const adapter = createIsletAdapter({transport: {get: () => slow.promise}, mode: 'live'});
    const listener = vi.fn();
    adapter.subscribe(listener);
    const pending = adapter.refresh();
    listener.mockClear();
    adapter.dispose();
    slow.resolve(await createFakeIsletTransport().get(ISLET));
    expect(await pending).toMatchObject({accepted: false, code: 'disposed'});
    expect(listener).not.toHaveBeenCalled();
    expect(adapter.read().spots).toEqual([]);
  });

  it('refuses new intents after dispose and sends nothing', async () => {
    const {adapter, transport} = setup();
    await adapter.refresh();
    adapter.dispose();
    expect(await adapter.build('plot_2')).toMatchObject({accepted: false, code: 'disposed'});
    expect(await adapter.refresh()).toMatchObject({accepted: false, code: 'disposed'});
    expect(transport.posts()).toHaveLength(0);
    expect(transport.gets()).toHaveLength(1);
  });
});

describe('private identity boundaries', () => {
  const receipt = {plot: STATION, type: 'signal_station', name: 'Signal station', level: 1,
    coinsPaid: 300, timberPaid: 10, coins: 700, timber: 10};
  it('erases loaded private state and ignores an old GET after the next identity has answered', async () => {
    const answer = await createFakeIsletTransport().get(ISLET), old = deferred(), fresh = deferred();
    const get = vi.fn().mockResolvedValueOnce(answer).mockImplementationOnce(() => old.promise).mockImplementationOnce(() => fresh.promise);
    const adapter = createIsletAdapter({transport: {get}, mode: 'live'}), events = [];
    try {
      await adapter.refresh(); adapter.subscribe(event => events.push(event));
      const reading = adapter.refresh(), revision = adapter.read().revision;
      adapter.resetPrivate();
      expect(adapter.read()).toMatchObject({coins: null, timber: null, spots: [], busyPlot: null, notice: null});
      expect(adapter.read().revision).toBeGreaterThan(revision);
      const next = adapter.refresh(), current = structuredClone(answer);
      current.data.coins = 42; fresh.resolve(current); await next;
      const count = events.length; old.resolve(answer);
      expect(await reading).toMatchObject({accepted: false, code: 'session_expired'});
      expect(adapter.read().coins).toBe(42); expect(events).toHaveLength(count);
      expect(events.filter(event => event.answered)).toHaveLength(1);
    } finally { adapter.dispose(); }
  });

  it('drops an unknown build uid at an identity boundary while keeping same-identity retries unchanged', async () => {
    const {fake, adapter, transport} = setup();
    try {
      await adapter.refresh(); fake.dev.failNext('server');
      expect((await adapter.build(STATION)).code).toBe('unconfirmed');
      expect(spotOf(adapter, STATION).retry).toBe(true);
      adapter.resetPrivate(); await adapter.refresh();
      expect(spotOf(adapter, STATION).retry).toBe(false);
      expect((await adapter.build(STATION)).accepted).toBe(true);
      const ids = transport.posts().map(call => call.body.actionUid);
      expect(ids).toHaveLength(2); expect(ids[1]).not.toBe(ids[0]);
    } finally { adapter.dispose(); }
  });

  it('cannot settle an old POST or clear the next identity busy build', async () => {
    const fake = createFakeIsletTransport(), old = deferred(), fresh = deferred();
    const transport = {get: vi.fn(path => fake.get(path)),
      post: vi.fn().mockImplementationOnce(() => old.promise).mockImplementationOnce(() => fresh.promise)};
    const adapter = createIsletAdapter({transport, mode: 'live', makeUid: counter()});
    try {
      await adapter.refresh(); const first = adapter.build(STATION);
      adapter.resetPrivate(); await adapter.refresh(); const second = adapter.build(STATION);
      const reads = transport.get.mock.calls.length;
      old.resolve({ok: true, status: 200, data: receipt});
      expect(await first).toMatchObject({accepted: false, code: 'session_expired'});
      expect(transport.get).toHaveBeenCalledTimes(reads);
      expect(adapter.read()).toMatchObject({coins: 1000, busyPlot: STATION, notice: {code: 'building'}});
      fresh.resolve({ok: false, status: 409, code: 'not_enough_timber', message: 'Recorded current refusal.'});
      await second;
      expect(adapter.read()).toMatchObject({busyPlot: null, notice: {code: 'not_enough_timber'}});
    } finally { adapter.dispose(); }
  });

  it('cannot publish an old recovery GET or start another read while a fresh build is pending', async () => {
    const fake = createFakeIsletTransport(), recovery = deferred(), fresh = deferred();
    const transport = {get: vi.fn(path => fake.get(path)), post: vi.fn()
      .mockResolvedValueOnce({ok: false, status: 503, code: 'database_unavailable'})
      .mockImplementationOnce(() => fresh.promise)};
    const adapter = createIsletAdapter({transport, mode: 'live', makeUid: counter()}), answered = vi.fn();
    try {
      await adapter.refresh(); transport.get.mockImplementationOnce(() => recovery.promise);
      const first = adapter.build(STATION);
      await vi.waitFor(() => expect(transport.get).toHaveBeenCalledTimes(2));
      adapter.resetPrivate(); await adapter.refresh();
      adapter.subscribe(event => { if (event.answered) answered(); });
      const second = adapter.build(STATION), reads = transport.get.mock.calls.length;
      recovery.resolve(await fake.get(ISLET));
      expect(await first).toMatchObject({accepted: false, code: 'session_expired'});
      expect(transport.get).toHaveBeenCalledTimes(reads); expect(answered).not.toHaveBeenCalled();
      expect(adapter.read()).toMatchObject({busyPlot: STATION, notice: {code: 'building'}});
      fresh.resolve({ok: false, status: 409, code: 'not_enough_timber', message: 'Recorded current refusal.'});
      await second;
      expect(adapter.read()).toMatchObject({busyPlot: null, notice: {code: 'not_enough_timber'}});
    } finally { adapter.dispose(); }
  });

  it('uses readback and the same uid after an unreadable HTTP200 build instead of inventing success', async () => {
    const fake = createFakeIsletTransport(); let sends = 0;
    const transport = {get: vi.fn(path => fake.get(path)), post: vi.fn((path, body) =>
      ++sends === 1 ? Promise.resolve({ok: true, status: 200, data: null}) : fake.post(path, body))};
    const adapter = createIsletAdapter({transport, mode: 'live', makeUid: counter()});
    try {
      await adapter.refresh();
      expect(await adapter.build(STATION)).toMatchObject({accepted: false, code: 'unconfirmed'});
      expect(adapter.read()).toMatchObject({coins: 1000, signalStationBuilt: false});
      expect(spotOf(adapter, STATION)).toMatchObject({state: 'empty', retry: true});
      expect((await adapter.build(STATION)).accepted).toBe(true);
      expect(transport.post.mock.calls.map(([, body]) => body.actionUid)).toEqual(['click-0001', 'click-0001']);
      expect(adapter.read()).toMatchObject({coins: 700, timber: 10, signalStationBuilt: true});
    } finally { adapter.dispose(); }
  });

  it('erases a loaded wallet, spots and notice on disposal and ignores a pending answer', async () => {
    const fake = createFakeIsletTransport(), pending = deferred();
    const transport = {get: vi.fn(path => fake.get(path))};
    const adapter = createIsletAdapter({transport, mode: 'live'}), listener = vi.fn();
    await adapter.refresh(); expect(adapter.read().coins).toBe(1000);
    transport.get.mockImplementationOnce(() => pending.promise);
    const reading = adapter.refresh(); adapter.subscribe(listener); adapter.dispose();
    expect(adapter.read()).toMatchObject({coins: null, timber: null, spots: [], busyPlot: null, notice: null});
    pending.resolve(await fake.get(ISLET));
    expect(await reading).toMatchObject({accepted: false, code: 'disposed'});
    expect(listener).not.toHaveBeenCalled();
  });
});
