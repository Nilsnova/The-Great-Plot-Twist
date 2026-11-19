// Fit the painted rooflines at the original cottage scale, with the same ground foot at every level.
export const sheets = {
  villageHouses: {file: 'village/houses-v2.png', width: 1261, height: 1247},
};

const house = (rect, sourceFoot, {role = false, fitHeight = 416} = {}) => ({
  sheet: 'villageHouses', rect, sourceFoot,
  logical: role ? [96, 88, 8] : [80, 80, 8], fitBounds: [209, fitHeight, 209, 14],
});

export const frames = {
  'island-house': house([23, 106, 351, 303], [175, 289], {fitHeight: 413}),
  'island-house-l2': house([418, 23, 418, 389], [209, 375], {fitHeight: 460}),
  'island-house-l3': house([872, 2, 360, 405], [180, 391], {fitHeight: 401}),
  'island-house-barracks': house([10, 452, 397, 334], [198, 320], {role: true}),
  'island-house-tavern': house([413, 445, 408, 340], [204, 326], {role: true}),
  'island-house-workshop': house([840, 433, 418, 360], [209, 346], {role: true, fitHeight: 435}),
  'island-house-barracks-l3': house([23, 843, 374, 388], [187, 374], {role: true}),
  'island-house-tavern-l3': house([415, 819, 392, 416], [196, 402], {role: true}),
  'island-house-workshop-l3': house([828, 810, 418, 430], [209, 416], {role: true}),
};
