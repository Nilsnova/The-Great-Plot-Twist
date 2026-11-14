// The campaign table and the Tech hub (docs/GAME-V3.md sections 4 and 5): one table for the server and the
// browser. The browser build cannot read backend/, so src/campaign/campaign.json is a copy of
// backend/content/campaign.json and src/campaign/tech.js repeats islands.json's research; these tests keep them equal.
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import copy from '../../src/campaign/campaign.json';
import {STEPS, campaignOf, isOpen, openedBetween, opensText, spotWave, tierWave, waveOf} from '../../src/campaign/index.js';
import {BONUSES, BRANCHES, SPECS, isCapstone, readBonus, readSpec, readTier} from '../../src/campaign/tech.js';
import {UNLOCK_STEPS, unlockWave} from '../../src/island/td-rules.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const server = read('../../../backend/content/campaign.json');
const islands = read('../../../backend/content/islands.json');

describe('the campaign table', () => {
  it('is the same data as backend/content/campaign.json', () => {
    expect(copy).toEqual(server);
  });
  it('opens what GAME-V3 section 4 says, wave by wave', () => {
    expect(['house:1', 'captain:2'].map(waveOf)).toEqual([1, 1]);
    expect(['mortar:1', 'wall:2'].map(waveOf)).toEqual([2, 2]);
    expect(['watchtower:1', 'crew:gunner'].map(waveOf)).toEqual([3, 3]);
    expect(['harbor', 'market_calls', 'ring_walls', 'crew:carpenter', 'wreck', 'football_board', 'tech_hub']
      .map(waveOf)).toEqual([4, 4, 5, 5, 6, 7, 8]);
    expect([12, 15, 20, 30, 50].map(wave => waveOf(`tier_${wave}`))).toEqual([12, 15, 20, 30, 50]);
    expect(STEPS.find(step => step.opens.includes('ship')).later).toBe(true);
    expect(spotWave('wall_7')).toBe(5);
    expect(spotWave('wall_1')).toBe(0);
    expect(opensText(4)).toBe('Opens after wave 4');
  });
  it('keeps the tower-defense unlock steps of td-rules.js in step with the table', () => {
    expect(unlockWave({kind: 'mortar'})).toBe(2);
    expect(unlockWave({kind: 'house'})).toBe(1);
    expect(unlockWave({kind: 'wall', level: 3})).toBe(5);
    expect(unlockWave({crew: 'gunner'})).toBe(3);
    expect(unlockWave({captain: 4})).toBe(8);
    expect(UNLOCK_STEPS.map(step => step.wave)).toEqual([0, 1, 2, 3, 5, 8, 12, 15, 20]);
    // The tower tiers (GAME-V3.md §4.1): level 4 after wave 12 (the mortar and the watchtower's 4 after 15), level 5 after 20.
    expect([['cannon', 4], ['wall', 4], ['watchtower', 3], ['mortar', 4], ['watchtower', 4], ['cannon', 5], ['mortar', 5], ['wall', 5], ['watchtower', 5]]
      .map(([kind, level]) => unlockWave({kind, level}))).toEqual([12, 12, 12, 15, 15, 20, 20, 20, 20]);
  });
  it('reads an island answer, or derives the campaign from its best wave', () => {
    const derived = campaignOf({waveBest: 4});
    expect(isOpen(derived, 'harbor')).toBe(true);
    expect(derived.locked.get('tech_hub')).toBe(8);
    expect(derived.later.has('ship')).toBe(true);
    const sent = campaignOf({waveBest: 9, campaign: {wave: 9, research: {done: ['cannon']}, wreck: {paid: 700, goal: 500, gifts: [25]}}});
    expect([...sent.research.done]).toEqual(['cannon']);
    expect(sent.wreck).toEqual({paid: 500, goal: 500, gifts: [25]});
  });
  it('says what a win opened, never a step that comes later', () => {
    expect(openedBetween(3, 4).map(step => [step.wave, step.ids])).toEqual([[4, ['harbor', 'market_calls']]]);
    expect(openedBetween(9, 12).map(step => step.wave)).toEqual([12]);
    expect(openedBetween(5, 5)).toEqual([]);
  });
});

describe('the Tech hub', () => {
  it('has the research of islands.json: branches, prices per tier, skills and the options of tiers 2 and 3 in order', () => {
    const sent = islands.research.branches.map(item => ({branch: item.branch, name: item.name, price: item.coins[0], prices: item.coins,
      specs: item.specs.map(spec => spec.spec), tier2: item.tier2.map(option => option.id), tier3: item.tier3.map(option => option.spec)}));
    expect(BRANCHES.map(item => ({...item, prices: [...item.prices], specs: [...item.specs], tier2: [...item.tier2], tier3: [...item.tier3]}))).toEqual(sent);
    for (const item of islands.research.branches) {
      for (const spec of [...item.specs, ...item.tier3]) expect(SPECS[spec.spec]).toMatchObject({branch: item.branch, name: spec.name});
      for (const option of item.tier2) expect(BONUSES[option.id]).toMatchObject({branch: item.branch, name: option.name});
    }
  });
  it('prices tier 2 at about twice and tier 3 at about 3.5 times tier 1', () => {
    for (const {prices: [one, two, three]} of BRANCHES) {
      expect(two / one).toBeCloseTo(2, 1);
      expect(three / one).toBeCloseTo(3.5, 1);
    }
  });
  it('opens tier 1 after wave 8, tier 2 after 15 and tier 3 after 25, the same waves as the server table', () => {
    expect([1, 2, 3].map(tierWave)).toEqual([8, 15, 25]);
    for (const [id, wave] of [['tech_hub', 8], ['research_2', 15], ['research_3', 25]]) {
      expect(server.steps.find(step => step.opens.includes(id))?.wave).toBe(wave);
    }
  });
  it('lets a building carry only a skill of its own kind, and a tier-2 bonus only of its kind', () => {
    expect(readSpec('cannon', 'rapid')).toBe('rapid');
    expect(readSpec('cannon', 'broadside')).toBe('broadside');
    expect(isCapstone('broadside')).toBe(true);
    expect(isCapstone('rapid')).toBe(false);
    expect(readSpec('wall', 'rapid')).toBe(null);
    expect(readSpec('cannon', 'laser')).toBe(null);
    expect(readBonus('cannon', 'rapid_2')).toBe('rapid_2');
    expect(readBonus('mortar', 'rapid_2')).toBe(null);
  });
  it('reads the tier of a branch and keeps only the choices of its own kind and the tiers reached', () => {
    expect(readTier('cannon', null)).toEqual({tier: 0, tier2: null, tier3: null});
    expect(readTier('cannon', {tier: 3, tier2: 'long_guns', tier3: 'grapeshot'})).toEqual({tier: 3, tier2: 'long_guns', tier3: 'grapeshot'});
    expect(readTier('cannon', {tier: 2, tier2: 'heavy_shells', tier3: 'grapeshot'})).toEqual({tier: 2, tier2: null, tier3: null});
    expect(readTier('wall', {tier: 9})).toMatchObject({tier: 3});
    const sent = campaignOf({waveBest: 30, campaign: {wave: 30, research: {done: ['cannon', 'wall'], tiers: {cannon: {tier: 2, tier2: 'rapid_2', tier3: null}}}}});
    expect(sent.research.tiers.cannon).toEqual({tier: 2, tier2: 'rapid_2', tier3: null});
    expect(sent.research.tiers.wall).toEqual({tier: 1, tier2: null, tier3: null}); // an older server: done is tier 1
    expect(sent.research.tiers.mortar.tier).toBe(0);
  });
  it('names the same skills as the check rules of the migrations, and the options of the research tiers', () => {
    const hub = readFileSync(new URL('../../../supabase/migrations/20261112060000_tech_hub.sql', import.meta.url), 'utf8');
    const tiers = readFileSync(new URL('../../../supabase/migrations/20261112100000_research_tiers.sql', import.meta.url), 'utf8');
    for (const [id, spec] of Object.entries(SPECS)) expect(spec.capstone ? tiers : hub).toContain(`('${spec.branch}', '${id}')`);
    for (const [id, spec] of Object.entries(SPECS)) expect(tiers).toContain(`('${spec.branch}', '${id}')`); // the rule again, in full
    for (const item of BRANCHES) {
      for (const id of item.tier2) expect(tiers).toContain(`('${item.branch}', 2, '${id}')`);
      for (const id of item.tier3) expect(tiers).toContain(`('${item.branch}', 3, '${id}')`);
    }
  });
});
