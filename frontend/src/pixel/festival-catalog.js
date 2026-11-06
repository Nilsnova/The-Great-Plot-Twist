// Original G13 workshop art. Selective library assets, never a live-world preload.
export const festivalDimensions = {};
for (let number = 1; number <= 12; number++) {
  for (const state of ['unlit', 'lit']) {
    for (const suffix of ['', '-night']) {
      festivalDimensions[`festival-lamp-${String(number).padStart(2, '0')}-${state}${suffix}`] = [48, 80, 6];
    }
  }
}
for (const [name, size] of Object.entries({
  'claim-marker': [32, 40, 4], stall: [112, 96, 10],
  bunting: [160, 40, 4], 'duel-ring': [160, 112, 10],
})) {
  for (const suffix of ['', '-night']) festivalDimensions[`festival-${name}${suffix}`] = size;
}
