// Displayed island/controller snapshots only: captain level and next-wave guesses are unrelated.
const best = value => Number.isSafeInteger(value) && value >= 0;
const current = value => Number.isSafeInteger(value) && value > 0;

export function readHudWaveStatus({place, ownBest, visiting = null, wave = null} = {}) {
  const running = wave && !wave.done && !wave.finished && current(wave.info?.wave) ? wave.info.wave : null;
  if (place === 'home_islet') return {
    bestWave: best(visiting ? visiting.waveBest : ownBest) ? (visiting ? visiting.waveBest : ownBest) : null,
    currentWave: running,
  };
  return place === 'lighthouse_isle' && running !== null ? {bestWave: null, currentWave: running} : null;
}

export function hudWaveView(status) {
  if (!status || typeof status !== 'object') return null;
  if (current(status.currentWave)) return {text: `Wave ${status.currentWave}`, label: `Current wave ${status.currentWave}`};
  if (best(status.bestWave)) return {text: `Best wave ${status.bestWave}`, label: `Best won wave ${status.bestWave}`};
  return {text: 'Best wave …', label: 'Best wave not loaded yet'};
}
