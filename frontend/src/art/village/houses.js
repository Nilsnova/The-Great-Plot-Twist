// Original house/role sheet. Native source feet normalize to the existing logical geometry.
export const sheets = {
  villageHouses: {file: 'village/houses-v1.png', width: 1254, height: 1254},
};

const house = (column, row, foot, role = false) => ({
  sheet: 'villageHouses',
  rect: [column * 418, row * 418, 418, 418],
  logical: role ? [80, 72, 8] : [64, 64, 8],
  sourceFoot: [209, foot],
});

export const frames = {
  'island-house': house(0, 0, 373),
  'island-house-l2': house(1, 0, 376),
  'island-house-l3': house(2, 0, 387),
  'island-house-barracks': house(0, 1, 366, true),
  'island-house-tavern': house(1, 1, 366, true),
  'island-house-workshop': house(2, 1, 366, true),
  'island-house-barracks-l3': house(0, 2, 387, true),
  'island-house-tavern-l3': house(1, 2, 387, true),
  'island-house-workshop-l3': house(2, 2, 389, true),
};
