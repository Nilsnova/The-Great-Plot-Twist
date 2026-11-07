// The unchanged G1 island is the first owned place, including its pier and boat.
import * as THREE from 'three';
import { createFrameState } from './frame-state.js';
import { pixelArtIds } from '../../pixel/catalog.js';
import { loadArt } from '../art.js';
import { createIsland } from '../island.js';
import { createBoat } from '../boat.js';
import { groundHeight } from '../../player/collision.js';
import { places } from './registry.js';
import { createLifetime, loadBackdrop } from './resources.js';
export async function createLighthousePlace(ctx = {}) {
  const art = await (ctx.loadArt ?? loadArt)(pixelArtIds.filter(id => !id.startsWith('explorer')));
  const group = new THREE.Group(); group.name = 'place:lighthouse_isle';
  const dispose = createLifetime(group, art), frameState = createFrameState(ctx, places.lighthouse_isle.spawn);
  try {
    const readBackdrop=ctx.loadBackdrop??loadBackdrop;
    const texture = await readBackdrop('pixel/hd/ground.png').catch(()=>readBackdrop('pixel/ground.png'));
    const island = createIsland(group, art, texture), boat = createBoat(group, art);
    return { ...places.lighthouse_isle, id: 'lighthouse_isle', group, groundHeight, colliders: island.colliders,
      update(dt, state) { state = frameState(dt, state); island.update(state.player, state.time, state.relit?Math.max(.65,state.night):state.night, state.weather); boat.update(state.time, state.weather); }, dispose };
  } catch (error) { dispose(); throw error; }
}
