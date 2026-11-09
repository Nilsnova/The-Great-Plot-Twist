// Composes one native-pixel place. Every allocation belongs to its returned root.
import * as THREE from 'three';
import { createFrameState } from './frame-state.js';
import {createHarborLife} from '../ambient/harbor-life.js';
import { loadArt, placeArt } from '../art.js';
import { paintedBlob } from '../primitives.js';
import { swayMaterial, updateSway } from '../wind.js';
import { createBeam } from '../beam.js';
import { places } from './registry.js';
import { layouts, edgeTrees } from './layouts.js';
import { placeGround } from './surfaces.js';
import { backdrop, createLifetime, loadBackdrop } from './resources.js';

// Compose all art, colliders and cleanup under one place root for predictable travel disposal.
export async function createSettlement(ctx) {
  const { id } = ctx;
  const data = places[id];
  const harborNotice = id === 'saltreach_harbor'
    ? [{ asset: 'notice-board', x: 6, z: 7, bulletinBoard: true }]
    : [];
  const placements = [...(layouts[id] ?? []), ...(ctx.placements ?? []), ...harborNotice];
  const trees = edgeTrees[id] ?? [];
  const extraArtIds = [
    ...(id === 'saltreach_harbor' ? ['harbour-office-glow', 'wall-of-lights-open', 'festival-lantern-string'] : []),
    ...(id === 'the_teeth' ? ['false-light'] : []),
    ...(id === 'home_islet'
      ? ['build-plot', 'islet-empty-plot', 'islet-locked-sign', 'islet-signal-station', 'islet-signal-station-lit', 'cabin', 'workshop', 'windmill', 'greenhouse']
      : []),
  ];
  const artIds = [...new Set([
    ...placements.map(placement => placement.asset),
    'oak', 'pine', 'birch', 'rock', 'flowers', 'grass-tuft',
    ...extraArtIds,
  ])];
  const art = await (ctx.loadArt ?? loadArt)(artIds);
  const group = new THREE.Group();
  group.name = `place:${id}`;
  const frameState = createFrameState(ctx, data.spawn);
  const cleanups = [], dispose = createLifetime(group, art, cleanups);
  try {
    backdrop(group, await (ctx.loadBackdrop ?? loadBackdrop)(`places/${id}.png`));
    const fogMeshes = [];
    let bulletinBoard = null;
    placements.forEach(item => {
      const mesh = placeArt(group, art, item.asset, item.x, item.z);
      if (item.bulletinBoard) { bulletinBoard = mesh; mesh.visible = false; }
      if (item.asset === 'ferry-pier') mesh.renderOrder = 6;
      if (item.asset === 'fog-bank') { mesh.renderOrder = 920; fogMeshes.push(mesh); }
    });
    const foliage = trees.map(([x, z], i) => {
      const mesh = placeArt(group, art, ['oak', 'pine', 'birch'][i % 3], x, z);
      mesh.material = swayMaterial(mesh.material.clone(), mesh.userData.asset); return mesh;
    });
    trees.forEach(([x, z], i) => {
      placeArt(group, art, 'grass-tuft', x + 2, z + 1);
      if (i % 2 === 0) placeArt(group, art, 'flowers', x - 1.6, z + 1);
    });
    const lights = data.lights.map(light => {
      const { x, y } = light.beamOrigin;
      const isSignalStation = light.id === 'islet_signal_station';
      return {
        id: light.id,
        glow: paintedBlob(group, x, y, isSignalStation ? .24 : .6, isSignalStation ? .16 : .38, '#f3d58c', 925, 0),
        beam: createBeam(group, x, y),
      };
    });
    let windowGlow, wall, festive, teaser, stormFlag;
    let bulletinEnabled = false;
    if (id === 'the_teeth') {
      teaser = placeArt(group, art, 'false-light', 10, -10);
      teaser.visible = false;
      teaser.renderOrder = 921;
    }
    if (id === 'saltreach_harbor') {
      wall = placeArt(group, art, 'wall-of-lights-open', 12, 5.3);
      wall.visible = false;
      festive = placeArt(group, art, 'festival-lantern-string', -1, 7);
      festive.visible = false;
      windowGlow = placeArt(group, art, 'harbour-office-glow', -8, 8.5);
      windowGlow.material = windowGlow.material.clone(); windowGlow.renderOrder = 922;
      stormFlag = createStormFlag(group);
    }
    const place = {
      ...data,
      zones: id === 'saltreach_harbor' ? data.zones.filter(zone => zone.id !== 'bulletin_board') : data.zones,
      id,
      group,
      groundHeight: placeGround(id),
      colliders: [
        ...placements.filter(placement => placement.collider).map(placement => placement.collider),
        ...trees.map(([x, z]) => ({ x, z, radius: .48 })),
      ],
      update(dt, state) {
        state = frameState(dt, state);
        if (id === 'saltreach_harbor') {
          const enabled = !!state.bulletin?.status && state.bulletin.status !== 'off';
          if (enabled !== bulletinEnabled) {
            bulletinEnabled = enabled;
            place.zones = enabled ? data.zones : data.zones.filter(zone => zone.id !== 'bulletin_board');
          }
          if (bulletinBoard) bulletinBoard.visible = enabled;
        }
        foliage.forEach(mesh => {
          const p = mesh.userData.ground;
          mesh.material.opacity = state.player.z < p.z && Math.abs(state.player.x - p.x) < 2.2 && p.z - state.player.z < 6 ? .3 : 1;
          updateSway(mesh.material, state.time, state.weather?.wind ?? 0);
        });
        if (windowGlow) windowGlow.material.opacity = state.night * .95;
        const brightness = state.relit ? Math.max(.65, state.night) : state.night;
        lights.forEach(light => {
          const builtPlots = ctx.isletState?.getBuilt?.() ?? [];
          const enabled = light.id !== 'islet_signal_station' || builtPlots.includes('islet_signal_station');
          light.glow.material.opacity = enabled ? brightness * .8 : 0;
          light.beam.update(state.time, enabled ? brightness : 0);
        });
        fogMeshes.forEach(mesh => { mesh.visible = !state.relit; });
        if (wall) wall.visible = !!state.relit;
        if (festive) festive.visible = !!state.festival;
        if (teaser) teaser.visible = teaserShouldShow(state);
        if (stormFlag) stormFlag.visible = stormFlagShouldShow(state);
      }, dispose,
    };
    ctx.decorate?.(place, art, cleanups);
    if (id === 'home_islet' || id === 'saltreach_harbor') {
      const life = createHarborLife({ place, art, ctx });
      const updatePlace = place.update;
      place.update = (dt, state) => {
        updatePlace(dt, state);
        life.update(dt, state);
      };
      cleanups.push(() => life.dispose());
    }
    return place;
  } catch (error) { dispose(); throw error; }
}

export function teaserShouldShow(state={}){
  if(state.relit||!(state.night>.6))return false;
  const bulletin=state.bulletin??{},hasStream=!!bulletin.status&&bulletin.status!=='off';
  const tonight=hasStream?(bulletin.weather?.tonight??state.weatherAnswer?.tonight??null):null;
  return tonight?!!tonight.isFogNight:(state.weather?.fog??0)>.65;
}
export function stormFlagShouldShow(state={}){
  const bulletin=state.bulletin??{};if(!bulletin.status||bulletin.status==='off')return false;
  if(typeof state.weatherAnswer?.state==='string')return state.weatherAnswer.state==='storm';
  const tonight=bulletin.weather?.tonight;return tonight?.isNow===true&&tonight.state==='storm';
}
function createStormFlag(group){
  const flag=new THREE.Group();flag.name='storm-warning-flag';
  const pole=new THREE.Mesh(new THREE.PlaneGeometry(.125,3),new THREE.MeshBasicMaterial({color:'#514637',depthTest:false,depthWrite:false,toneMapped:false}));pole.position.set(17,-13*.72+1.5,0);pole.renderOrder=930;
  const cloth=new THREE.Mesh(new THREE.PlaneGeometry(1,.5),new THREE.MeshBasicMaterial({color:'#a94c3d',depthTest:false,depthWrite:false,toneMapped:false}));cloth.position.set(17.5625,-13*.72+2.625,0);cloth.renderOrder=931;
  flag.add(pole,cloth);flag.visible=false;flag.renderOrder=930;group.add(flag);return flag;
}
