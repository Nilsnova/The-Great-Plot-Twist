// The hooks between the island (this lane) and the wave on screen (lane P, src/pirates/). Small and
// free of Three.js, so the wave lane can import it without loading the island.
//
//   import {onWaveStarted, registerWaveRenderer, finishWave} from '../island/wave-hooks.js';
//   const stopRenderer = registerWaveRenderer({name: 'pirates'});   // the island stops its placeholder
//   const stop = onWaveStarted(({waveId, wave, seed, startsAt, weather, flagship, where, defenses}) => {
//     // run src/pirates/sim.js from the seed; the countdown banner is already shown by the island
//   });
//   await finishWave({waveId, survived: true, shipsSunk: 7});      // POST /api/waves/finish, loot toast
//
// The event on the game's bus is `wave_started_server` with exactly the fields above. `where` is
// "own", an island code (ISLE-K7Q2M) or "pirate_point"; `defenses` lists the built spots with their
// place on the island ([{id, kind, x, z}], src/island/spots.js). finishWave answers like api.js:
// {ok: true, data: {loot, coins, waveBest, flags}} or {ok: false, code, message}.
// When the finish route answers, the island emits `wave_finished` {survived, loot, coins, waveId}.
import {on} from '../core/events.js';

export const WAVE_STARTED = 'wave_started_server';
export const WAVE_FINISHED = 'wave_finished';
let renderer = null, finisher = null;

export const onWaveStarted = listener => on(WAVE_STARTED, listener);
export function registerWaveRenderer(value = true) {
  const mine = {value};
  renderer = mine;
  return () => { if (renderer === mine) renderer = null; };
}
export const hasWaveRenderer = () => renderer !== null;
export function finishWave(args) {
  if (!finisher) return Promise.resolve({ok: false, status: 0, code: 'not_ready', message: 'Your island is not ready yet.'});
  return finisher(args);
}
// The island's wave flow installs itself here while it runs.
export function setWaveFinisher(next) {
  finisher = next;
  return () => { if (finisher === next) finisher = null; };
}
