// Tight authored rectangles and common level-group fit preserve relative growth at approved presentation sizes.
export const sheets = {
  villageHouses: {file: 'village/houses-v2.png', width: 1261, height: 1247},
};

const PLAIN_FIT = [209, 391, 209, 14], ROLE_FIT = [209, 416, 209, 14];
const house = (rect, sourceFoot, role = false) => ({
  sheet: 'villageHouses', rect, sourceFoot,
  logical: role ? [96, 88, 8] : [80, 80, 8], fitBounds: role ? ROLE_FIT : PLAIN_FIT,
});

export const frames = {
  'island-house': house([23, 106, 351, 303], [175, 289]),
  'island-house-l2': house([418, 23, 418, 389], [209, 375]),
  'island-house-l3': house([872, 2, 360, 405], [180, 391]),
  'island-house-barracks': house([10, 452, 397, 334], [198, 320], true),
  'island-house-tavern': house([413, 445, 408, 340], [204, 326], true),
  'island-house-workshop': house([840, 433, 418, 360], [209, 346], true),
  'island-house-barracks-l3': house([23, 843, 374, 388], [187, 374], true),
  'island-house-tavern-l3': house([415, 819, 392, 416], [196, 402], true),
  'island-house-workshop-l3': house([828, 810, 418, 430], [209, 416], true),
};
