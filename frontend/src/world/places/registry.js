// Stable team-facing ids. Positions are logical X/Z; beam origins are drawn X/Y/Z.
import { zones } from '../zones.js';
import { anchors, cameraAnchors } from '../lighthouse.js';
const zone = (id, name, x, z, radius = 1.6) => ({ id, name, x, z, y: 1.03, radius });
export const places = {
  lighthouse_isle: { name: 'Lighthouse Isle', chart: [91, 175], spawn: [-1, 10], anchors,
    zones: [...zones.map(z => ({ ...z, name: ({ cottage: "Keeper’s cottage", desk: "Elena’s writing desk", shore: 'The old jetty', tower_door: 'Lighthouse door' })[z.id] })),{...zones.find(z=>z.id==='tower_door'),id:'keepers_lamp',name:'Keeper’s lamp',x:12,z:-5.8,radius:1}],
    lights: [{ id: 'keepers_lamp', beamOrigin: { ...cameraAnchors.lamp_room, z: 0 } }] },
  saltreach_harbor: { name: 'Saltreach Harbor', chart: [217, 156], spawn: [0, 19], zones: [
    zone('harbor_office', 'Harbor Office', -8, 10.3), zone('harbor_office_window', 'Office window', -5, 10.2, 1),
    zone('harbor_light', 'Harbor Light', 9, 10.6), zone('ferry_pier', 'Ferry pier', 0, 21),
    zone('jail', 'Jail', -19, 0), zone('market_hall', 'Island Exchange', -9, -2),
    zone('prediction_kiosk', 'Prediction kiosk', 1, -2), zone('sports_pavilion', 'Sports pavilion', 12, -2),
    zone('signal_station', 'Signal station', 21, -3), zone('notice_board', 'Reward notice', 3, 8.5),
    zone('captains_table', 'Captain’s Table', -1, 3.5),zone('keepers_post_room','Keepers’ post room',-4.1,7.8,.85),zone('wall_of_lights','Wall of Lights',12,6.7) ],
    lights: [{ id: 'harbor_light', beamOrigin: { x: 9, y: -1.6675, z: 0 } }] },
  home_islet: { name: 'Home islet', chart: [302, 201], spawn: [0, 12], zones: [
    zone('plot_1', 'Cabin plot', -8, 7.5), zone('plot_2', 'Workshop plot', 7, 7.5),
    zone('plot_3', 'Windmill plot', -8, -5.5), zone('plot_4', 'Greenhouse plot', 7, -5.5),
    zone('islet_signal_station', 'Islet signal station', 0, -12),zone('home_driftline','Your driftline beach',0,18) ],
    lights: [{ id: 'islet_signal_station', beamOrigin: { x: 0, y: 15.6425, z: 0 } }] },
  smugglers_cove: { name: 'Smugglers’ Cove', chart: [112, 76], spawn: [0, 12], zones: [
    zone('back_room', 'Back room', -8, 1), zone('low_tide_cave', 'Low-tide cave', 9, 5),
    zone('arena_gate', 'Arena gate', 0, -8) ] },
  wreck_point: { name: 'Wreck Point', chart: [288, 92], spawn: [0, 12], zones: [
    zone('salvage_yard', 'Salvage yard', -7, 0),zone('yard_gate','Salvage-yard gate',-7,1.4,.85), zone('beach', 'Wreck beach', 8, 9) ] },
  the_teeth: { name: 'The Teeth', chart: [365, 65], spawn: [0, 12], zones: [
    zone('reef', 'Reef', -8, 9), zone('watchtower_ruin', 'Watchtower ruin', -5, -3),
    zone('raid_arch', 'Raid arch', 8, 1), zone('fog_bank', 'Fog bank', 9, -9) ],
    lights: [{ id: 'ruin_light', beamOrigin: { x: -5, y: 8.5, z: 0 } }] },
  gulls_rest: { name: 'Gull’s Rest', chart: [407, 34], spawn: [0, 10], locked: true, zones: [] },
};
for (const place of Object.values(places)) { place.anchors ??= {}; place.lights ??= []; }
export const placeIds = Object.keys(places);
export const hotspotIds = Object.values(places).flatMap(p => p.zones.map(z => z.id));
export const lightIds = Object.values(places).flatMap(p => p.lights.map(light => light.id));
export const routes = [['lighthouse_isle', 'saltreach_harbor'], ['saltreach_harbor', 'home_islet'],
  ['lighthouse_isle', 'smugglers_cove'], ['saltreach_harbor', 'wreck_point'],
  ['wreck_point', 'the_teeth'], ['the_teeth', 'gulls_rest']];
export function canTravel(id, relit = false) { return Object.hasOwn(places, id) && (!places[id].locked || relit); }
// A passage may follow several marked legs; intermediate places need not be loaded.
export function routeTo(from, to, relit = false) {
  if (!canTravel(to, relit) || (from && !Object.hasOwn(places, from))) return null;
  if (!from) return [to];
  const queue = [[from]], visited = new Set([from]);
  while (queue.length) {
    const path = queue.shift(), last = path.at(-1); if (last === to) return path;
    for (const edge of routes) {
      const next = edge[0] === last ? edge[1] : edge[1] === last ? edge[0] : null;
      if (next && !visited.has(next) && canTravel(next, relit)) { visited.add(next); queue.push([...path, next]); }
    }
  }
  return null;
}
