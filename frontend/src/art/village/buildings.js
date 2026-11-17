// Original shaded cabin source. The world-only VIS-32 provider normalizes it to the existing foot.
export const sheets = {
  buildingsHero: {file: 'village/buildings-hero-v1.png', width: 1254, height: 1254},
};

export const frames = {
  cabin: {
    sheet: 'buildingsHero',
    rect: [0, 0, 1254, 1254],
    logical: [96, 96, 12],
    sourceFoot: [627, 1124],
  },
};
