// The late game (docs/GAME-V3.md §4.1): with the tower tiers (levels 4 and 5), research and a crew of captains
// who fight (crewWave in balance-fixture.js), headless at the sim's fixed tick, 4 seeds each. A strong, full
// crew wins the boss waves 30, 50 and 70 and the final battle at 100, which stays hard; a weak setup (level-3
// towers, 4 captains) and the towers alone lose from wave 50 on; six captains are not enough for wave 100.
import { describe, expect, it } from 'vitest';
import { ISLANDS, crewMeasure, islandAt, measure, researched } from './balance-fixture.js';

const STRONG = researched(islandAt(5)); // every tower and wall at level 5, research done, a skill on each
const WEAK = researched(islandAt(3));   // the same at level 3

describe('the late game with the tower tiers', () => {
  it('a strong, full crew (level 5, research, ten captains) wins waves 30, 50, 70 and the final battle', () => {
    for (const wave of [30, 50, 70]) expect(crewMeasure(STRONG, wave, 10), `wave ${wave}`).toMatchObject({ won: 4 });
    const final = crewMeasure(STRONG, 100, 10);
    expect(final.won).toBe(4);
    expect(final.hp).toBeLessThan(70); // hard: the heart takes a beating
  }, 120000);
  it('a weak setup (level 3, four captains) and the towers alone lose from wave 50 on', () => {
    for (const wave of [50, 70, 100]) expect(crewMeasure(WEAK, wave, 4).won, `weak, wave ${wave}`).toBe(0);
    for (const wave of [50, 70]) expect(crewMeasure(STRONG, wave, 0).won, `towers alone, wave ${wave}`).toBe(0);
  }, 120000);
  it('needs the whole crew and the tiers at the end: six captains, or level-3 towers, lose wave 100', () => {
    expect(crewMeasure(STRONG, 100, 6).won).toBe(0);
    expect(crewMeasure(WEAK, 100, 10).won).toBe(0);
    expect(crewMeasure(STRONG, 70, 4).won).toBe(0);
  }, 120000);
  it('keeps waves 1 to 29 as they were: the full level-3 island alone still holds wave 20', () => {
    expect(measure(ISLANDS.full, 20, { seeds: 4 }).won).toBe(4);
  }, 60000);
});
