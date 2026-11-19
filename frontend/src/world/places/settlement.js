// Composes one native-pixel place. Every allocation belongs to its returned root.
import * as THREE from 'three';
import { createFrameState } from './frame-state.js';
import {createHarborLife} from '../ambient/harbor-life.js';
import { loadArt, placeArt } from '../art.js';
import { paintedBlob } from '../primitives.js';
import { swayMaterial, updateSway } from '../wind.js';
import { createBeam } from '../beam.js';
import {createGroundShadows} from '../ground-shadow.js';
import { places } from './registry.js';
import { layouts, edgeTrees, homeMooring } from './layouts.js';
import { placeGround } from './surfaces.js';
import { backdrop, createLifetime, loadBackdrop } from './resources.js';
import { makeSelectedCanopy } from './selected-canopy.js';
import { makeMooring } from './mooring.js';
import {projectGround} from '../projection.js';
import {createHomeRelief} from './home-relief.js';

// Compose all art, colliders and cleanup under one place root for predictable travel disposal.
export async function createSettlement(ctx) {
  const { id } = ctx;
  const data = places[id];
  const placements = [...(layouts[id] ?? []), ...(ctx.placements ?? [])];
  const home = id === 'home_islet';
  const mooring = home ? homeMooring : [];
  const trees = edgeTrees[id] ?? [];
  const extraArtIds = [
    ...(id === 'saltreach_harbor' ? ['harbour-office-glow'] : []),
    ...(id === 'home_islet'
      ? ['build-plot', 'islet-empty-plot', 'islet-locked-sign', 'islet-signal-station', 'islet-signal-station-lit', 'cabin', 'workshop', 'windmill', 'greenhouse']
      : []),
  ];
  const artIds = [...new Set([
    ...placements.map(placement => placement.asset),
    ...mooring.map(placement => placement.asset),
    'oak', 'pine', 'birch', 'rock', 'flowers', 'grass-tuft',
    ...extraArtIds,
  ])];
  const art = await (ctx.loadArt ?? loadArt)(artIds);
  const group = new THREE.Group();
  group.name = `place:${id}`;
  const frameState = createFrameState(ctx, data.spawn);
  const cleanups = [], dispose = createLifetime(group, art, cleanups);
  try {
    const ground = backdrop(group, await (ctx.loadBackdrop ?? loadBackdrop)(`places/${id}.png`));
    if (id === 'home_islet') {
      createHomeRelief(group, ground.material.map);
      createGroundShadows(group, trees.map(([x, z]) => ({
        x: x + .52, z: z + .68, width: 1.52, depth: 1.32, opacity: .34, innerOpacity: .21,
      })));
    }
    placements.forEach(item => {
      const mesh = placeArt(group, art, item.asset, item.x, item.z);
      if (item.asset === 'ferry-pier') mesh.renderOrder = 6;
      if (item.asset === 'fog-bank') mesh.renderOrder = 920;
    });
    const [bollard, skiff] = mooring.map(({asset, x, z}) => {
      const mesh = placeArt(group, art, asset, x, z);
      mesh.name = asset;
      mesh.renderOrder = 16;
      mesh.raycast = () => {};
      return mesh;
    });
    const shoreBoat = skiff ? makeMooring(group, bollard, skiff) : null;
    const foliage = trees.map(([x, z], i) => {
      const mesh = placeArt(group, art, ['oak', 'pine', 'birch'][i % 3], x, z);
      // Smaller home canopies reveal walls; house growth multiplies this visual baseline.
      // The ground foot, radius-.48 blocker and painter order remain unchanged.
      if (home) mesh.scale.setScalar(.7);
      const crown = home ? {bendFrom: .48, phase: i * 2.399} : undefined;
      mesh.material = swayMaterial(mesh.material.clone(), mesh.userData.asset, crown);
      return mesh;
    });
    const selectedCanopy = home ? makeSelectedCanopy(foliage) : null;
    let player = {x: data.spawn[0], z: data.spawn[1]}, shoreTime = 0;
    function updateCanopyOpacity(mesh) {
      const p = mesh.userData.ground;
      const playerBehind = player.z < p.z && Math.abs(player.x - p.x) < 2.2 && p.z - player.z < 6;
      // Each tree already owns its wind material. Selection and captain occlusion share one opacity writer.
      mesh.material.opacity = selectedCanopy?.has(mesh) ? .24 : playerBehind ? .3 : 1;
    }
    const undergrowth = [];
    function plant(asset, x, z, phase) {
      const mesh = placeArt(group, art, asset, x, z);
      if (home) {
        mesh.material = swayMaterial(mesh.material.clone(), asset, {bendFrom: .22, phase});
        undergrowth.push(mesh);
      }
    }
    trees.forEach(([x, z], i) => {
      plant('grass-tuft', x + 2, z + 1, 1.3 + i * 2.399);
      if (i % 2 === 0) plant('flowers', x - 1.6, z + 1, 2.1 + i * 2.399);
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
    let windowGlow, stormFlag;
    if (id === 'saltreach_harbor') {
      windowGlow = placeArt(group, art, 'harbour-office-glow', -8, 8.5);
      windowGlow.material = windowGlow.material.clone(); windowGlow.renderOrder = 922;
      stormFlag = createStormFlag(group);
    }
    const place = {
      ...data,
      zones: data.zones,
      id,
      group,
      groundHeight: placeGround(id),
      colliders: [
        ...placements.filter(placement => placement.collider).map(placement => placement.collider),
        ...trees.map(([x, z]) => ({ x, z, radius: .48 })),
      ],
      setSelectedCanopy(building) {
        if (selectedCanopy?.show(building)) foliage.forEach(updateCanopyOpacity);
      },
      update(dt, state) {
        state = frameState(dt, state);
        player = state.player;
        const still = home && (typeof ctx.reducedMotion === 'function' ? ctx.reducedMotion() : !!ctx.reducedMotion);
        const wind = state.weather?.wind ?? 0, breeze = Math.max(.14, wind);
        foliage.forEach(updateCanopyOpacity);
        if (!home || !state.paused || still) {
          if (home && !still && Number.isFinite(dt)) shoreTime += Math.min(.1, Math.max(0, dt));
          const time = home ? shoreTime : state.time;
          foliage.forEach(mesh => updateSway(mesh.material, time, home ? breeze : wind, still ? 0 : home ? 1.36 : 1));
          undergrowth.forEach(mesh => updateSway(mesh.material, time * 1.21, breeze, still ? 0 : .84));
          shoreBoat?.update(time, wind, still);
        }
        if (windowGlow) windowGlow.material.opacity = state.night * .95;
        const brightness = state.night;
        lights.forEach(light => {
          const builtPlots = ctx.isletState?.getBuilt?.() ?? [];
          const enabled = light.id !== 'islet_signal_station' || builtPlots.includes('islet_signal_station');
          light.glow.material.opacity = enabled ? brightness * .8 : 0;
          light.beam.update(state.time, enabled ? brightness : 0);
        });
        if (stormFlag) stormFlag.visible = stormFlagShouldShow(state);
      }, dispose,
    };
    // The southwest wave approach crosses the skiff; the beach post stays on the sand.
    if (shoreBoat) place.setMooringBattle = shoreBoat.setBattle;
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

// The storm flag follows the live weather answer only (the bulletin left with the mystery, 10 Nov).
export function stormFlagShouldShow(state={}){
  return state.weatherAnswer?.state==='storm';
}
function createStormFlag(group){
  const flag=new THREE.Group(),foot=projectGround(17,13);flag.name='storm-warning-flag';
  const pole=new THREE.Mesh(new THREE.PlaneGeometry(.125,3),new THREE.MeshBasicMaterial({color:'#514637',depthTest:false,depthWrite:false,toneMapped:false}));pole.position.set(foot.x,foot.y+1.5,0);pole.renderOrder=930;
  const cloth=new THREE.Mesh(new THREE.PlaneGeometry(1,.5),new THREE.MeshBasicMaterial({color:'#a94c3d',depthTest:false,depthWrite:false,toneMapped:false}));cloth.position.set(foot.x+.5625,foot.y+2.625,0);cloth.renderOrder=931;
  flag.add(pole,cloth);flag.visible=false;flag.renderOrder=930;group.add(flag);return flag;
}
