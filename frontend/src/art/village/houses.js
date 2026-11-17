// Tight authored rectangles and common level-group fit preserve relative growth at approved presentation sizes.
export const sheets = {
  villageHouses: {file: 'village/houses-v1.png', width: 1254, height: 1254},
};

const PLAIN_FIT = [207, 365, 186, 16], ROLE_FIT = [206, 387, 207, 16];
const house = (rect, sourceFoot, role = false) => ({
  sheet: 'villageHouses', rect, sourceFoot,
  logical: role ? [96, 88, 8] : [80, 80, 8], fitBounds: role ? ROLE_FIT : PLAIN_FIT,
});

export const frames = {
  'island-house': house([46, 85, 322, 304], [163, 288]),
  'island-house-l2': house([420, 79, 389, 313], [207, 297]),
  'island-house-l3': house([847, 22, 384, 380], [198, 365]),
  'island-house-barracks': house([24, 474, 391, 324], [185, 310], true),
  'island-house-tavern': house([435, 474, 381, 325], [192, 310], true),
  'island-house-workshop': house([840, 474, 394, 326], [205, 310], true),
  'island-house-barracks-l3': house([23, 839, 393, 399], [186, 384], true),
  'island-house-tavern-l3': house([428, 838, 393, 401], [199, 385], true),
  'island-house-workshop-l3': house([839, 838, 400, 402], [206, 387], true),
};
