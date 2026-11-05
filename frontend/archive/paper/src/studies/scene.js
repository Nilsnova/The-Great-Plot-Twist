// Assemble only the art a selected study needs, plus restrained ambient motion.
import * as THREE from 'three';
import { loadArt, placeArt } from '../world/art.js';
import { createWater } from '../world/water.js';
import { createWeather } from '../world/weather.js';
import { createSky } from '../world/sky.js';
import { createCharacter } from '../player/character.js';
import { createLandscape } from './landscape.js';

const explorerIds = ['explorer', 'explorer-back', 'explorer-walk-1', 'explorer-walk-2', 'explorer-back-walk-1', 'explorer-back-walk-2', 'explorer-side', 'explorer-side-walk-1', 'explorer-side-walk-2'];
export const studyArtIds = study => [...new Set([...study.placements.map(item => item[0]), ...explorerIds])];
export async function createStudy(study, reducedMotion) {
  const art = await loadArt(studyArtIds(study)), scene = new THREE.Scene(), sprites = [];
  scene.add(createLandscape(study));
  const water = createWater(scene), sky = createSky(scene), weather = createWeather(scene);
  for (const [id, x, z, scale] of study.placements) {
    const sprite = placeArt(scene, art, id, x, z, scale);
    sprites.push({ id, sprite, x: sprite.position.x, y: sprite.position.y, scale });
  }
  const character = createCharacter(art, { reducedMotion }); scene.add(character.sprite);
  character.group.position.set(study.route[0][0], 0, study.route[0][1]);
  let target = 1, elapsed = 0;
  return { scene, art, character,
    update(delta, hour, quality, moving) {
      const dt = moving ? delta : 0; elapsed += dt;
      const state = weather.update(dt, { x: 0, z: 0 }, quality), night = sky.update(hour, state);
      water.setQuality(quality); water.update(elapsed, state);
      sprites.forEach(({ id, sprite, y, scale }, i) => {
        if (['ferry', 'sailboat', 'cargo-boat', 'buoy'].includes(id)) {
          sprite.position.y = y + Math.sin(elapsed * 1.2 + i) * (.045 + state.wind * .05);
          sprite.rotation.z = Math.sin(elapsed * .8 + i) * .012;
        } else if (['willow', 'cypress', 'pine', 'birch', 'reed-bed', 'fern'].includes(id)) {
          sprite.rotation.z = Math.sin(elapsed * .7 + i) * state.wind * .012;
        } else if (['harbour-keeper', 'trader', 'rival', 'companion-gull', 'companion-wisp'].includes(id)) {
          sprite.scale.y = scale * (1 + Math.sin(elapsed * 1.6 + i) * .003);
        }
      });
      const position = character.group.position, [x, z] = study.route[target];
      const dx = x - position.x, dz = z - position.z, distance = Math.hypot(dx, dz), step = Math.min(distance, dt * 2);
      if (distance > .001 && step) { position.x += dx / distance * step; position.z += dz / distance * step; character.face(dx, dz); }
      if (distance < .08) target = (target + 1) % study.route.length;
      character.animate(dt, dt && step ? step / dt : 0);
      return night;
    },
    dispose() {
      const materials = new Set(Object.values(art)), textures = new Set();
      scene.traverse(object => { object.geometry?.dispose(); if (object.material) materials.add(object.material); });
      materials.forEach(material => { if (material.map) textures.add(material.map); material.dispose(); });
      textures.forEach(texture => texture.dispose());
    },
  };
}
