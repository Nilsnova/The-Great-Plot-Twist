// Composes the illustrated map. Gameplay data stays in logical X/Z coordinates.
import { createTerrain } from './terrain.js';
import { createPaths } from './paths.js';
import { createBuildings } from './buildings.js';
import { createLighthouse } from './lighthouse.js';
import { createScenery } from './scenery.js';
import { createDecorations } from './decorations.js';

export function createIsland(scene, art) {
  const buildings = createBuildings(art), scenery = createScenery(art);
  const decorations = createDecorations(art);
  const tower = createLighthouse(scene, art);
  scene.add(createTerrain(), createPaths(), buildings.group, scenery.group, decorations.group);
  return { colliders: [...buildings.colliders, tower.collider, ...scenery.colliders, ...decorations.colliders],
    update(player, time, night, weather) {
      buildings.update(player, night); tower.update(time, night); scenery.update(time, weather.wind, player);
      decorations.update(time, weather);
    },
  };
}
