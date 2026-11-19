// Original service and coastal artwork at the existing logical boxes and ground feet.
export const sheets = {
  villageServices: {file: 'village/services-v1.png', width: 1536, height: 1024},
  villageArsenal: {file: 'village/home-fixed-v2.png', width: 1774, height: 887},
  villageHarbor: {file: 'village/home-harbor-v2.png', width: 1254, height: 1254},
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
  'island-harbor': {
    sheet: 'villageHarbor', rect: [43, 55, 563, 494],
    logical: [80, 72, 8], sourceFoot: [281, 478],
  },
  // Both hulls retain a corresponding visible width while the repaired mast uses its taller box.
  'island-wreck': {
    sheet: 'villageHarbor', rect: [670, 150, 509, 380],
    logical: [96, 56, 6], sourceFoot: [254, 364], fitBounds: [353, 364, 353, 16],
  },
  'island-wreck-mended': {
    sheet: 'villageHarbor', rect: [40, 659, 554, 530],
    logical: [96, 80, 6], sourceFoot: [277, 514], fitBounds: [385, 514, 385, 16],
  },
};
