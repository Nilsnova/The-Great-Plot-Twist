// The waves in the running game (game.js loads this with the island game, or for the ?demo=1 rehearsal):
// lane P's mountPirates with the island lane's hooks and the core lane's rooms.
//   - getDefenses: the built walls, cannons, watchtower and houses of the island on screen;
//   - finishWave: wave-hooks.js (POST /api/waves/finish and the loot toast); a refusal is thrown with its
//     code and retryAfter, so the controller tries again after 409 wave_too_early;
//   - registerWaveRenderer: the island's placeholder finish stays off while the real wave runs;
//   - the island's room (live:place:isle_<code>:1) follows the player: owner and visitors share shots and
//     repairs, and a wave_start there makes every defender join the running wave (join route + room).
//     The room is checked every second as well as on arrival: the owner's code is only known once the
//     island answered, and sailing home from a visit changes the room without a new landing. wave_start
//     goes out again 2 and 6 s later for a friend whose room was still joining;
//   - landing on an island where a wave runs joins it (once per landing), so a friend who comes late
//     fights too; a "Next wave" that finds the other captain's wave running joins it (island ringBell);
//   - co-op builds: every build or upgrade sends island_changed into the room (Pirate Point's for its
//     spots), and every other defender reads that island again within about a second; a tear-down
//     (GAME-V3.md §4.2) adds who got coins back ({who, kind, level, refunds}), for their toast;
//   - the island's own wall and cannon sprites step aside between wave_controller_started and _stopped;
//   - Pirate Point: the island client (or, in a rehearsal without a server, the in-memory fake) as api;
//   - the game (GAME-V3.md §2, src/island/game-room.js) rides on the same island room: the lobby's Start,
//     who is online, and the room-wide Pause that holds the break open (the break card's Pause button).
import {mountPirates} from './index.js';
import {createGameRoom} from '../island/game-room.js';
import {createRoomProxy} from './room.js';
import {finishWave as finishIslandWave, registerWaveRenderer} from '../island/wave-hooks.js';
import {defenses as spotDefenses} from '../island/spots.js';
import {figurePositions, hiddenFigures, matchFigures} from './figures.js';
import {figurePoses} from './poses.js';

const ISLAND_PLACE = 'home_islet';
export const SPOTS_CHANGED = 'island_spots_changed'; // src/island/index.js
export const WAVE_START_AGAIN_MS = [2000, 6000];
const CHANGED_DELAY_MS = 400, JOIN_RETRY_MS = 1200, JOIN_TRIES = 4;
// A room message can get lost (the room was still joining, the connection hiccuped): a build or upgrade is
// told once more a little later, and the island on screen is read again every REREAD_SECONDS on its own,
// so an upgrade of a friend never waits for a reload.
export const CHANGED_AGAIN_MS = 3000, REREAD_SECONDS = 15;
// The island client answers {ok, data} or {ok: false, code, message, retryAfterSeconds}; lane P's code
// wants the data or a thrown error with the code (the fake-api.js shape).
export function throwRefusal(answer) {
  if (answer?.ok) return answer.data;
  const error = new Error(answer?.message || 'That did not work. Try again.');
  Object.assign(error, {code: answer?.code ?? 'unknown', status: answer?.status ?? 0, retryAfter: answer?.retryAfterSeconds ?? null});
  throw error;
}
export function pointApiFrom(islandApi) {
  return {
    startWave: async ({where}) => throwRefusal(await islandApi.startWave({where})),
    joinWave: async ({waveId}) => throwRefusal(await islandApi.joinWave({waveId})),
    currentWave: async where => throwRefusal(await islandApi.currentWave({where})),
    finishWave: async body => throwRefusal(await islandApi.finishWave(body)),
  };
}

// The spots' levels from the island answer ({spots: [{id, level}]}), when the island lane leaves them out.
export function withLevels(defenses, islandAnswer) {
  const levels = new Map((islandAnswer?.spots ?? []).map(item => [item?.id, item?.level]));
  return defenses.map(item => (Number.isInteger(item.level) || !Number.isInteger(levels.get(item.id)) ? item : {...item, level: levels.get(item.id)}));
}

export function wireWaves(ctx) {
  const {island = null, on, world, openRoom = () => null, notify = () => {}} = ctx;
  const every = ctx.every ?? ((run, ms) => { const id = setInterval(run, ms); return () => clearInterval(id); });
  const later = ctx.later ?? ((run, ms) => { const id = setTimeout(run, ms); return () => clearTimeout(id); });
  const stops = [], sent = new Set(), timers = new Set();
  const after = (run, ms) => { const cancel = later(() => { timers.delete(cancel); if (!disposed) run(); }, ms); timers.add(cancel); };
  let landed = false, changedSoon = false;
  const islandRoom = createRoomProxy();
  let realRoom = null, roomTopic = null, disposed = false;
  let figureMatches = new Map(); // sim captain id -> presence figure, from the last figures() (poses())
  const stopRenderer = island ? registerWaveRenderer({name: 'pirates'}) : () => {};
  const finishWave = async body => throwRefusal(await finishIslandWave(body));
  const api = island ? pointApiFrom(island.api) : ctx.fakeApi ?? null;
  // Tower defense v2 (TOWER-DEFENSE.md): levels come with the defenses, crew and captain from GET /api/island,
  // and the break's "Next wave" rings the island's bell again (own island, or the friend's we are visiting).
  // Host and visitors must feed the sim the same island, so both read the defended island's answer (a
  // visitor's comes from the visit route and needs its levels and crew too).
  const own = () => island?.island ?? null, defended = () => island?.visiting ?? own();
  // The game's room state: Start, Pause and who is online, on the island's room (game_hello, game_state).
  const game = island ? createGameRoom({room: islandRoom, emit: ctx.emit ?? (() => {}), later, every, onChange: () => island.refreshLobby?.()}) : null;
  if (game) island.attachGame?.(game);
  const pirates = mountPirates({...ctx, getDefenses: () => withLevels(island?.defenses() ?? [], defended()), finishWave, api, openRoom, notify,
    islandRoom, islandPlace: ISLAND_PLACE,
    getCrew: () => defended()?.crew ?? null,
    getPointDefenses: () => (island?.point ? spotDefenses(island.point.spots ?? []) : null),
    captainLevel: () => own()?.captain?.level ?? 1,
    captainSkills: () => island?.captainLoadout?.().skills ?? [],
    captainWeapon: () => island?.captainLoadout?.().weapon ?? 'musket',
    captainColour: () => island?.captainColour?.() ?? 0,
    // Captain health (GAME-V3.md §3): the reviver pays on the server (the in-memory fake in a rehearsal).
    reviveCaptain: island ? async body => throwRefusal(await island.reviveCaptain(body))
      : ctx.fakeApi?.reviveCaptain ? body => ctx.fakeApi.reviveCaptain({...body, actionUid: `revive-${Date.now().toString(36)}`}) : null,
    // Pirate Point's shared spots once more before its battle, so every captain fights the same towers.
    beforePointWave: island ? () => island.loadPoint() : null,
    startNextWave: island ? () => island.ringBell() : null,
    // The room-wide Pause between waves: the break stays open and Auto next waits (GAME-V3.md §2).
    holdBreak: game ? () => game.hold() : null, toggleHold: game ? () => game.togglePause() : null});

  function followRoom() {
    const place = island && world.current?.id === ISLAND_PLACE ? island.roomPlace() : null;
    const topic = place ? `live:place:${place}:1` : null;
    if (topic === roomTopic) return;
    realRoom?.close?.(); realRoom = topic ? openRoom(topic) : null; roomTopic = topic;
    islandRoom.attach(realRoom);
    if (realRoom) game?.roomChanged();
  }
  // Join the wave running on this island (a wave_start in the room, or landing while one runs). The bell
  // may be busy with our own ring for a moment: try again a few times.
  // One join attempt at a time: the repeated wave_start of every defender (and the retries) would
  // otherwise ask the server again and again (wave reads have a budget of 30 a minute).
  // A retry owns the flag: when it finds its wave already joined (our own "Next wave" ring joined it while
  // the bell was busy), it lets go of the flag, or every later wave_start would be dropped for good.
  let joining = false;
  function joinRunning(waveId = null, tries = JOIN_TRIES, retry = false) {
    if (disposed || (joining && !retry)) return;
    if (waveId && pirates.island.wave?.info.waveId === waveId) { if (retry) joining = false; return; }
    joining = true;
    Promise.resolve().then(() => island.joinRunningWave()).then(answer => {
      if (answer?.code === 'busy' && tries > 1 && !disposed) { after(() => joinRunning(waveId, tries - 1, true), JOIN_RETRY_MS); return; }
      joining = false;
    }, () => { joining = false; });
  }
  // Every second: the room of the island we stand on, and once per landing a wave already running there.
  function tick() {
    if (disposed) return;
    followRoom();
    if (world.current?.id === ISLAND_PLACE && island && ++quiet >= REREAD_SECONDS && globalThis.document?.visibilityState !== 'hidden') void readIsland();
    if (!landed || world.current?.id !== ISLAND_PLACE || pirates.island.wave) return;
    const ready = island.visiting ? !!island.visiting.ownerName : !!island.island;
    if (!ready) return;
    landed = false;
    joinRunning();
  }
  // The wave on screen (in its break, or the Pirate Point one) draws its towers from its own list: give it the new levels.
  const relevel = () => { try { pirates.island.refreshDefenses?.(); pirates.point?.controller?.refreshDefenses?.(); } catch { /* A drawing cannot stop the island. */ } };
  let quiet = 0;
  async function readIsland() {
    quiet = 0;
    try { await island.refreshDefended?.(); relevel(); } catch { /* The island as we had it. */ }
  }
  function changed() {
    if (changedSoon) return;
    changedSoon = true;
    after(() => { changedSoon = false; void readIsland(); }, CHANGED_DELAY_MS);
  }
  if (island) {
    stops.push(on('arrived', event => { if (event?.place === ISLAND_PLACE) landed = true; followRoom(); }),
      on('travel', () => { landed = false; islandRoom.attach(null); realRoom?.close?.(); realRoom = null; roomTopic = null; }));
    stops.push(every(tick, 1000));
    // A wave we are in (rung here or joined): tell the island's room, so the other defenders join too;
    // again a little later for a friend whose room was still joining (a repeat changes nothing).
    stops.push(on('wave_started_server', event => {
      if (event?.flagship === true || typeof event?.waveId !== 'string' || sent.has(event.waveId)) return;
      sent.add(event.waveId);
      const message = {waveId: event.waveId, seed: event.seed, startsAt: event.startsAt};
      islandRoom.send('wave_start', message);
      for (const ms of WAVE_START_AGAIN_MS) after(() => { if (pirates.island.wave?.info.waveId === event.waveId) islandRoom.send('wave_start', message); }, ms);
    }));
    stops.push(islandRoom.on('wave_start', payload => {
      if (disposed || typeof payload?.waveId !== 'string') return;
      joinRunning(payload.waveId);
    }));
    // Co-op builds (TOWER-DEFENSE.md §6): ours go to the room, a friend's make us read the island again.
    stops.push(on(SPOTS_CHANGED, event => {
      if (typeof event?.spot !== 'string') return;
      // A tear-down (GAME-V3.md §4.2) also says who got coins back, for their toast.
      const note = event.demolished ? {spot: event.spot, demolished: event.demolished} : {spot: event.spot};
      const tell = () => { if (event.place === 'point') pirates.point?.room?.send?.('island_changed', {spot: event.spot}); else islandRoom.send('island_changed', note); };
      tell(); after(tell, CHANGED_AGAIN_MS); relevel();
    }));
    // Back on this tab after a while: the room may have missed something.
    const document = globalThis.document;
    if (document?.addEventListener) {
      const visible = () => { if (!disposed && document.visibilityState === 'visible' && world.current?.id === ISLAND_PLACE) void readIsland(); };
      document.addEventListener('visibilitychange', visible); stops.push(() => document.removeEventListener('visibilitychange', visible));
    }
    stops.push(islandRoom.on('island_changed', payload => {
      if (disposed) return;
      changed();
      if (payload?.demolished) { try { island.heardDemolish?.(payload.demolished); } catch { /* A toast cannot stop the wave. */ } }
    }));
    landed = world.current?.id === ISLAND_PLACE;
    if (pirates.point?.room?.on) stops.push(pirates.point.room.on('island_changed', () => { if (!disposed) void Promise.resolve(island.loadPoint()).then(relevel).catch(() => {}); }));
    stops.push(on('wave_controller_started', event => { if (event?.flagship === true) island.setPointBattle(true); else island.setBattle(true); }));
    stops.push(on('wave_controller_stopped', () => { island.setBattle(false); island.setPointBattle(false); }));
    followRoom();
  }
  return {
    pirates,
    get point() { return pirates.point; },
    get island() { return pirates.island; },
    get game() { return game; },
    ringPiratePoint: () => pirates.point?.ringBell() ?? Promise.resolve(false),
    // Captain health (GAME-V3.md §3): the presence figures drawn now ([{id, x, z, colour}], world/others)
    // against the running wave's captains. Answers the figures to hide (a captain down in the sim lies in
    // the wave's own drawing, not standing as well) and puts the hp bars over the figures; null outside a wave.
    figures(list = []) {
      const controllers = [pirates.island, pirates.point?.controller];
      for (const controller of controllers) if (controller && !controller.wave) controller.setFigures?.(null);
      const controller = controllers.find(item => item?.wave && !item.wave.finished);
      const party = controller?.state?.party;
      figureMatches = new Map();
      if (!controller || !Array.isArray(party) || !party.length) return null;
      const matches = figureMatches = matchFigures({party, figures: list, mine: controller.playerId});
      controller.setFigures?.(figurePositions(matches));
      return hiddenFigures(matches, party);
    },
    // A shot or a blow poses the body that made it (src/pirates/poses.js): {own, figures} with your pose
    // ({kind, flip, age} or null) and Map(presence figure id -> pose) by the matches of figures() above;
    // a shooter with no figure has no pose (no second body). null outside a wave.
    poses() {
      const controller = [pirates.island, pirates.point?.controller].find(item => item?.wave && !item.wave.finished);
      if (!controller?.pose) return null;
      return {own: controller.pose(controller.playerId), figures: figurePoses({get: by => controller.pose(by)}, figureMatches)};
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const stop of stops.splice(0)) stop?.();
      for (const cancel of [...timers]) cancel(); timers.clear();
      stopRenderer(); pirates.dispose(); game?.dispose(); island?.attachGame?.(null); islandRoom.close(); realRoom?.close?.(); island?.setBattle(false);
    },
  };
}
