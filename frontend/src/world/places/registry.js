// Stable team-facing ids. Positions are logical X/Z; beam origins are drawn X/Y/Z.
import { anchors, cameraAnchors } from '../lighthouse.js';
const zone = (id, name, x, z, radius = 1.6) => ({ id, name, x, z, y: 1.03, radius });
export const places = {
  lighthouse_isle: { name: 'Lighthouse Isle', chart: [91, 175], spawn: [-1, 10], anchors, zones: [],
    lights: [{ id: 'keepers_lamp', beamOrigin: { ...cameraAnchors.lamp_room, z: 0 } }] },
  saltreach_harbor: { name: 'Saltreach Harbor', chart: [217, 156], spawn: [0, 19], zones: [
    zone('market_hall', 'Market stall', -9, -2),
    zone('prediction_kiosk', 'Fortune teller', 1, -2), zone('sports_pavilion', 'Match board', 12, -2) ],
    lights: [{ id: 'harbor_light', beamOrigin: { x: 9, y: -1.6675, z: 0 } }] },
  home_islet: { name: 'Your island', chart: [302, 201], spawn: [0, 12], zones: [
    zone('plot_1', 'Cabin plot', -8, 7.5), zone('plot_2', 'Workshop plot', 7, 7.5),
    zone('plot_3', 'Windmill plot', -8, -5.5), zone('plot_4', 'Greenhouse plot', 7, -5.5),
    zone('islet_signal_station', 'Islet signal station', 0, -12) ],
    lights: [{ id: 'islet_signal_station', beamOrigin: { x: 0, y: 16.2675, z: 0 } }] },
  smugglers_cove: { name: 'Smugglers’ Cove', chart: [112, 76], spawn: [0, 12], zones: [] },
  wreck_point: { name: 'Wreck Point', chart: [288, 92], spawn: [0, 12], zones: [] },
  the_teeth: { name: 'The Teeth', chart: [365, 65], spawn: [0, 12], zones: [
    zone('raid_arch', 'Raid arch', 8, 1) ],
    lights: [{ id: 'ruin_light', beamOrigin: { x: -5, y: 8.5, z: 0 } }] },
};
for (const place of Object.values(places)) { place.anchors ??= {}; place.lights ??= []; }
export const placeIds = Object.keys(places);
export const hotspotIds = Object.values(places).flatMap(p => p.zones.map(z => z.id));
export const lightIds = Object.values(places).flatMap(p => p.lights.map(light => light.id));
export const routes = [['lighthouse_isle', 'saltreach_harbor'], ['saltreach_harbor', 'home_islet'],
  ['lighthouse_isle', 'smugglers_cove'], ['saltreach_harbor', 'wreck_point'],
  ['wreck_point', 'the_teeth']];
export function canTravel(id) { return Object.hasOwn(places, id); }
// A passage may follow several marked legs; intermediate places need not be loaded.
export function routeTo(from, to) {
  if (!canTravel(to) || (from && !Object.hasOwn(places, from))) return null;
  if (!from) return [to];
  const queue = [[from]], visited = new Set([from]);
  while (queue.length) {
    const path = queue.shift(), last = path.at(-1); if (last === to) return path;
    for (const edge of routes) {
      const next = edge[0] === last ? edge[1] : edge[1] === last ? edge[0] : null;
      if (next && !visited.has(next) && canTravel(next)) { visited.add(next); queue.push([...path, next]); }
    }
  }
  return null;
}
