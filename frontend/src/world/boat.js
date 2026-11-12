// Illustrated jetty and rowing boat, animated with a small painted-water bob.
import { layout } from '../config.js';
import { placeArt, projectPoint } from './art.js';

export function createBoat(scene, art) {
  placeArt(scene, art, 'jetty', -2, 25.5).renderOrder = 6;
  const boat = placeArt(scene, art, 'boat', layout.boat.x, layout.boat.z);
  const resting = projectPoint(layout.boat.x, layout.boat.z);
  return { update(time, weather) {
    boat.position.y = (resting.y + Math.sin(time * 1.2) * (0.035 + weather.wind * 0.1));
    boat.rotation.z = 0;
  } };
}
