// Home Island props compiled separately from the existing village sheets.
export const sheets = {
  homeBench: {file: 'village/source/home-bench-v1.png', width: 1774, height: 887},
};

export const frames = {
  'home-bench': {
    sheet: 'homeBench', rect: [291, 8, 1152, 768], logical: [48, 32, 3], sourceFoot: [576, 696],
  },
};

export const compiledHomeProps = {
  sheets: {
    homeBench: {file: 'village/accents/home-bench-4x-1-625a7ab86721.webp', width: 200, height: 136},
  },
  frames: {
    'home-bench': {...frames['home-bench'], rect: [4, 4, 192, 128], sourceFoot: [96, 116]},
  },
};
