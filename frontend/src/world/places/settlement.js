// Composes one native-pixel place. Every allocation belongs to its returned root.
import * as THREE from 'three';
import { createFrameState } from './frame-state.js';
import { loadArt, placeArt } from '../art.js';
import { paintedBlob } from '../primitives.js';
import { createBeam } from '../beam.js';
import { places } from './registry.js';
import { layouts, edgeTrees } from './layouts.js';
import { placeGround } from './surfaces.js';
import { backdrop, createLifetime, loadBackdrop } from './resources.js';

export async function createSettlement(ctx) {
  const { id } = ctx, data = places[id], placements = [...(layouts[id] ?? []),...(ctx.placements??[])];
  const trees = edgeTrees[id] ?? [];
  const ids = [...new Set([...placements.map(p => p.asset), 'oak', 'pine', 'birch', 'rock', 'flowers', 'grass-tuft',
    ...(id === 'saltreach_harbor' ? ['harbour-office-glow','wall-of-lights-open','festival-lantern-string'] : []),...(id==='the_teeth'?['false-light']:[]), ...(id === 'home_islet' ? ['build-plot'] : [])])];
  const art = await (ctx.loadArt ?? loadArt)(ids), group = new THREE.Group(); group.name = `place:${id}`;
  const frameState = createFrameState(ctx, data.spawn);
  const cleanups = [], dispose = createLifetime(group, art, cleanups);
  try {
    backdrop(group, await (ctx.loadBackdrop ?? loadBackdrop)(`places/${id}.png`));
    const fogMeshes=[];
    placements.forEach(item => {
      const mesh = placeArt(group, art, item.asset, item.x, item.z);
      if (item.asset === 'ferry-pier') mesh.renderOrder = 6;
      if (item.asset === 'fog-bank'){mesh.renderOrder = 920;fogMeshes.push(mesh);}
    });
    const foliage = trees.map(([x, z], i) => {
      const mesh = placeArt(group, art, ['oak', 'pine', 'birch'][i % 3], x, z);
      mesh.material = mesh.material.clone(); return mesh;
    });
    trees.forEach(([x, z], i) => {
      placeArt(group, art, 'grass-tuft', x + 2, z + 1);
      if (i % 2 === 0) placeArt(group, art, 'flowers', x - 1.6, z + 1);
    });
    const lights = data.lights.map(light => {
      const { x, y } = light.beamOrigin;
      return { glow: paintedBlob(group, x, y, .6, .38, '#f3d58c', 925, 0), beam: createBeam(group, x, y) };
    });
    let windowGlow,wall,festive,teaser;
    if(id==='the_teeth'){teaser=placeArt(group,art,'false-light',10,-10);teaser.visible=false;teaser.renderOrder=921;}
    if (id === 'saltreach_harbor') {
      wall=placeArt(group,art,'wall-of-lights-open',12,5.3);wall.visible=false;festive=placeArt(group,art,'festival-lantern-string',-1,7);festive.visible=false;
      windowGlow = placeArt(group, art, 'harbour-office-glow', -8, 8.5);
      windowGlow.material = windowGlow.material.clone(); windowGlow.renderOrder = 922;
    }
    const place = { ...data, id, group, groundHeight: placeGround(id),
      colliders: [...placements.filter(p => p.collider).map(p => p.collider), ...trees.map(([x,z]) => ({ x, z, radius: .48 }))],
      update(dt, state) {
        state = frameState(dt, state);
        foliage.forEach(mesh => {
          const p = mesh.userData.ground;
          mesh.material.opacity = state.player.z < p.z && Math.abs(state.player.x - p.x) < 2.2 && p.z - state.player.z < 6 ? .3 : 1;
        });
        if (windowGlow) windowGlow.material.opacity = state.night * .95;
        const brightness=state.relit?Math.max(.65,state.night):state.night;lights.forEach(light => {light.glow.material.opacity=brightness*.8;light.beam.update(state.time,brightness);});
        fogMeshes.forEach(mesh=>{mesh.visible=!state.relit;});if(wall)wall.visible=!!state.relit;if(festive)festive.visible=!!state.festival;if(teaser)teaser.visible=!state.relit&&state.night>.6&&state.weather.fog>.65;
      }, dispose,
    };
    ctx.decorate?.(place, art, cleanups); return place;
  } catch (error) { dispose(); throw error; }
}
