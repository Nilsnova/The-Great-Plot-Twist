// Plain scene data. Building footprints are separate from safe interaction stand points.
const building = (asset, x, z, width = 5, depth = 3) => ({ asset, x, z, collider: { x, z: z - depth / 2, width, depth } });
import { isletPlots } from '../islet/state.js';
export const layouts = {
  saltreach_harbor: [
    building('harbour-office', -8, 8.5, 5.7), building('harbour-beacon', 9, 9, 2.5),
    { asset: 'ferry-pier', x: 0, z: 26 }, building('jail', -19, -2, 4.8),
    building('market-hall', -9, -4, 6.7), building('prediction-kiosk', 1, -4, 3),
    building('sports-pavilion', 12, -4, 6.7), building('signal-station', 21, -5, 5),
    
    { asset: 'crate', x: -3, z: 15 }, { asset: 'barrel', x: -4, z: 14.5 },
    { asset: 'rope-coil', x: 2.8, z: 17 }, { asset: 'bench', x: -13, z: 10 },
    { asset: 'boat', x: 4, z: 22 }, { asset: 'gull', x: -3, z: 21 },
    { asset: 'lantern', x: -1.2, z: 19 },
  ],
};
export const homeBuildings = Object.entries(isletPlots).map(([plot, item]) => ({ plot, ...item }));
layouts.home_islet = [{ asset: 'bench', x: 4, z: 13 },
  { asset: 'barrel', x: -12, z: 7 }, { asset: 'lantern', x: -3, z: 12 }];
// Presentation only. The home layout's permanent scenery also reserves wall placement.
export const homeMooring = [
  { asset: 'home-mooring-bollard', x: -9.5, z: 19.5 },
  { asset: 'home-mooring-skiff', x: -8, z: 24.5 },
];
// Low greenery clusters frame the home meadow. They sit under the world sprites and have no footprint.
export const homeUndergrowth = [
  ['grass-tuft', -10.3, -15.9, .62], ['shrub', -8.6, -16.9, .64], ['grass-tuft', -7.1, -18.2, .48],
  ['flowers', 6.3, -18.8, .6], ['shrub', 7.6, -18.2, .62], ['rock', 10.4, -17.5, .47],
  ['shrub', -11.8, 14, .58], ['grass-tuft', -10.6, 14.6, .58],
  ['rock', -11.1, 15.4, .45], ['flowers', -9.4, 15.5, .56],
  ['grass-tuft', 14.6, 11.5, .55], ['shrub', 13.4, 12.6, .65],
  ['rock', 12.2, 14.1, .47], ['grass-tuft', 11.7, 15.2, .55],
];
layouts.smugglers_cove = [building('back-room', -8, -1, 4), building('low-tide-cave', 9, 3, 5),
  building('arena-gate', 0, -10, 5), { asset: 'barrel', x: -11, z: 1 }, { asset: 'rope-coil', x: 5, z: 9 }];
layouts.wreck_point = [building('salvage-yard', -7, -2, 6.7), { asset: 'dark-schooner', x: 13, z: 15 },
  { asset: 'driftwood', x: 8, z: 7 }, { asset: 'crate', x: -11, z: 2 }, { asset: 'barrel', x: -12.5, z: 1 },
  { asset: 'rope-coil', x: -3, z: 2 }, { asset: 'rock', x: 13, z: 7 }];
layouts.the_teeth = [building('watchtower-ruin', -5, -5, 3), building('raid-arch', 8, -1, 5),
  { asset: 'reef', x: -8, z: 7 }, { asset: 'reef', x: -12, z: 11 }, { asset: 'fog-bank', x: 9, z: -11 },
  { asset: 'rock', x: 5, z: 8 }, { asset: 'rock', x: -9, z: -1 }];
export const edgeTrees = {
  saltreach_harbor: [[-24,-10],[-21,-14],[-15,-16],[-8,-16],[0,-17],[8,-17],[17,-14],[24,-11],[-24,8],[23,7]],
  home_islet: [[-15,6],[-16,0],[-13,-12],[-9,-17],[9,-17],[15,-8],[16,2],[14,11],[-12,13]],
  smugglers_cove: [[-17,8],[-17,-3],[-13,-12],[-6,-15],[6,-15],[16,-7],[17,0]],
  wreck_point: [[-17,5],[-16,-7],[-8,-14],[0,-16],[9,-13],[16,-5],[18,3]],
  the_teeth: [[-15,-6],[-11,-14],[1,-17],[13,-13],[16,6]],
};
