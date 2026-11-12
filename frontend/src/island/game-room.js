// One game's room state (docs/GAME-V3.md §2): who is online, Start, and the room-wide Pause between waves.
// It rides on the island's live room (live:place:isle_<code>:1, the wave room of src/pirates/game-wiring.js)
// with two small messages that src/net/live-rules.js checks field by field:
//   game_hello {who}                          "I am here" (once on arrival, and a slow heartbeat when there
//                                             is no live presence, as in ?islands=fake)
//   game_state {who, started, paused, first}  Start or Pause/Resume, and the answer to a hello, so a friend
//                                             who arrives later learns that the game is on (or paused)
// `who` is the sender's player id (the ids of GET /api/games/{code}); names are never sent, they come from
// the lobby answer. Who is online comes from the presence of the room when it is live, otherwise from the
// heartbeats. The host may Start and Pause; any member may once the host has been away for 60 s.
// Display and pacing only: nothing here decides loot or waves on the server.
//
//   const game = createGameRoom({room, emit});
//   game.setGame(lobbyAnswer)   game.setPresence({live, ids})   game.start()   game.togglePause()
//   game.state -> {code, me, hostId, members, online, started, paused, pausedBy, canControl, hostAwayMs}
import {GAME_STARTED, HOST_AWAY_MS, canControl, rememberStarted, startedBefore} from './lobby.js';
import {islandCode} from './codes.js';

export const HELLO_MS = 20000; // the heartbeat without a live presence: one hello per player this often
export const ONLINE_MS = 50000; // a heartbeat counts as online this long
export const AGAIN_MS = Object.freeze([2000, 6000]); // a hello or a Start goes out again for a room still joining
export const REPLY_MIN_MS = 200; // an answer to a hello waits a random time in this range, and is skipped
export const REPLY_MAX_MS = 900; // when another player answered first
const WHO = /^[A-Za-z0-9_.:-]{1,64}$/;

const safeLocal = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function createGameRoom({room = null, emit = () => {}, now = () => Date.now(), random = Math.random,
  later = (run, ms) => { const id = setTimeout(run, ms); return () => clearTimeout(id); },
  every = (run, ms) => { const id = setInterval(run, ms); return () => clearInterval(id); },
  storage = safeLocal(), onChange = () => {}} = {}) {
  let game = null, me = null, started = false, paused = null, presence = {live: false, ids: new Set()};
  let openedAt = now(), hostSeenAt = null, disposed = false, replyTimer = null, helloBack = null, lastState = -Infinity;
  const heard = new Map(), timers = new Set(), stops = [];
  const after = (run, ms) => { const cancel = later(() => { timers.delete(cancel); if (!disposed) run(); }, ms); timers.add(cancel); return cancel; };
  const changed = () => { if (!disposed) { try { onChange(); } catch { /* A broken listener cannot stop the room. */ } } };
  const send = (type, data) => { try { return room?.send?.(type, data) === true; } catch { return false; } };

  function online() {
    const ids = new Set(me ? [me] : []);
    if (presence.live) for (const id of presence.ids) ids.add(id);
    else for (const [id, at] of heard) if (now() - at <= ONLINE_MS) ids.add(id);
    return ids;
  }
  function hostAwayMs() {
    if (!game) return 0;
    if (online().has(game.hostId)) { hostSeenAt = now(); return 0; }
    return now() - Math.max(openedAt, hostSeenAt ?? openedAt);
  }
  const control = () => canControl({me, hostId: game?.hostId ?? null, hostAwayMs: hostAwayMs()});
  const nameOf = id => game?.members.find(member => member.id === id)?.name ?? '';

  function hello() {
    if (!game || !me) return;
    send('game_hello', {who: me});
    for (const ms of AGAIN_MS) after(() => { if (game && me) send('game_hello', {who: me}); }, ms);
  }
  const stateOf = first => ({who: me, started, paused: !!paused, first: first === true});
  function shareState(first = false, again = true) {
    if (!game || !me) return;
    lastState = now();
    send('game_state', stateOf(first));
    if (again) for (const ms of AGAIN_MS) after(() => { if (game && me) send('game_state', stateOf(first)); }, ms);
  }
  function becomeStarted(first) {
    if (started) return;
    started = true;
    if (game) rememberStarted(storage, game.code);
    emit({type: GAME_STARTED, first: first === true, code: game?.code ?? null});
  }

  function heardFrom(who) {
    if (typeof who !== 'string' || !WHO.test(who) || who === me) return false;
    const fresh = !heard.has(who) || now() - heard.get(who) > ONLINE_MS;
    heard.set(who, now());
    if (who === game?.hostId) hostSeenAt = now();
    return fresh;
  }
  function onHello(data) {
    if (disposed || !game) return;
    const fresh = heardFrom(data?.who);
    if (fresh) changed();
    // Without a live presence a newcomer learns who is here from our hello back (once: they know us then).
    if (fresh && !presence.live && me && !helloBack) {
      helloBack = after(() => { helloBack = null; send('game_hello', {who: me}); }, REPLY_MIN_MS + random() * (REPLY_MAX_MS - REPLY_MIN_MS));
    }
    // A newcomer learns the state from whoever answers first; the others stay quiet.
    if (!started && !paused) return;
    if (replyTimer) return;
    const asked = now();
    replyTimer = after(() => { replyTimer = null; if (lastState < asked) shareState(false, false); },
      REPLY_MIN_MS + random() * (REPLY_MAX_MS - REPLY_MIN_MS));
  }
  function onState(data) {
    if (disposed || !game || typeof data?.started !== 'boolean' || typeof data?.paused !== 'boolean') return;
    heardFrom(data.who);
    lastState = now();
    if (data.started) becomeStarted(data.first === true);
    const next = data.paused ? {who: data.who, name: nameOf(data.who)} : null;
    if (!!next !== !!paused || (next && paused && next.who !== paused.who)) paused = next;
    changed();
  }
  if (room?.on) {
    for (const [type, handler] of [['game_hello', onHello], ['game_state', onState]]) {
      const stop = room.on(type, handler);
      if (typeof stop === 'function') stops.push(stop);
    }
  }
  // The heartbeat only runs without a live presence (the fake world, or before the presence is up).
  stops.push(every(() => { if (!disposed && game && me && !presence.live) send('game_hello', {who: me}); }, HELLO_MS));

  return {
    // GET /api/games/{code}: {game: {code, ...}, members: [{id, name, role, you}]}. A new code starts afresh.
    setGame(answer) {
      const code = islandCode(answer?.game?.code ?? '');
      const members = Array.isArray(answer?.members) ? answer.members.filter(member => member && typeof member.id === 'string') : [];
      if (!code || !members.length) return false;
      const host = members.find(member => member.role === 'host');
      const fresh = game?.code !== code;
      if (fresh) { started = false; paused = null; heard.clear(); openedAt = now(); hostSeenAt = null; }
      game = {code, hostId: host?.id ?? null, members: members.map(member => ({...member})), waveBest: answer.game.waveBest ?? 0};
      me = members.find(member => member.you === true)?.id ?? me;
      if (fresh) hello();
      changed();
      return true;
    },
    // The live presence of the island's room: {live: true, ids: [...the others]}; {live: false} without it.
    setPresence({live = false, ids = []} = {}) {
      const next = new Set(Array.isArray(ids) || ids instanceof Set ? [...ids].filter(id => typeof id === 'string') : []);
      const same = presence.live === (live === true) && next.size === presence.ids.size && [...next].every(id => presence.ids.has(id));
      presence = {live: live === true, ids: next};
      if (game && next.has(game.hostId)) hostSeenAt = now();
      if (!same) changed();
    },
    // The room came (back): say hello, so the others count us and tell us the state.
    roomChanged() { if (game && me) hello(); },
    start() {
      if (!game || !me || started || !control()) return false;
      const first = (game.waveBest ?? 0) === 0 && !startedBefore(storage, game.code);
      becomeStarted(first);
      shareState(first);
      changed();
      return true;
    },
    togglePause() {
      if (!game || !me || !control()) return false;
      paused = paused ? null : {who: me, name: nameOf(me)};
      shareState(false);
      changed();
      return true;
    },
    // Leaving the game (sailing home, a new game): forget it.
    clear() { game = null; started = false; paused = null; heard.clear(); changed(); },
    get state() {
      return {code: game?.code ?? null, me, hostId: game?.hostId ?? null, members: game ? game.members.map(member => ({...member})) : [],
        online: online(), started, paused: !!paused, pausedBy: paused ? (paused.name || nameOf(paused.who)) : '',
        canControl: control(), hostAwayMs: hostAwayMs(), presenceLive: presence.live};
    },
    // Hold the break open (controller.js): null while not paused, otherwise what the break card says.
    hold() {
      const can = !!game && control();
      if (!paused) return can ? {paused: false, line: '', label: 'Pause', canToggle: true} : null;
      return {paused: true, line: `Paused by ${paused.name || nameOf(paused.who) || 'a captain'}`, label: 'Resume', canToggle: can};
    },
    knows: id => !!game?.members.some(member => member.id === id),
    dispose() {
      if (disposed) return; disposed = true;
      for (const stop of stops.splice(0)) stop?.();
      for (const cancel of [...timers]) cancel(); timers.clear();
    },
  };
}
export {HOST_AWAY_MS};
