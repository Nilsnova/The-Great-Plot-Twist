// Real presence tests inject A4 controllers, clocks and identities; no socket or service is used.
import {describe, expect, it, vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createOnlinePresence} from '../src/online/case-adapter/presence.js';
import {playerId, createFakeClient, worldOf} from './realtime-fakes.js';
import {startRealtime as startA4} from '../src/online/realtime.js';
import {createPositionReporter} from '../src/controls/presence-report.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};
function setup(options = {}) {
  const session = createSession();
  session.setToken(`test-${crypto.randomUUID()}`);
  let now = 10000, scope = 0, closed = false;
  const state = {config: {flags: {live_presence: true}}, me: {id: playerId(1),
    captainName: 'Captain One', kit: 'true_keeper'}, crew: null};
  const store = {commit: vi.fn(patch => Object.assign(state, patch)), isClosed: () => closed,
    scope: () => scope};
  const auth = {getAccessToken: vi.fn(async () => session.getToken()),
    readCrewSeats: vi.fn(async () => ({ok: true, seats: []}))};
  const live = {setPlace: vi.fn(), update: vi.fn(), emote: vi.fn(() => true),
    setCrew: vi.fn(), setKit: vi.fn(), stop: vi.fn()};
  let wire;
  const startRealtime = vi.fn(args => { wire = args; args.emit({type: 'live_status_changed', state: 'connecting'}); return live; });
  const loadRealtime = vi.fn(async () => ({startRealtime}));
  const emit = vi.fn(), onCrewUpdated = vi.fn(), onCaseHint = vi.fn();
  const ctx = {state, store, session, auth, document: options.document, now: () => now, random: () => 0, onCrewUpdated, onCaseHint,
    accept: message => ({accepted: true, reason: null, message}),
    refuse: reason => ({accepted: false, reason, message: reason})};
  const presence = createOnlinePresence(ctx, {loadRealtime, emit,
    supabaseUrl: 'https://placeholder.supabase.co', publishableKey: `public-${crypto.randomUUID()}`, ...options});
  return {ctx, presence, state, store, auth, session, live, loadRealtime, startRealtime, emit, onCrewUpdated, onCaseHint,
    event: event => wire.emit(event), advance: ms => { now += ms; }, scope: () => { scope += 1; },
    close: () => { closed = true; }};
}
const roster = (count = 2) => ({type: 'live_presence_changed', place: 'saltreach_harbor', room: 1,
  shown: Array.from({length: count}, (_, index) => ({id: playerId(index + 2), name: index ? 'Captain Two' : null,
    kit: index ? 'witness' : null, crewmate: index === 0})), hiddenCount: 3, crew: []});
const move = (index = 2, facing = 'down') => ({type: 'live_peer_moved', id: playerId(index),
  x: index, z: index + 1, facing, moving: true, everyMs: 500});

describe('online presence controller', () => {
  it.each(['signed_out', 'flag_off', 'unnamed', 'invalid_identity'])('loads nothing for %s', async condition => {
    const ctx = setup();
    if (condition === 'signed_out') ctx.session.clearToken();
    if (condition === 'flag_off') ctx.state.config.flags.live_presence = false;
    if (condition === 'unnamed') ctx.state.me.captainName = null;
    if (condition === 'invalid_identity') ctx.state.me.id = 'not-an-identity';
    await ctx.presence.refresh();
    expect(ctx.loadRealtime).not.toHaveBeenCalled();
    expect(ctx.state.presence.status).toBe('off');
  });

  it('loads nothing without both public build values', async () => {
    const ctx = setup({publishableKey: ''});
    await ctx.presence.refresh();
    expect(ctx.loadRealtime).not.toHaveBeenCalled();
  });

  it('keeps raw identities and metadata without positions out of screen data', async () => {
    const ctx = setup();
    await ctx.presence.refresh();
    ctx.event(roster());
    expect(ctx.state.presence.others).toEqual([]);
    expect(ctx.state.presence.hiddenCount).toBe(5);
    ctx.event(move()); ctx.event(move(3, 'up'));
    expect(ctx.state.presence.others).toMatchObject([{name: 'Captain', kit: {id: 'captain', name: 'Captain'},
      x: 2, y: 3, facing: 'front', isCrew: true}, {name: 'Captain Two', kit: {id: 'witness', name: 'Witness'},
      x: 3, y: 4, facing: 'back'}]);
    expect(ctx.state.presence.hiddenCount).toBe(3);
    const opaque = ctx.state.presence.others[0].id;
    ctx.event(move());
    expect(ctx.state.presence.others[0].id).toBe(opaque);
    expect(JSON.stringify(ctx.state.presence)).not.toContain(playerId(2));
    expect(ctx.emit.mock.calls.map(call => call[0])).toContainEqual(move());
  });

  it('caps drawn peers at eight and counts the remaining captains', async () => {
    const ctx = setup();
    await ctx.presence.refresh();
    ctx.event(roster(10));
    for (let index = 2; index < 12; index += 1) ctx.event(move(index));
    expect(ctx.state.presence.others).toHaveLength(8);
    expect(ctx.state.presence.hiddenCount).toBe(5);
  });

  it.each([['front', 'down'], ['back', 'up'], ['left', 'left'], ['right', 'right']])(
    'sends %s as %s and maps y to z', async (facing, sent) => {
      const ctx = setup();
      await ctx.presence.refresh();
      const sample = {place: 'saltreach_harbor', x: 1, y: 2, facing, moving: true};
      expect(ctx.presence.reportPosition(sample).accepted).toBe(true);
      ctx.presence.reportPosition(sample);
      expect(ctx.live.setPlace).toHaveBeenCalledTimes(1);
      expect(ctx.live.update).toHaveBeenCalledWith({x: 1, z: 2, facing: sent, moving: true});
    });

  it('rejects invalid positions before forwarding them', async () => {
    const ctx = setup();
    await ctx.presence.refresh();
    expect(ctx.presence.reportPosition({place: 'saltreach_harbor', x: 201, y: 0,
      facing: 'front', moving: true}).reason).toBe('invalid_position');
    expect(ctx.live.update).not.toHaveBeenCalled();
  });

  it('suspends A4 once, clears peers and ignores hidden samples, then uses only fresh visible positions', async () => {
    vi.useFakeTimers(); const ctx = setup();
    try {
      await ctx.presence.refresh(); ctx.event(roster()); ctx.event(move());
      const opaque = ctx.state.presence.others[0].id;
      const oldEmit = ctx.startRealtime.mock.calls[0][0].emit;
      ctx.presence.reportPosition({place: 'saltreach_harbor', x: 1, y: 2, facing: 'front', moving: true});
      ctx.presence.setHidden(true); ctx.presence.setHidden(true);
      expect(ctx.live.stop).toHaveBeenCalledTimes(1);
      expect(ctx.state.presence).toMatchObject({status: 'off', place: null, others: [], crew: []});
      expect(ctx.presence.reportPosition({place: 'lighthouse_isle', x: 99, y: 99,
        facing: 'left', moving: true}).accepted).toBe(true);
      expect(ctx.presence.reportPosition({place: 'saltreach_harbor', x: NaN, y: 0,
        facing: 'front', moving: true}).reason).toBe('invalid_position');
      await ctx.presence.refresh(); oldEmit(roster()); oldEmit(move());
      expect(ctx.live.update).toHaveBeenCalledTimes(1);
      expect(ctx.live.setPlace).toHaveBeenCalledTimes(1);
      expect(ctx.startRealtime).toHaveBeenCalledTimes(1);
      expect(ctx.state.presence.others).toEqual([]);
      ctx.presence.setHidden(false); const resumed = ctx.presence.refresh();
      ctx.advance(500); await vi.advanceTimersByTimeAsync(500); await resumed;
      expect(ctx.startRealtime).toHaveBeenCalledTimes(2);
      expect(ctx.live.setPlace).toHaveBeenCalledTimes(1);
      ctx.presence.reportPosition({place: 'lighthouse_isle', x: 3, y: 4, facing: 'back', moving: false});
      expect(ctx.live.setPlace).toHaveBeenLastCalledWith('lighthouse_isle');
      expect(ctx.live.update).toHaveBeenLastCalledWith({x: 3, z: 4, facing: 'up', moving: false});
      ctx.event(roster()); ctx.event(move());
      expect(ctx.state.presence.others[0].id).toBe(opaque);
    } finally { ctx.presence.dispose(); vi.useRealTimers(); }
  });

  it('keeps the original bubble deadline and three-second cooldown across a fresh visible controller', async () => {
    vi.useFakeTimers(); const ctx = setup();
    try {
      await ctx.presence.refresh(); ctx.event({type: 'live_status_changed', state: 'live'});
      expect(ctx.presence.setEmote('point').accepted).toBe(true);
      const deadline = ctx.state.presence.localEmote.until;
      ctx.advance(600); ctx.presence.setHidden(true);
      expect(ctx.presence.setEmote('wave').reason).toBe('emote_cooldown');
      ctx.presence.setHidden(false); const resumed = ctx.presence.refresh();
      ctx.advance(500); await vi.advanceTimersByTimeAsync(500); await resumed;
      ctx.event({type: 'live_status_changed', state: 'live'}); ctx.presence.tick();
      expect(ctx.state.presence.localEmote).toEqual({id: 'point', until: deadline});
      expect(ctx.state.presence.cooldown).toBe(1900);
      expect(ctx.presence.setEmote('wave').reason).toBe('emote_cooldown');
      ctx.advance(700); ctx.presence.tick();
      expect(ctx.state.presence.localEmote).toBeNull(); expect(ctx.state.presence.canEmote).toBe(false);
      ctx.advance(1200); ctx.presence.tick();
      expect(ctx.state.presence.canEmote).toBe(true);
      expect(ctx.presence.setEmote('wave').accepted).toBe(true);
      expect(ctx.live.emote).toHaveBeenCalledTimes(2);
    } finally { ctx.presence.dispose(); vi.useRealTimers(); }
  });

  it('loads nothing while initially hidden', async () => {
    const ctx = setup({document: {hidden: true}}); ctx.state.crew = {id: playerId(90), seats: []};
    try {
      await ctx.presence.refresh();
      expect(ctx.loadRealtime).not.toHaveBeenCalled();
      expect(ctx.startRealtime).not.toHaveBeenCalled();
      expect(ctx.auth.readCrewSeats).not.toHaveBeenCalled();
      ctx.presence.setHidden(false); await ctx.presence.refresh();
      expect(ctx.startRealtime).toHaveBeenCalledTimes(1);
      expect(ctx.auth.readCrewSeats).toHaveBeenCalledTimes(1);
    } finally { ctx.presence.dispose(); }
  });

  it('forwards the one initial stationary report after a deferred A4 module becomes ready', async () => {
    const wait = deferred(), loadRealtime = vi.fn(() => wait.promise), ctx = setup({loadRealtime});
    const reporter = createPositionReporter(sample => ctx.presence.reportPosition(sample));
    const stationary = {place: 'saltreach_harbor', x: 3, y: 4, facing: 'back', moving: false};
    try {
      const pending = ctx.presence.refresh();
      await vi.waitFor(() => expect(loadRealtime).toHaveBeenCalledTimes(1));
      reporter.update(stationary, 0); reporter.update(stationary, 500); reporter.update(stationary, 1000);
      expect(ctx.live.update).not.toHaveBeenCalled();
      wait.resolve({startRealtime: ctx.startRealtime}); await pending;
      expect(ctx.live.setPlace).toHaveBeenCalledExactlyOnceWith('saltreach_harbor');
      expect(ctx.live.update).toHaveBeenCalledExactlyOnceWith({x: 3, z: 4, facing: 'up', moving: false});
      reporter.update(stationary, 1500); expect(ctx.live.update).toHaveBeenCalledTimes(1);
    } finally { ctx.presence.dispose(); reporter.reset(); }
  });

  it('queues only the latest validated copied visible sample while A4 loads', async () => {
    const wait = deferred(), loadRealtime = vi.fn(() => wait.promise), ctx = setup({loadRealtime});
    try {
      const pending = ctx.presence.refresh();
      await vi.waitFor(() => expect(loadRealtime).toHaveBeenCalledTimes(1));
      ctx.presence.reportPosition({place: 'saltreach_harbor', x: 1, y: 2, facing: 'front', moving: true});
      const latest = {place: 'lighthouse_isle', x: 5, y: 6, facing: 'left', moving: false};
      ctx.presence.reportPosition(latest); latest.x = 99;
      expect(ctx.presence.reportPosition({...latest, x: NaN}).reason).toBe('invalid_position');
      wait.resolve({startRealtime: ctx.startRealtime}); await pending;
      expect(ctx.live.setPlace).toHaveBeenCalledExactlyOnceWith('lighthouse_isle');
      expect(ctx.live.update).toHaveBeenCalledExactlyOnceWith({x: 5, z: 6, facing: 'left', moving: false});
    } finally { ctx.presence.dispose(); }
  });

  it.each([false, true])('never flushes an old hidden identity sample; fresh sample=%s', async freshSample => {
    const first = deferred(), latest = deferred(), loadRealtime = vi.fn()
      .mockImplementationOnce(() => first.promise).mockImplementationOnce(() => latest.promise);
    const ctx = setup({loadRealtime});
    try {
      const abandoned = ctx.presence.refresh();
      await vi.waitFor(() => expect(loadRealtime).toHaveBeenCalledTimes(1));
      ctx.presence.reportPosition({place: 'saltreach_harbor', x: 1, y: 2, facing: 'front', moving: false});
      ctx.presence.setHidden(true); ctx.scope(); ctx.state.me.id = playerId(8); ctx.presence.setHidden(false);
      const current = ctx.presence.refresh();
      await vi.waitFor(() => expect(loadRealtime).toHaveBeenCalledTimes(2));
      if (freshSample) ctx.presence.reportPosition({place: 'lighthouse_isle', x: 7, y: 8, facing: 'right', moving: false});
      first.resolve({startRealtime: ctx.startRealtime}); await abandoned;
      expect(ctx.startRealtime).not.toHaveBeenCalled();
      latest.resolve({startRealtime: ctx.startRealtime}); await current;
      if (freshSample) {
        expect(ctx.live.setPlace).toHaveBeenCalledExactlyOnceWith('lighthouse_isle');
        expect(ctx.live.update).toHaveBeenCalledExactlyOnceWith({x: 7, z: 8, facing: 'right', moving: false});
      } else { expect(ctx.live.setPlace).not.toHaveBeenCalled(); expect(ctx.live.update).not.toHaveBeenCalled(); }
    } finally { ctx.presence.dispose(); }
  });

  it.each(['hide', 'newer_sample'])('guards the queued flush when setPlace reenters with %s', async action => {
    const wait = deferred(), loadRealtime = vi.fn(() => wait.promise), ctx = setup({loadRealtime});
    try {
      const pending = ctx.presence.refresh();
      await vi.waitFor(() => expect(loadRealtime).toHaveBeenCalledTimes(1));
      ctx.presence.reportPosition({place: 'saltreach_harbor', x: 1, y: 2, facing: 'front', moving: false});
      ctx.live.setPlace.mockImplementationOnce(() => action === 'hide' ? ctx.presence.setHidden(true)
        : ctx.presence.reportPosition({place: 'lighthouse_isle', x: 7, y: 8, facing: 'left', moving: false}));
      wait.resolve({startRealtime: ctx.startRealtime}); await pending;
      if (action === 'hide') {
        expect(ctx.live.update).not.toHaveBeenCalled(); expect(ctx.live.stop).toHaveBeenCalledTimes(1);
        expect(ctx.state.presence.status).toBe('off');
      } else expect(ctx.live.update).toHaveBeenCalledExactlyOnceWith({x: 7, z: 8, facing: 'left', moving: false});
    } finally { ctx.presence.dispose(); }
  });

  it.each(['setKit', 'setCrew'])('does not read seats when %s synchronously hides the page', async method => {
    const ctx = setup(); ctx.state.crew = {id: playerId(90), seats: []};
    ctx.live[method].mockImplementationOnce(() => ctx.presence.setHidden(true));
    try {
      await ctx.presence.refresh();
      expect(ctx.live.stop).toHaveBeenCalledTimes(1);
      expect(ctx.auth.readCrewSeats).not.toHaveBeenCalled();
      expect(ctx.state.presence.status).toBe('off');
    } finally { ctx.presence.dispose(); }
  });

  it('invalidates hidden imports without letting an old task clear the new visible task', async () => {
    const first = deferred(), latest = deferred(), loadRealtime = vi.fn()
      .mockImplementationOnce(() => first.promise).mockImplementationOnce(() => latest.promise);
    const ctx = setup({loadRealtime}); ctx.state.crew = {id: playerId(90), seats: []};
    try {
      const old = ctx.presence.refresh();
      await vi.waitFor(() => expect(loadRealtime).toHaveBeenCalledTimes(1));
      ctx.presence.setHidden(true); await ctx.presence.refresh();
      expect(ctx.startRealtime).not.toHaveBeenCalled(); expect(ctx.auth.readCrewSeats).not.toHaveBeenCalled();
      ctx.presence.setHidden(false); const visible = ctx.presence.refresh();
      await vi.waitFor(() => expect(loadRealtime).toHaveBeenCalledTimes(2));
      first.resolve({startRealtime: ctx.startRealtime}); await old;
      const duplicate = ctx.presence.refresh();
      expect(loadRealtime).toHaveBeenCalledTimes(2);
      latest.resolve({startRealtime: ctx.startRealtime}); await Promise.all([visible, duplicate]);
      expect(ctx.startRealtime).toHaveBeenCalledTimes(1); expect(ctx.auth.readCrewSeats).toHaveBeenCalledTimes(1);
    } finally { ctx.presence.dispose(); }
  });

  it('discards a crew read from before suspension and reads the current roster only after showing', async () => {
    vi.useFakeTimers(); const wait = deferred(), ctx = setup(); ctx.state.crew = {id: playerId(90), seats: []};
    ctx.auth.readCrewSeats.mockImplementationOnce(() => wait.promise)
      .mockResolvedValue({ok: true, seats: [{playerId: playerId(3), seatNo: 2}]});
    try {
      const pending = ctx.presence.refresh();
      await vi.waitFor(() => expect(ctx.auth.readCrewSeats).toHaveBeenCalledTimes(1));
      ctx.presence.setHidden(true); await ctx.presence.refresh();
      wait.resolve({ok: true, seats: [{playerId: playerId(2), seatNo: 2}]}); await pending;
      expect(ctx.auth.readCrewSeats).toHaveBeenCalledTimes(1);
      expect(ctx.live.setCrew).toHaveBeenLastCalledWith({id: playerId(90), memberIds: []});
      ctx.presence.setHidden(false); const resumed = ctx.presence.refresh();
      ctx.advance(500); await vi.advanceTimersByTimeAsync(500); await resumed;
      expect(ctx.auth.readCrewSeats).toHaveBeenCalledTimes(2);
      expect(ctx.live.setCrew).toHaveBeenLastCalledWith({id: playerId(90), memberIds: [playerId(3)]});
    } finally { ctx.presence.dispose(); vi.useRealTimers(); }
  });

  it.each(['logout', 'flag_off', 'scope_changed', 'stop', 'dispose'])(
    'fully clears preserved hidden cosmetics and restart work after %s', async condition => {
      vi.useFakeTimers(); const ctx = setup();
      try {
        await ctx.presence.refresh(); ctx.event({type: 'live_status_changed', state: 'live'});
        ctx.presence.setEmote('point'); ctx.presence.setHidden(true);
        ctx.presence.setHidden(false); const abandoned = ctx.presence.refresh();
        if (condition === 'logout') { ctx.session.clearToken(); await ctx.presence.refresh(); ctx.session.setToken(`test-${crypto.randomUUID()}`); }
        if (condition === 'flag_off') { ctx.state.config.flags.live_presence = false; await ctx.presence.refresh(); ctx.state.config.flags.live_presence = true; }
        if (condition === 'scope_changed') { ctx.scope(); ctx.state.me.id = playerId(8); }
        if (condition === 'stop') ctx.presence.stop();
        if (condition === 'dispose') ctx.presence.dispose();
        const fresh = ctx.presence.refresh();
        await vi.advanceTimersByTimeAsync(1000); await Promise.all([abandoned, fresh]);
        if (condition !== 'dispose') ctx.event({type: 'live_status_changed', state: 'live'});
        ctx.presence.tick();
        expect(ctx.state.presence.localEmote).toBeNull(); expect(ctx.state.presence.cooldown).toBe(0);
        expect(ctx.live.update).not.toHaveBeenCalled();
        expect(ctx.auth.readCrewSeats).not.toHaveBeenCalled();
      } finally { ctx.presence.dispose(); vi.useRealTimers(); }
    });

  it.each([['connecting', 'reconnecting'], ['slow', 'reconnecting'], ['live', 'live'],
    ['offline', 'offline'], ['off', 'off']])('maps %s status to %s', async (state, expected) => {
    const ctx = setup();
    await ctx.presence.refresh(); ctx.event({type: 'live_status_changed', state});
    expect(ctx.state.presence.status).toBe(expected);
  });

  it('maps seats through authorized identities and updates the kit', async () => {
    const ctx = setup();
    ctx.state.crew = {id: playerId(90), mySeat: 1, seats: [
      {seatNo: 1, holder: 'player', name: 'Captain One', kit: 'true_keeper', isMe: true},
      {seatNo: 2, holder: 'player', name: 'Captain Two', kit: 'witness'},
      {seatNo: 3, holder: 'partner', name: 'Partner Three', kit: 'informant'},
      {seatNo: 4, holder: 'open', name: 'Open seat', kit: null}]};
    ctx.auth.readCrewSeats.mockResolvedValue({ok: true, seats: [{seatNo: 2, playerId: playerId(2)}]});
    await ctx.presence.refresh();
    ctx.event({...roster(), crew: [{id: playerId(2), name: 'Captain Two', place: 'saltreach_harbor'}]});
    expect(ctx.live.setCrew).toHaveBeenLastCalledWith({id: playerId(90), memberIds: [playerId(2)]});
    expect(ctx.state.presence.crew).toMatchObject([{seat: 1, online: true},
      {seat: 2, online: true, place: 'saltreach_harbor'}, {seat: 3, online: false, isPartner: true}]);
    expect(JSON.stringify(ctx.state.presence.crew)).not.toContain(playerId(2));
    ctx.state.me.kit = 'stranger'; await ctx.presence.refresh();
    expect(ctx.live.setKit).toHaveBeenLastCalledWith('stranger');
  });

  it('starts a fresh membership read when seats change under the same crew ID', async () => {
    const first = deferred(), latest = deferred(), ctx = setup();
    ctx.state.crew = {id: playerId(90), seats: [
      {seatNo: 2, holder: 'player', name: 'Captain Two', kit: 'witness'}]};
    ctx.auth.readCrewSeats.mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => latest.promise);
    const firstRefresh = ctx.presence.refresh();
    await vi.waitFor(() => expect(ctx.auth.readCrewSeats).toHaveBeenCalledTimes(1));
    ctx.state.crew.seats = [{seatNo: 2, holder: 'player', name: 'Captain Three', kit: 'stranger'}];
    const latestRefresh = ctx.presence.refresh();
    await vi.waitFor(() => expect(ctx.auth.readCrewSeats).toHaveBeenCalledTimes(2));
    latest.resolve({ok: true, seats: [{playerId: playerId(3), seatNo: 2}]});
    await latestRefresh;
    ctx.event({...roster(), crew: [{id: playerId(3), place: 'saltreach_harbor'}]});
    expect(ctx.live.setCrew).toHaveBeenLastCalledWith({id: playerId(90), memberIds: [playerId(3)]});
    expect(ctx.state.presence.crew).toMatchObject([{seat: 2, name: 'Captain Three', online: true}]);
    first.resolve({ok: true, seats: [{playerId: playerId(2), seatNo: 2}]});
    await firstRefresh;
    expect(ctx.live.setCrew).toHaveBeenLastCalledWith({id: playerId(90), memberIds: [playerId(3)]});
    expect(ctx.state.presence.crew).toMatchObject([{seat: 2, name: 'Captain Three', online: true}]);
  });

  it('keeps the latest membership read after an out-of-order A to B to A roster change', async () => {
    const first = deferred(), middle = deferred(), latest = deferred(), ctx = setup();
    const originalCrew = {id: playerId(90), seats: [
      {seatNo: 2, holder: 'player', name: 'Captain Two', kit: 'witness'}]};
    ctx.state.crew = originalCrew;
    ctx.auth.readCrewSeats.mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => middle.promise).mockImplementationOnce(() => latest.promise);
    const firstRefresh = ctx.presence.refresh();
    await vi.waitFor(() => expect(ctx.auth.readCrewSeats).toHaveBeenCalledTimes(1));
    ctx.state.crew = {id: playerId(91), seats: []};
    const middleRefresh = ctx.presence.refresh();
    await vi.waitFor(() => expect(ctx.auth.readCrewSeats).toHaveBeenCalledTimes(2));
    ctx.state.crew = originalCrew;
    const latestRefresh = ctx.presence.refresh();
    await vi.waitFor(() => expect(ctx.auth.readCrewSeats).toHaveBeenCalledTimes(3));
    latest.resolve({ok: true, seats: [{playerId: playerId(4), seatNo: 2}]});
    await latestRefresh;
    middle.resolve({ok: true, seats: [{playerId: playerId(3), seatNo: 2}]});
    await middleRefresh;
    first.resolve({ok: true, seats: [{playerId: playerId(2), seatNo: 2}]});
    await firstRefresh;
    expect(ctx.live.setCrew).toHaveBeenLastCalledWith({id: playerId(90), memberIds: [playerId(4)]});
    expect(ctx.startRealtime).toHaveBeenCalledTimes(1);
  });

  it('keeps the crew room without member flags when the authorized read fails', async () => {
    const ctx = setup(); ctx.state.crew = {id: playerId(90), seats: []};
    ctx.auth.readCrewSeats.mockRejectedValue(new Error('refused'));
    await ctx.presence.refresh();
    expect(ctx.live.setCrew).toHaveBeenLastCalledWith({id: playerId(90), memberIds: []});
  });

  it('shows emotes for 1.8 seconds and applies the three-second cooldown', async () => {
    const ctx = setup(); await ctx.presence.refresh();
    ctx.event({type: 'live_status_changed', state: 'live'});
    expect(ctx.presence.setEmote('point').accepted).toBe(true);
    expect(ctx.state.presence.localEmote.id).toBe('point');
    expect(ctx.presence.setEmote('wave').reason).toBe('emote_cooldown');
    ctx.advance(1800); ctx.presence.tick();
    expect(ctx.state.presence.localEmote).toBeNull();
    expect(ctx.state.presence.canEmote).toBe(false);
    ctx.advance(1200); ctx.presence.tick();
    expect(ctx.state.presence.canEmote).toBe(true);
    ctx.live.emote.mockReturnValue(false);
    expect(ctx.presence.setEmote('lantern').reason).toBe('emote_cooldown');
    expect(ctx.presence.setEmote('help').reason).toBe('invalid_emote');
  });

  it('expires peer emotes without publishing every frame', async () => {
    const ctx = setup(); await ctx.presence.refresh(); ctx.event(roster()); ctx.event(move());
    ctx.event({type: 'live_peer_emoted', id: playerId(2), emote: 'lantern'});
    expect(ctx.state.presence.others[0].emote).toBe('lantern');
    const calls = ctx.store.commit.mock.calls.length;
    for (let index = 0; index < 60; index += 1) { ctx.advance(16); ctx.presence.tick(); }
    expect(ctx.store.commit).toHaveBeenCalledTimes(calls);
    ctx.advance(840); ctx.presence.tick();
    expect(ctx.state.presence.others[0].emote).toBeNull();
  });

  it('forwards crew hints without interpreting game outcomes', async () => {
    const ctx = setup(); await ctx.presence.refresh(); ctx.state.case = {writeRevision: 3};
    const event = {type: 'live_crew_updated', kind: 'crew_changed', data: {version: 4}};
    ctx.event(event);
    expect(ctx.onCrewUpdated).toHaveBeenCalledWith({kind: 'crew_changed', data: {version: 4}});
    expect(ctx.onCaseHint).toHaveBeenCalledWith(4);
    ctx.event({...event, data: {version: 3}});
    expect(ctx.onCaseHint).toHaveBeenCalledTimes(1);
    expect(ctx.emit).toHaveBeenCalledWith(event);
  });

  it.each(['logout', 'flag_off', 'scope_changed', 'dispose'])('rejects stale loader after %s', async condition => {
    const wait = deferred(); const loadRealtime = vi.fn(() => wait.promise);
    const ctx = setup({loadRealtime}); const pending = ctx.presence.refresh();
    await vi.waitFor(() => expect(loadRealtime).toHaveBeenCalledTimes(1));
    if (condition === 'logout') ctx.session.clearToken();
    if (condition === 'flag_off') ctx.state.config.flags.live_presence = false;
    if (condition === 'scope_changed') ctx.scope();
    if (condition === 'dispose') ctx.presence.dispose();
    wait.resolve({startRealtime: ctx.startRealtime}); await pending;
    expect(ctx.startRealtime).not.toHaveBeenCalled();
  });

  it('uses A4 fake rooms for peer movement and the approved point emote', async () => {
    vi.useFakeTimers();
    const client = createFakeClient({names: {[playerId(2)]: 'Captain Two'}});
    const ctx = setup({loadRealtime: async () => ({startRealtime: options =>
      startA4({...options, createClient: () => client, random: () => 0, now: Date.now})})});
    ctx.ctx.now = Date.now;
    try {
      await ctx.presence.refresh();
      ctx.presence.reportPosition({place: 'saltreach_harbor', x: 0, y: 1, facing: 'front', moving: true});
      await vi.advanceTimersByTimeAsync(0);
      const world = client.open('live:world');
      world.status('SUBSCRIBED');
      world.presence(worldOf({[playerId(2)]: ['saltreach_harbor', 1, 'witness']}));
      await vi.advanceTimersByTimeAsync(0);
      const room = client.open('live:place:saltreach_harbor:1');
      room.status('SUBSCRIBED');
      await vi.advanceTimersByTimeAsync(0);
      room.broadcast('position', {v: 1, id: playerId(2), place: 'saltreach_harbor',
        x: 2, z: 3, facing: 'left', moving: true, seq: 1, everyMs: 500});
      expect(ctx.state.presence.others).toMatchObject([{name: 'Captain Two', x: 2, y: 3, facing: 'left'}]);
      expect(ctx.presence.setEmote('point').accepted).toBe(true);
      await vi.advanceTimersByTimeAsync(500);
      expect(room.messages.some(message => message.event === 'emote' && message.payload.emote === 'point')).toBe(true);
    } finally {
      ctx.presence.dispose();
      expect(client.allRemoved).toBe(true);
      vi.useRealTimers();
    }
  });

  it.each(['before_timer', 'during_token'])('cancels the old A4 bootstrap while hidden %s', async stage => {
    vi.useFakeTimers(); const token = deferred(), make = vi.fn(() => createFakeClient());
    const ctx = setup({loadRealtime: async () => ({startRealtime: options => startA4({...options,
      createClient: make, random: () => stage === 'before_timer' ? 1 : 0, now: Date.now})})});
    ctx.ctx.now = Date.now; ctx.auth.getAccessToken.mockImplementation(() => token.promise);
    try {
      await ctx.presence.refresh();
      if (stage === 'during_token') await vi.advanceTimersByTimeAsync(0);
      expect(ctx.auth.getAccessToken).toHaveBeenCalledTimes(stage === 'during_token' ? 1 : 0);
      ctx.presence.setHidden(true);
      token.resolve(`test-${crypto.randomUUID()}`); await vi.advanceTimersByTimeAsync(6000);
      await ctx.presence.refresh();
      expect(make).not.toHaveBeenCalled();
      expect(ctx.auth.getAccessToken).toHaveBeenCalledTimes(stage === 'during_token' ? 1 : 0);
      expect(ctx.state.presence.status).toBe('off');
    } finally { ctx.presence.dispose(); vi.useRealTimers(); }
  });

  it('keeps actual A4 position sends at least 500ms apart across two rapid tab blinks', async () => {
    vi.useFakeTimers(); const clients = [];
    const ctx = setup({loadRealtime: async () => ({startRealtime: options => startA4({...options,
      createClient: () => { const client = createFakeClient(); clients.push(client); return client; },
      random: () => 0, now: Date.now})})});
    ctx.ctx.now = Date.now;
    const join = async client => {
      const world = client.open('live:world'); world.status('SUBSCRIBED');
      world.presence(worldOf({[playerId(2)]: ['saltreach_harbor', 1, 'witness']}));
      await vi.advanceTimersByTimeAsync(0);
      const room = client.open('live:place:saltreach_harbor:1'); room.status('SUBSCRIBED');
      await vi.advanceTimersByTimeAsync(0); return room;
    };
    try {
      await ctx.presence.refresh(); await vi.advanceTimersByTimeAsync(0);
      ctx.presence.reportPosition({place: 'saltreach_harbor', x: 1, y: 2, facing: 'right', moving: true});
      const first = await join(clients[0]);
      expect(first.positions.at(-1)).toMatchObject({x: 1, z: 2, moving: true});
      const firstCount = first.messages.length, sentAt = first.times.at(-1);
      ctx.presence.setHidden(true);
      ctx.presence.reportPosition({place: 'saltreach_harbor', x: 99, y: 99, facing: 'left', moving: true});
      await vi.advanceTimersByTimeAsync(100); ctx.presence.setHidden(false);
      const resumed = ctx.presence.refresh();
      ctx.presence.reportPosition({place: 'saltreach_harbor', x: 4, y: 5, facing: 'front', moving: false});
      await vi.advanceTimersByTimeAsync(399);
      expect(clients).toHaveLength(1); expect(first.messages).toHaveLength(firstCount);
      await vi.advanceTimersByTimeAsync(1); await resumed; await vi.advanceTimersByTimeAsync(1);
      expect(clients).toHaveLength(2);
      expect(clients[1].open('live:world').tracks).toEqual([]);
      const second = await join(clients[1]);
      expect(second.positions[0]).toMatchObject({x: 4, z: 5, facing: 'down', moving: false});
      expect(second.times[0] - sentAt).toBeGreaterThanOrEqual(500);
      ctx.presence.setHidden(true); ctx.presence.setHidden(false);
      const again = ctx.presence.refresh();
      await vi.advanceTimersByTimeAsync(499); expect(clients).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1); await again; await vi.advanceTimersByTimeAsync(1);
      expect(clients).toHaveLength(3);
      expect(first.messages).toHaveLength(firstCount);
      expect(second.positions).toHaveLength(1);
    } finally {
      ctx.presence.dispose(); expect(clients.every(client => client.allRemoved)).toBe(true); vi.useRealTimers();
    }
  });

  it('stops and ignores old private events after logout, including late crew reads', async () => {
    const wait = deferred(), ctx = setup(); ctx.state.crew = {id: playerId(90), seats: []};
    ctx.auth.readCrewSeats.mockImplementation(() => wait.promise);
    const pending = ctx.presence.refresh();
    await vi.waitFor(() => expect(ctx.startRealtime).toHaveBeenCalledTimes(1));
    ctx.presence.stop(); ctx.session.clearToken();
    const calls = ctx.store.commit.mock.calls.length, events = ctx.emit.mock.calls.length;
    ctx.event(roster()); ctx.event(move());
    wait.resolve({ok: true, seats: [{playerId: playerId(2), seatNo: 2}]}); await pending;
    expect(ctx.store.commit).toHaveBeenCalledTimes(calls);
    expect(ctx.emit).toHaveBeenCalledTimes(events);
    expect(ctx.live.stop).toHaveBeenCalledTimes(1);
    expect(ctx.state.presence.status).toBe('off');
  });
});
