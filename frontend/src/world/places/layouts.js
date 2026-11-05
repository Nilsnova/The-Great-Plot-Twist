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
export const homeBuildings = [
  { plot: 'plot_1', asset: 'cabin', x: -8, z: 6 },
  { plot: 'plot_2', asset: 'workshop', x: 7, z: 6 },
  { plot: 'plot_3', asset: 'windmill', x: -8, z: -7 },
  { plot: 'plot_4', asset: 'greenhouse', x: 7, z: -7 },
];
export function buildingPlacement(item) { return building(item.asset, item.x, item.z); }
export const edgeTrees = {
  saltreach_harbor: [[-24,-10],[-21,-14],[-15,-16],[-8,-16],[0,-17],[8,-17],[17,-14],[24,-11],[-24,8],[23,7]],
  home_islet: [[-15,6],[-16,0],[-13,-12],[-9,-17],[9,-17],[15,-8],[16,2],[14,11],[-12,13]],
  smugglers_cove: [[-17,8],[-17,-3],[-13,-12],[-6,-15],[6,-15],[16,-7],[17,0]],
  wreck_point: [[-17,5],[-16,-7],[-8,-14],[0,-16],[9,-13],[16,-5],[18,3]],
  the_teeth: [[-15,-6],[-11,-14],[1,-17],[13,-13],[16,6]],
  gulls_rest: [[-13,5],[-13,-5],[-8,-12],[0,-15],[10,-10],[13,2],[10,10]],
};
