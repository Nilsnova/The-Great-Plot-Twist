// Original bell/lookout sources. Bell's larger presentation box is the explicit VIS-04 decision.
export const sheets = {
  villageLandmarks: {file: 'village/landmarks-v1.png', width: 1254, height: 1254},
};

export const frames = {
  'island-bell': {
    sheet: 'villageLandmarks', rect: [112, 69, 459, 497],
    logical: [56, 72, 8], sourceFoot: [225, 483],
  },
  'island-watchtower': {
    sheet: 'villageLandmarks', rect: [760, 8, 325, 558],
    logical: [64, 128, 8], sourceFoot: [161, 543],
  },
  'island-watchtower-l4': {
    sheet: 'villageLandmarks', rect: [168, 582, 332, 611],
    logical: [64, 128, 8], sourceFoot: [164, 596],
  },
  'island-watchtower-l5': {
    sheet: 'villageLandmarks', rect: [742, 575, 357, 624],
    logical: [64, 128, 8], sourceFoot: [174, 609],
  },
};
