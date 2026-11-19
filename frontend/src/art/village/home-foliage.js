// Home garden accent, packed separately to preserve the existing village atlas.
export const sheets = {
  homeBroadleaf: {file: 'village/source/home-broadleaf-v1.png', width: 1536, height: 1024},
};

export const frames = {
  'home-broadleaf': {
    sheet: 'homeBroadleaf', rect: [64, 145, 1410, 774], logical: [40, 28, 4], sourceFoot: [682, 710],
  },
};

export const compiledHomeFoliage = {
  sheets: {
    homeBroadleaf: {file: 'village/accents/home-foliage-4x-1-e34e46ee6a8a.webp', width: 168, height: 120},
  },
  frames: {
    'home-broadleaf': {...frames['home-broadleaf'], rect: [4, 4, 160, 112], sourceFoot: [80, 96]},
  },
};
