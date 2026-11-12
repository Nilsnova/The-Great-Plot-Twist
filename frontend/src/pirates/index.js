// The pirates' single entry for game.js (lane P). One line there, after the world exists:
//
//   const pirates = (await import('./pirates/index.js')).mountPirates({scene, camera: view.camera,
//     canvas: graphics.renderer.domElement, container, player: controller.player, world, input, audio,
//     reducedMotion, quality: () => settings.quality, isBlocked: () => !active || outsideBlocked(), on, emit,
//     getDefenses, finishWave, api, openRoom});           // and pirates.dispose() in dispose()
//
// It runs its own frame loop, so game.js needs no other change. What the other lanes hand in:
//   getDefenses()   the island lane: [{id, kind, x, z}] of the built walls, cannons, watchtower and
//                   houses on the island being defended, in home_islet world units
//   finishWave(body) the island lane: POST /api/waves/finish and show the loot; may throw the API
//                   error ({code: 'wave_too_early', retryAfter}) so the controller retries
//   api             {startWave, joinWave, currentWave, finishWave} for Pirate Point (fake-api.js shape)
//   openRoom(topic) the core lane: a Realtime broadcast room {send, on, close} or null
//                   (live:place:isle_<code>:1 for the island, live:place:pirate_point:1)
//   islandRoom      the current island's room, if the island lane already holds one
//   getCrew()       the island lane: {gunner, carpenter, lookout} hired on the island being defended
//   captainLevel()  this player's captain level (GET /api/island captain.level), 1 to 5
//   captainSkills() this player's learnt skills (GET /api/island skills.known, TOWER-DEFENSE.md §14)
//   captainWeapon() this player's equipped weapon (GET /api/island weapons.equipped, §15)
//   startNextWave() the island lane: the start route again, for the break's "Next wave" (§1)
//   holdBreak()     the game's room-wide Pause (GAME-V3.md §2): null, or {paused, line, label, canToggle}
//   toggleHold()    the break card's Pause / Resume button
//   captainColour() your lobby colour 0-9 (your poses, and your fallen captain on every screen)
//   reviveCaptain({waveId, fallen})  captain health (GAME-V3.md §3): POST /api/waves/revive, the reviver pays
//                   20 + 5 × wave; throws the refusal (its message is shown). Without it a revive is free.
// The island lane emits `wave_started_server` on the bus after its start/join route answered.
import { createWaveController } from './controller.js';
import { createPiratePoint } from './pirate-point.js';
import { startLoop } from '../core/loop.js';
import * as THREE from 'three';

export function mountPirates(ctx) {
  const { scene, camera, canvas, container, player, world: places, audio, on, emit } = ctx;
  const bus = ctx.bus ?? { on, emit };
  const projected = new THREE.Vector3();
  const world = {
    scene, camera, canvas, container, player,
    place: () => places?.current?.id ?? null,
    isBlocked: () => !!ctx.isBlocked?.(),
    unproject(clientX, clientY) {
      if (!canvas || !camera) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      projected.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2, 0).unproject(camera);
      return { x: projected.x, z: -projected.y / .72 };
    },
    // The other way: island units (lifted `lift` drawn units) to px inside the container, or null.
    project(x, z, lift = 0) {
      if (!canvas || !camera) return null;
      const rect = canvas.getBoundingClientRect(), box = container?.getBoundingClientRect?.() ?? rect;
      if (!rect.width || !rect.height) return null;
      projected.set(x, -z * .72 + lift, 0).project(camera);
      return { x: rect.left - box.left + (projected.x + 1) / 2 * rect.width, y: rect.top - box.top + (1 - projected.y) / 2 * rect.height };
    },
  };
  const shared = { bus, world, sound: audio, reducedMotion: ctx.reducedMotion ?? (() => false), quality: ctx.quality ?? (() => 'high'),
    playerId: ctx.playerId, captainLevel: ctx.captainLevel ?? (() => 1), captainSkills: ctx.captainSkills ?? (() => []),
    captainWeapon: ctx.captainWeapon ?? (() => 'musket'), captainColour: ctx.captainColour ?? (() => 0),
    reviveCaptain: ctx.reviveCaptain ?? null };
  const island = createWaveController({ ...shared, getDefenses: ctx.getDefenses ?? (() => []), finishWave: ctx.finishWave,
    room: ctx.islandRoom ?? null, place: ctx.islandPlace ?? 'home_islet', simOptions: ctx.islandSimOptions ?? {},
    getCrew: ctx.getCrew ?? (() => null), startNextWave: ctx.startNextWave ?? null,
    holdBreak: ctx.holdBreak ?? null, toggleHold: ctx.toggleHold ?? null });
  const point = ctx.api ? createPiratePoint({ ...shared, api: ctx.api, openRoom: ctx.openRoom, input: ctx.input, getDefenses: ctx.getPointDefenses,
    rehearsal: ctx.rehearsal === true, host: ctx.host === true, notify: ctx.notify, beforeStart: ctx.beforePointWave ?? null }) : null;
  const update = dt => { island.update(dt); point?.update(dt); };
  const stopLoop = ctx.loop === false ? () => {} : startLoop(delta => update(delta), () => {});
  return {
    island, point, update,
    dispose() { stopLoop(); island.dispose(); point?.dispose(); },
  };
}
