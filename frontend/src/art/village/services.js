// Original research/armory artwork, aligned to the existing service frames and ground feet.
export const sheets = {
  villageServices: {file: 'village/services-v1.png', width: 1536, height: 1024},
  villageArsenal: {file: 'village/home-fixed-v2.png', width: 1774, height: 887},
};

export const frames = {
  'island-techhub': {
    sheet: 'villageServices', rect: [20, 125, 698, 776],
    logical: [80, 88, 8], sourceFoot: [345, 761],
  },
  'island-arsenal': {
    sheet: 'villageArsenal', rect: [928, 191, 808, 640],
    logical: [80, 80, 8], sourceFoot: [404, 624],
  },
};
