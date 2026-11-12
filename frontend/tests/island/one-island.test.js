// "One island only" (docs/GAME-V3.md §2): on by default in code, off with flags.one_island = false or
// ?oneisland=0; the sea chart and the Menu's travel entries leave while it is on, only in the island game.
import {afterEach, describe, expect, it} from 'vitest';
import {ONE_ISLAND_DEFAULT, oneIsland, setOneIslandFlags, travelAllowed, visitChip} from '../../src/island/one-island.js';
import {addMenuExtras, menuExtras, setMenuTravel} from '../../src/shell/menu-extras.js';

afterEach(() => { setOneIslandFlags(null); setMenuTravel(null); });

describe('the one_island flag', () => {
  it('is on by default in code, and the config or the address can turn it off', () => {
    expect(ONE_ISLAND_DEFAULT).toBe(true);
    expect(oneIsland({search: ''})).toBe(true);
    expect(oneIsland({search: '', flags: {one_island: false}})).toBe(false);
    expect(oneIsland({search: '?oneisland=0', flags: {one_island: true}})).toBe(false);
    expect(oneIsland({search: '?oneisland=1', flags: {one_island: false}})).toBe(true);
    setOneIslandFlags(() => ({one_island: false}));
    expect(oneIsland({search: ''})).toBe(false);
  });
  it('hides travel only in the island game, and never from a class-code player', () => {
    expect(travelAllowed({islandsMode: 'off', search: ''})).toBe(true);
    expect(travelAllowed({islandsMode: 'fake', search: ''})).toBe(false);
    expect(travelAllowed({islandsMode: 'live', search: ''})).toBe(false);
    expect(travelAllowed({islandsMode: 'live', classHarbor: true, search: ''})).toBe(true);
    expect(travelAllowed({islandsMode: 'live', search: '?oneisland=0'})).toBe(true);
  });
  it('drops the Menu entries marked travel while travel is off', () => {
    const stop = addMenuExtras(() => [{label: 'Harbor', onSelect() {}, travel: true}, {label: 'Crew', onSelect() {}}]);
    try {
      expect(menuExtras().map(entry => entry.label)).toEqual(['Harbor', 'Crew']);
      setMenuTravel(() => false);
      expect(menuExtras().map(entry => entry.label)).toEqual(['Crew']);
    } finally { stop(); }
  });
});

describe("the chip of a friend's game", () => {
  it('shows the game and its lobby with one island, and the old visit only where travel applies', () => {
    expect(visitChip({ownerName: 'Nils', code: 'ISLE-K7Q2M', travel: false}))
      .toEqual({text: "Nils's game · ISLE-K7Q2M", label: 'Players', action: 'lobby'});
    expect(visitChip({ownerName: '', code: 'ISLE-K7Q2M'})).toEqual({text: "A friend's game · ISLE-K7Q2M", label: 'Players', action: 'lobby'});
    expect(visitChip({ownerName: 'Nils', code: 'ISLE-K7Q2M', travel: true}))
      .toEqual({text: "Visiting Nils's island · ISLE-K7Q2M", label: 'Sail home', action: 'home'});
    expect(visitChip({code: 'ISLE-K7Q2M', travel: true}).text).toBe("Visiting a friend's island · ISLE-K7Q2M");
    // Nobody is "visiting" and there is no home to sail to in a shared game.
    expect(visitChip({ownerName: 'Nils', code: 'ISLE-K7Q2M'}).text).not.toMatch(/Visiting|Sail home/);
  });
});
