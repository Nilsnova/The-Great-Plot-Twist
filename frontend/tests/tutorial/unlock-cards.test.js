// T52: one unlock card for every campaign item, from the table next to the campaign table.
import {describe, expect, it} from 'vitest';
import table from '../../src/campaign/tutorials.json';
import {STEPS} from '../../src/campaign/index.js';
import {ALL_SPOTS, BELL, CABIN, ARSENAL, CAMPAIGN_BUILDINGS} from '../../src/island/spots.js';
import {CARDS, cardById, cardOfItem, cardsBetween, cardsOpenAt, cardText, coverage, flagAllows} from '../../src/tutorial/unlock-cards.js';

const ZONES = new Set([...ALL_SPOTS.map(spot => spot.id), BELL.id, CABIN.id, ARSENAL.id, ...CAMPAIGN_BUILDINGS.map(item => item.id), 'hud:menu']);

describe('the card table', () => {
  it('gives every id of the campaign table exactly one card, and names no id the table lacks', () => {
    expect(coverage()).toEqual({missing: [], twice: [], unknown: []});
    for (const step of STEPS) for (const id of step.opens) expect(cardOfItem(id)?.wave, id).toBe(step.wave);
  });
  it('fails for a campaign item without a card, or with two, or for a row naming an unknown id', () => {
    const steps = [...STEPS, {wave: 200, opens: ['new_thing']}];
    expect(coverage(CARDS, steps).missing).toEqual(['new_thing']);
    const twice = [...CARDS, {id: 'again', covers: ['harbor']}];
    expect(coverage(twice).twice).toEqual(['harbor']);
    expect(coverage([...CARDS, {id: 'odd', covers: ['nothing']}]).unknown).toEqual(['nothing']);
    expect(coverage(table.cards.filter(card => card.id !== 'harbor')).missing).toEqual(['harbor', 'market_calls']);
  });
  it('has unique ids, short words, a wave and a known place for every card', () => {
    expect(new Set(CARDS.map(card => card.id)).size).toBe(CARDS.length);
    for (const card of CARDS) {
      expect(card.id).toMatch(/^[a-z0-9_]{1,40}$/);
      expect(Number.isSafeInteger(card.wave), card.id).toBe(true);
      for (const key of ['title', 'what', 'how']) {
        expect(typeof card[key], `${card.id}.${key}`).toBe('string');
        expect(card[key].length, `${card.id}.${key}`).toBeLessThanOrEqual(150);
      }
      if (card.where !== null) expect(ZONES.has(card.where), `${card.id} where ${card.where}`).toBe(true);
      if (card.flag) expect(card.flag).toMatch(/^!?[a-z0-9_]+$/);
    }
  });
  it('has a card for everything the brief names', () => {
    for (const id of ['mortar', 'watchtower', 'gunner', 'carpenter', 'guards', 'lookout', 'houses', 'house_roles', 'harbor', 'wreck', 'football_board',
      'tech_hub', 'research_2', 'research_3', 'level_4', 'level_5', 'harpoon', 'culverin', 'arsenal', 'gunboats', 'finishers', 'tear_down', 'swivel'])
      expect(cardById(id), id).not.toBeNull();
    expect(cardById('finishers').practice).toBe(true);
    expect(cardText(cardById('finishers')).practice).toMatch(/Practice/);
    expect(cardById('harbor').where).toBe('island_harbor');
    expect(cardById('tech_hub').where).toBe('island_techhub');
    expect(cardById('harpoon').where).toBe('cannon_5');
  });
});

describe('which cards a win brings', () => {
  it('lists the cards of the waves between, in wave order, with the flags', () => {
    expect(cardsBetween(3, 4).map(card => card.id)).toEqual(['harbor', 'finishers']);
    expect(cardsBetween(1, 2).map(card => card.id)).toEqual(['level_2', 'mortar', 'house_roles', 'arsenal']);
    expect(cardsBetween(14, 15).map(card => card.id)).toEqual(['level_4_more', 'tougher_bosses', 'research_2', 'gunboats']);
    expect(cardsBetween(14, 15, {defenses_v2: true}).map(card => card.id)).toContain('culverin');
    expect(cardsBetween(4, 4)).toEqual([]);
    expect(cardsBetween(0, 1).map(card => card.id)).toEqual(['captain_upgrades', 'houses', 'tear_down']);
  });
  it('lists every card open at a wave', () => {
    expect(cardsOpenAt(0).map(card => card.id)).toEqual(['defenses']);
    expect(cardsOpenAt(8).length).toBeGreaterThan(15);
    expect(cardsOpenAt(-1)).toEqual([]);
  });
  it('reads a flag as a value or a function, and a ! flag only while off', () => {
    expect(flagAllows({flag: 'arsenal'}, {})).toBe(false);
    expect(flagAllows({flag: 'arsenal'}, {arsenal: () => true})).toBe(true);
    expect(flagAllows({flag: '!arsenal'}, {arsenal: () => true})).toBe(false);
    expect(flagAllows({flag: 'arsenal'}, {arsenal: () => { throw new Error('x'); }})).toBe(false);
    expect(flagAllows({}, {})).toBe(true);
  });
});
