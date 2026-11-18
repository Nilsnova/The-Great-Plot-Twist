// Original research/armory artwork, aligned to the existing service frames and ground feet.
export const sheets = {
  villageServices: {file: 'village/services-v1.png', width: 1536, height: 1024},
};

export const frames = {
  'island-techhub': {
    sheet: 'villageServices', rect: [20, 125, 698, 776],
    logical: [80, 88, 8], sourceFoot: [345, 761],
  },
  'island-arsenal': {
    sheet: 'villageServices', rect: [771, 225, 747, 680],
    logical: [80, 80, 8], sourceFoot: [365, 665],
  },
};
