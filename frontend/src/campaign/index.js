// The campaign (docs/GAME-V3.md section 4): what opens on an island after each won wave, as plain rules (no
// DOM). The table is campaign.json, a copy of backend/content/campaign.json (the browser build cannot read
// backend/; tests/campaign/campaign.test.js keeps the two equal). The island's best won wave decides what is
// open there; the server holds every refusal (409 locked "Opens after wave N."), these rules only describe it.
//
//   waveOf(id)                  the won wave after which an id opens ("tech_hub" -> 8), or null
//   campaignOf(answer)          {wave, open: Set, locked: Map id -> wave, later: Set, research, wreck} of an
//                               island answer (its `campaign`, else derived from waveBest)
//   isOpen(campaign, id)        true once open
//   openedBetween(from, to)     the steps a win from `from` to `to` opened: [{wave, ids, title, line}]
//   opensText(wave)             "Opens after wave 4"
//   spotWave(spotId)            the wave a spot needs (the inner wall ring after 5), 0 for most
import table from './campaign.json';

export const CAMPAIGN = table;
export const STEPS = Object.freeze(table.steps.map(step => Object.freeze({...step, opens: Object.freeze([...step.opens]), later: step.later === true})));
const BY_ID = new Map(STEPS.flatMap(step => step.opens.map(id => [id, step])));
export const SPOT_GROUPS = Object.freeze(Object.fromEntries(Object.entries(table.spots).map(([group, spots]) => [group, Object.freeze([...spots])])));

export const waveOf = id => BY_ID.get(id)?.wave ?? null;
export const stepOf = id => BY_ID.get(id) ?? null;
export const isLater = id => BY_ID.get(id)?.later === true;
export const opensText = wave => `Opens after wave ${wave}`;
export function spotWave(spotId) {
  for (const [group, spots] of Object.entries(SPOT_GROUPS)) if (spots.includes(spotId)) return waveOf(group) ?? 0;
  return 0;
}

const isWave = value => Number.isSafeInteger(value) && value >= 0;
// The campaign of an island answer (GET /api/island or a visit): the server's `campaign` when it has one,
// else derived from waveBest with the table above (an older server, the fake while loading).
export function campaignOf(answer) {
  const sent = answer?.campaign && typeof answer.campaign === 'object' ? answer.campaign : null;
  const wave = isWave(sent?.wave) ? sent.wave : isWave(answer?.waveBest) ? answer.waveBest : 0;
  const open = new Set(), locked = new Map(), later = new Set();
  for (const step of STEPS) {
    for (const id of step.opens) {
      if (step.later) later.add(id);
      else if (step.wave <= wave) open.add(id);
      else locked.set(id, step.wave);
    }
  }
  const done = Array.isArray(sent?.research?.done) ? sent.research.done.filter(id => typeof id === 'string') : [];
  const wreck = sent?.wreck && typeof sent.wreck === 'object' ? sent.wreck : null;
  const goal = Number.isSafeInteger(wreck?.goal) && wreck.goal > 0 ? wreck.goal : 500;
  return {wave, open, locked, later,
    research: {done: new Set(done), branches: Array.isArray(sent?.research?.branches) ? sent.research.branches : null},
    wreck: {paid: Math.min(goal, Number.isSafeInteger(wreck?.paid) && wreck.paid > 0 ? wreck.paid : 0), goal,
      gifts: Array.isArray(wreck?.gifts) && wreck.gifts.every(n => Number.isSafeInteger(n) && n > 0) ? wreck.gifts : [25, 100]}};
}
export const isOpen = (campaign, id) => !!campaign?.open?.has(id);
// What a win opened: every step with from < wave <= to that opens something built (never a "later" one).
export function openedBetween(from, to) {
  if (!isWave(from) || !isWave(to) || to <= from) return [];
  return STEPS.filter(step => !step.later && step.wave > from && step.wave <= to)
    .map(step => ({wave: step.wave, ids: [...step.opens], title: step.title, line: step.line}));
}
