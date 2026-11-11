// The waves in the running game (game.js loads this with the island game, or for the ?demo=1 rehearsal):
// lane P's mountPirates with the island lane's hooks and the core lane's rooms.
//   - getDefenses: the built walls, cannons, watchtower and houses of the island on screen;
//   - finishWave: wave-hooks.js (POST /api/waves/finish and the loot toast); a refusal is thrown with its
//     code and retryAfter, so the controller tries again after 409 wave_too_early;
//   - registerWaveRenderer: the island's placeholder finish stays off while the real wave runs;
//   - the island's room (live:place:isle_<code>:1) follows the player: owner and visitors share shots and
//     repairs, and a wave_start there makes every defender join the running wave (join route + room);
//   - the island's own wall and cannon sprites step aside between wave_controller_started and _stopped;
//   - Pirate Point: the island client (or, in a rehearsal without a server, the in-memory fake) as api.
import {mountPirates} from './index.js';
import {createRoomProxy} from './room.js';
import {finishWave as finishIslandWave, registerWaveRenderer} from '../island/wave-hooks.js';

const ISLAND_PLACE = 'home_islet';
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
  const stops = [], sent = new Set();
  const islandRoom = createRoomProxy();
  let realRoom = null, roomTopic = null, disposed = false;
  const stopRenderer = island ? registerWaveRenderer({name: 'pirates'}) : () => {};
  const finishWave = async body => throwRefusal(await finishIslandWave(body));
  const api = island ? pointApiFrom(island.api) : ctx.fakeApi ?? null;
  // Tower defense v2 (TOWER-DEFENSE.md): levels come with the defenses, crew and captain from GET /api/island,
  // and the break's "Next wave" rings the island's bell again (own island, or the friend's we are visiting).
  // Host and visitors must feed the sim the same island, so both read the defended island's answer (a
  // visitor's comes from the visit route and needs its levels and crew too).
  const own = () => island?.island ?? null, defended = () => island?.visiting ?? own();
  const pirates = mountPirates({...ctx, getDefenses: () => withLevels(island?.defenses() ?? [], defended()), finishWave, api, openRoom, notify,
    islandRoom, islandPlace: ISLAND_PLACE,
    getCrew: () => defended()?.crew ?? null,
    captainLevel: () => own()?.captain?.level ?? 1,
    startNextWave: island ? () => island.flow.ring(island.visiting?.code ?? 'own') : null});

  function followRoom() {
    const place = island && world.current?.id === ISLAND_PLACE ? island.roomPlace() : null;
    const topic = place ? `live:place:${place}:1` : null;
    if (topic === roomTopic) return;
    realRoom?.close?.(); realRoom = topic ? openRoom(topic) : null; roomTopic = topic;
    islandRoom.attach(realRoom);
  }
  if (island) {
    stops.push(on('arrived', followRoom), on('travel', () => { islandRoom.attach(null); realRoom?.close?.(); realRoom = null; roomTopic = null; }));
    // A wave we are in (rung here or joined): tell the island's room once, so the other defenders join too.
    stops.push(on('wave_started_server', event => {
      if (event?.flagship === true || typeof event?.waveId !== 'string' || sent.has(event.waveId)) return;
      sent.add(event.waveId);
      islandRoom.send('wave_start', {waveId: event.waveId, seed: event.seed, startsAt: event.startsAt});
    }));
    stops.push(islandRoom.on('wave_start', payload => {
      if (disposed || typeof payload?.waveId !== 'string' || pirates.island.wave?.info.waveId === payload.waveId) return;
      void island.joinRunningWave().catch(() => {});
    }));
    stops.push(on('wave_controller_started', event => { if (event?.flagship !== true) island.setBattle(true); }));
    stops.push(on('wave_controller_stopped', () => island.setBattle(false)));
    followRoom();
  }
  return {
    pirates,
    get point() { return pirates.point; },
    get island() { return pirates.island; },
    ringPiratePoint: () => pirates.point?.ringBell() ?? Promise.resolve(false),
    dispose() {
      if (disposed) return; disposed = true;
      for (const stop of stops.splice(0)) stop?.();
      stopRenderer(); pirates.dispose(); islandRoom.close(); realRoom?.close?.(); island?.setBattle(false);
    },
  };
}
