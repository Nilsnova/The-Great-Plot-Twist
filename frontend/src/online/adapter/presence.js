// A4 owns connections and rate limits; this adapter holds only cosmetic peer data and safe display IDs.
import {emit as busEmit} from '../../core/events.js';
import {EMOTE_COOLDOWN_MS, MAX_COORD, MIN_GAP_MS, isPlaceId, isPlayerId} from '../../net/live-rules.js';
import {attachExtraSender, wantsClassHarbor} from '../../net/live-extras.js';
import {ONLINE_EMOTES, wireFacing, presenceStatus, projectOnlinePresence} from './presence-view.js';

const BUBBLE_MS = 1800;
export function createOnlinePresence(ctx, {loadRealtime = () => import('../realtime.js'), emit = busEmit,
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL,
  publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY} = {}) {
  const {state, store, session} = ctx;
  const opaqueIds = new Map(), positions = new Map();
  let serial = 0, generation = 0, identity = null, disposed = false, stopping = false, record = null, pending = null;
  let status = 'off', place = null, shown = [], onlineCrew = [], memberSeats = [], hiddenCount = 0;
  let localEmote = null, cooldownUntil = 0, nextTick = Infinity;
  let hidden = Boolean(ctx.document?.hidden), restartAt = 0, lastForwardAt = -Infinity, restartWait = null, pendingPosition = null;
  let positionSequence = 0, detachExtras = null;
  const opaqueId = id => {
    if (!opaqueIds.has(id)) opaqueIds.set(id, `live-captain-${++serial}`);
    return opaqueIds.get(id);
  };
  function permitted() {
    const name = state.nameReply?.captainName ?? state.me?.captainName;
    return !disposed && !store.isClosed() && session.isSignedIn() && isPlayerId(state.me?.id)
      && typeof name === 'string' && !!name.trim() && state.config?.flags?.live_presence === true
      && !!supabaseUrl && !!publishableKey;
  }
  const current = token => token === generation && permitted()
    && identity === `${store.scope()}:${state.me.id}`;
  function publish() {
    if (disposed || store.isClosed()) return;
    const now = ctx.now();
    nextTick = cooldownUntil > now ? Math.min(cooldownUntil, now + 1000) : Infinity;
    if (localEmote?.until > now) nextTick = Math.min(nextTick, localEmote.until);
    for (const sample of positions.values()) if (sample.emoteUntil > now) nextTick = Math.min(nextTick, sample.emoteUntil);
    const next = projectOnlinePresence({status, place, shown, positions, onlineCrew,
      memberSeats, hiddenCount, crew: state.crew, me: state.me, localEmote, cooldownUntil, now, opaqueId});
    const {sampledAt: previousAt, ...previous} = state.presence ?? {};
    const {sampledAt: nextAt, ...display} = next;
    if (JSON.stringify(previous) !== JSON.stringify(display)) store.commit({presence: next});
  }
  function stop({forget = true, preserveCosmetics = false} = {}) {
    generation += 1; pending = null;
    const waiting = restartWait; restartWait = null;
    if (waiting) { clearTimeout(waiting.timer); waiting.resolve(); }
    const previous = record; record = null;
    detachExtras?.(); detachExtras = null;
    stopping = true;
    try { previous?.live.stop(); } catch { /* Always clear the held peer data. */ }
    finally { stopping = false; }
    status = 'off'; place = null; shown = []; onlineCrew = []; memberSeats = []; hiddenCount = 0;
    positions.clear(); nextTick = Infinity; pendingPosition = null;
    if (!preserveCosmetics) { localEmote = null; cooldownUntil = 0; restartAt = 0; lastForwardAt = -Infinity; }
    if (forget) { opaqueIds.clear(); serial = 0; identity = null; }
    publish();
  }
  function receive(event, token) {
    if (!event || typeof event.type !== 'string') return;
    if (stopping) {
      if (event.type === 'live_status_changed' && event.state === 'off') {
        try { emit(event); } catch { /* The final A4 status cannot interrupt cleanup. */ }
      }
      return;
    }
    if (!current(token)) return;
    if (event.type === 'live_status_changed') status = presenceStatus(event.state);
    if (event.type === 'live_presence_changed') {
      const changedPlace = place !== event.place;
      place = isPlaceId(event.place) ? event.place : null;
      shown = (Array.isArray(event.shown) ? event.shown : []).filter(peer => isPlayerId(peer?.id));
      onlineCrew = (Array.isArray(event.crew) ? event.crew : []).filter(peer => isPlayerId(peer?.id));
      hiddenCount = Number.isFinite(event.hiddenCount) ? Math.max(0, event.hiddenCount) : 0;
      const present = new Set(shown.map(peer => peer.id));
      for (const id of positions.keys()) if (changedPlace || !present.has(id)) positions.delete(id);
    }
    if (event.type === 'live_peer_moved' && shown.some(peer => peer.id === event.id)
      && Number.isFinite(event.x) && Number.isFinite(event.z)
      && Math.abs(event.x) <= MAX_COORD && Math.abs(event.z) <= MAX_COORD) {
      const previous = positions.get(event.id);
      positions.set(event.id, {...previous, x: event.x, y: event.z,
        facing: event.facing, moving: event.moving === true, at: ctx.now()});
    }
    if (event.type === 'live_peer_emoted' && ONLINE_EMOTES.includes(event.emote)) {
      const sample = positions.get(event.id);
      if (sample) { sample.emote = event.emote; sample.emoteUntil = ctx.now() + BUBBLE_MS; }
    }
    // Crew room events have no reader since crews left with the mystery (10 Nov); they still reach the bus.
    if (event.type !== 'live_crew_updated') publish();
    try { emit(event); } catch { /* Preserve A4 events without giving listeners ownership of this lifecycle. */ }
  }
  async function updateCrew(active, token) {
    if (hidden || !current(token) || record !== active) return;
    const snapshot = state.crew ?? null;
    const crewId = snapshot?.id ?? null;
    const roster = JSON.stringify(snapshot);
    active.live.setKit(state.me?.kit?.id ?? state.me?.kit ?? null);
    if (hidden || !current(token) || record !== active) return;
    if (active.crewTask?.snapshot === snapshot && active.crewTask.roster === roster) {
      return active.crewTask.promise;
    }
    active.live.setCrew(crewId ? {id: crewId, memberIds: []} : null);
    memberSeats = [];
    if (hidden || !current(token) || record !== active) return;
    if (!crewId) { active.crewTask = null; onlineCrew = []; publish(); return; }
    const task = {id: crewId, snapshot, roster, promise: null};
    active.crewTask = task;
    task.promise = (async () => {
      let reply;
      try { reply = await ctx.auth?.readCrewSeats?.(crewId); } catch { /* The crew room works without flags. */ }
      if (hidden || !current(token) || record !== active || active.crewTask !== task
        || state.crew !== snapshot || JSON.stringify(state.crew) !== roster) return;
      memberSeats = reply?.ok && Array.isArray(reply.seats) ? reply.seats.filter(member =>
        isPlayerId(member?.playerId) && Number.isInteger(member.seatNo) && member.seatNo >= 1 && member.seatNo <= 4) : [];
      active.live.setCrew({id: crewId, memberIds: memberSeats.map(member => member.playerId)});
      publish();
    })().finally(() => { if (active.crewTask === task) active.crewTask = null; });
    return task.promise;
  }
  async function refresh() {
    if (!permitted()) { stop(); return; }
    const nextIdentity = `${store.scope()}:${state.me.id}`;
    if (identity !== nextIdentity) { stop(); identity = nextIdentity; }
    if (hidden) return;
    if (record) return updateCrew(record, generation);
    if (pending) return pending;
    const token = ++generation;
    status = 'reconnecting'; publish();
    const task = (async () => {
      try {
        await Promise.resolve();
        if (hidden || !current(token)) return;
        const delay = restartAt - ctx.now();
        if (delay > 0) await new Promise(resolve => {
          const waiting = {resolve, timer: null}; restartWait = waiting;
          waiting.timer = setTimeout(() => {
            if (restartWait === waiting) restartWait = null;
            resolve();
          }, delay);
          waiting.timer?.unref?.();
        });
        if (hidden || !current(token)) return;
        const module = await Promise.resolve().then(loadRealtime);
        if (hidden || !current(token)) return;
        const live = module.startRealtime({enabled: true, playerId: state.me.id, kit: state.me.kit?.id ?? state.me.kit,
          crew: state.crew?.id ? {id: state.crew.id, memberIds: []} : null,
          getAccessToken: () => current(token) ? ctx.auth.getAccessToken() : Promise.resolve(null),
          supabaseUrl, publishableKey, random: ctx.random, now: ctx.now, classHarbor: wantsClassHarbor(),
          emit: event => receive(event, token)});
        if (!current(token)) { live.stop(); return; }
        const active = {live, crewTask: null, localPlace: null}; record = active;
        detachExtras?.();
        detachExtras = attachExtraSender((event, data) => record === active && current(token) && !hidden
          && active.live.extra?.(event, data) === true, {
          resolve: displayId => [...opaqueIds].find(([, value]) => value === displayId)?.[0] ?? null,
          isMe: id => isPlayerId(id) && id === state.me?.id});
        if (place) { active.localPlace = place; live.setPlace(place); }
        if (hidden || !current(token) || record !== active) { if (record === active) stop(); return; }
        const queued = pendingPosition; pendingPosition = null;
        if (queued?.token === token && queued.identity === identity && queued.sample.place === place) {
          lastForwardAt = ctx.now();
          const {x, z, facing, moving} = queued.sample;
          live.update({x, z, facing, moving});
        }
        await updateCrew(active, token);
      } catch {
        if (pendingPosition?.token === token) pendingPosition = null;
        if (current(token)) { status = 'offline'; publish(); }
      } finally {
        if (pendingPosition?.token === token && (hidden || !current(token))) pendingPosition = null;
        if (pending === task) pending = null;
      }
    })();
    pending = task;
    return task;
  }
  function reportPosition(sample) {
    if (stopping || !current(generation)) { pendingPosition = null; return ctx.refuse('feature_off'); }
    if (!sample || !isPlaceId(sample.place) || !Number.isFinite(sample.x) || !Number.isFinite(sample.y)
      || Math.abs(sample.x) > MAX_COORD || Math.abs(sample.y) > MAX_COORD
      || !['front', 'back', 'left', 'right'].includes(sample.facing) || typeof sample.moving !== 'boolean') {
      return ctx.refuse('invalid_position');
    }
    if (hidden) return ctx.accept('Position updated.');
    const token = generation, sequence = ++positionSequence;
    const outbound = {place: sample.place, x: sample.x, z: sample.y,
      facing: wireFacing(sample.facing), moving: sample.moving};
    if (place !== outbound.place) {
      place = outbound.place; shown = []; positions.clear(); publish();
    }
    if (hidden || stopping || !current(token) || sequence !== positionSequence) return ctx.accept('Position updated.');
    const active = record;
    if (active) {
      pendingPosition = null;
      if (active.localPlace !== outbound.place) {
        active.localPlace = outbound.place; active.live.setPlace(outbound.place);
      }
      if (hidden || stopping || !current(token) || record !== active || sequence !== positionSequence) {
        return ctx.accept('Position updated.');
      }
      lastForwardAt = ctx.now();
      const {x, z, facing, moving} = outbound;
      active.live.update({x, z, facing, moving});
    } else pendingPosition = {token, identity, sample: outbound};
    return ctx.accept('Position updated.');
  }
  function setHidden(value) {
    if (disposed) return;
    const next = Boolean(value);
    if (hidden === next) return;
    hidden = next;
    if (!hidden) return;
    if (!permitted() || identity !== `${store.scope()}:${state.me?.id}`) { stop(); return; }
    // A fresh sender must not bypass A4's 500ms minimum allowance during a quick tab blink.
    if (record) restartAt = Math.max(restartAt, ctx.now() + MIN_GAP_MS, lastForwardAt + MIN_GAP_MS);
    stop({forget: false, preserveCosmetics: true});
  }
  function setEmote(id) {
    if (!ONLINE_EMOTES.includes(id)) return ctx.refuse('invalid_emote');
    if (hidden || !permitted() || status !== 'live' || cooldownUntil > ctx.now() || !record?.live.emote(id)) {
      return ctx.refuse('emote_cooldown');
    }
    cooldownUntil = ctx.now() + EMOTE_COOLDOWN_MS;
    localEmote = {id, until: ctx.now() + BUBBLE_MS}; publish();
    return ctx.accept('Emote shown.');
  }
  function tick() {
    if (disposed || ctx.now() < nextTick) return;
    publish();
  }
  function dispose() { if (disposed) return; stop(); disposed = true; }
  return {refresh, reportPosition, setHidden, setEmote, tick, stop, dispose};
}
