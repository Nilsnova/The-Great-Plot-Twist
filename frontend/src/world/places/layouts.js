// Plain scene data. Building footprints are separate from safe interaction stand points.
const building = (asset, x, z, width = 5, depth = 3) => ({ asset, x, z, collider: { x, z: z - depth / 2, width, depth } });
export const layouts = {
  saltreach_harbor: [
    building('harbour-office', -8, 8.5, 5.7), building('harbour-beacon', 9, 9, 2.5),
    { asset: 'ferry-pier', x: 0, z: 26 }, building('jail', -19, -2, 4.8),
    building('market-hall', -9, -4, 6.7), building('prediction-kiosk', 1, -4, 3),
    building('sports-pavilion', 12, -4, 6.7), building('signal-station', 21, -5, 5),
    building('notice-board', 3, 7, 2, .7), building('captains-table', -1, 2, 2.8, 1.2),
    { asset: 'crate', x: -3, z: 15 }, { asset: 'barrel', x: -4, z: 14.5 },
    { asset: 'rope-coil', x: 2.8, z: 17 }, { asset: 'bench', x: -13, z: 10 },
    { asset: 'boat', x: 4, z: 22 }, { asset: 'gull', x: -3, z: 21 },
    { asset: 'lantern', x: -1.2, z: 19 },
  ],
};
const homeBuildings = [
  { plot: 'plot_1', asset: 'cabin', x: -8, z: 6 },
  { plot: 'plot_2', asset: 'workshop', x: 7, z: 6 },
  { plot: 'plot_3', asset: 'windmill', x: -8, z: -7 },
  { plot: 'plot_4', asset: 'greenhouse', x: 7, z: -7 },
];
export { homeBuildings };
layouts.home_islet = [...homeBuildings.map(item => building(item.asset, item.x, item.z)),
  building('signal-station', 0, -14), { asset: 'bench', x: 4, z: 13 },
  { asset: 'barrel', x: -12, z: 7 }, { asset: 'lantern', x: -3, z: 12 }];
layouts.smugglers_cove = [building('back-room', -8, -1, 4), building('low-tide-cave', 9, 3, 5),
  building('arena-gate', 0, -10, 5), { asset: 'barrel', x: -11, z: 1 }, { asset: 'rope-coil', x: 5, z: 9 }];
layouts.wreck_point = [building('salvage-yard', -7, -2, 6.7), { asset: 'dark-schooner', x: 13, z: 15 },
  { asset: 'driftwood', x: 8, z: 7 }, { asset: 'crate', x: -11, z: 2 }, { asset: 'barrel', x: -12.5, z: 1 },
  { asset: 'rope-coil', x: -3, z: 2 }, { asset: 'rock', x: 13, z: 7 }];
layouts.the_teeth = [building('watchtower-ruin', -5, -5, 3), building('raid-arch', 8, -1, 5),
  { asset: 'reef', x: -8, z: 7 }, { asset: 'reef', x: -12, z: 11 }, { asset: 'reef', x: 9, z: -11 },
  { asset: 'rock', x: 5, z: 8 }, { asset: 'rock', x: -9, z: -1 }];
layouts.gulls_rest = [{ asset: 'bench', x: 0, z: 0 }, { asset: 'flowers', x: -3, z: 2 },
  { asset: 'gull', x: 5, z: 8 }, { asset: 'rock', x: 9, z: 5 }];
export const edgeTrees = {
  saltreach_harbor: [[-24,-10],[-21,-14],[-15,-16],[-8,-16],[0,-17],[8,-17],[17,-14],[24,-11],[-24,8],[23,7]],
  home_islet: [[-15,6],[-16,0],[-13,-12],[-9,-17],[9,-17],[15,-8],[16,2],[14,11],[-12,13]],
  smugglers_cove: [[-17,8],[-17,-3],[-13,-12],[-6,-15],[6,-15],[16,-7],[17,0]],
  wreck_point: [[-17,5],[-16,-7],[-8,-14],[0,-16],[9,-13],[16,-5],[18,3]],
  the_teeth: [[-15,-6],[-11,-14],[1,-17],[13,-13],[16,6]],
  gulls_rest: [[-13,5],[-13,-5],[-8,-12],[0,-15],[10,-10],[13,2],[10,10]],
};
