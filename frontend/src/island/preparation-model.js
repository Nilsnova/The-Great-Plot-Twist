// Read-only bell preview from existing island/campaign/wall answers. It never declares an island safe.
import {STEPS, campaignOf} from '../campaign/index.js';

const LAST_WAVE = 100; // The existing campaign limit; only a fallback for older island answers.
const TOWERS = new Set(['cannon', 'mortar', 'harpoon', 'culverin', 'watchtower']);
export function nextWaveNumber(nextWave, waveBest = 0) {
  if (Number.isSafeInteger(nextWave) && nextWave >= 1 && nextWave <= LAST_WAVE) return nextWave;
  const best = Number.isSafeInteger(waveBest) && waveBest >= 0 ? waveBest : 0;
  return Math.min(LAST_WAVE, best + 1);
}

export function preparationModel({island = null, wallState = null, wallRecovery = false} = {}) {
  if (!Array.isArray(island?.spots)) return {lines: ['Island data is still loading.'], unlocks: []};
  const built = island.spots.filter(spot => spot?.built === true);
  const towers = built.filter(spot => TOWERS.has(spot.kind)).length;
  const wallIds = built.filter(spot => spot.kind === 'wall').map(spot => spot.id);
  const lines = [`Built: ${towers} ${towers === 1 ? 'tower' : 'towers'} · ${wallIds.length} ${wallIds.length === 1 ? 'wall' : 'walls'}.`];
  if (wallRecovery && wallIds.length) {
    const rows = wallState?.code === island.code && Array.isArray(wallState?.rows) ? wallState.rows : [];
    const health = wallIds.map(id => rows.find(row => row.spot === id)?.health);
    if (health.some(value => !Number.isInteger(value) || value < 0 || value > 100)) {
      lines.push('Wall health is not available for every built wall.');
    } else {
      const broken = health.filter(value => value === 0).length, damaged = health.filter(value => value > 0 && value < 100).length;
      lines.push(`Last known wall health: ${broken} destroyed · ${damaged} damaged.`);
    }
  }
  const won = campaignOf(island).wave;
  const unlocks = STEPS.filter(step => !step.later && step.wave > won).slice(0, 3)
    .map(step => `Win wave ${step.wave}: ${step.title.replace(/^New: /, '')}`);
  return {lines, unlocks};
}
