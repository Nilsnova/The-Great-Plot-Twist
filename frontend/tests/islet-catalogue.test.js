// The fake keeps its own copy of buildings.json, because the Vercel build of the frontend cannot read backend/.
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {fakeCatalogue} from '../src/screens/islet/fake-catalogue.js';
import {places} from '../src/world/places/registry.js';

const homeZones = places.home_islet.zones;
const DRIFTLINE = 'home_driftline';

describe('the fake catalogue', () => {
  it('is the same data as backend/content/buildings.json', () => {
    const file = new URL('../../backend/content/buildings.json', import.meta.url);
    expect(fakeCatalogue).toEqual(JSON.parse(readFileSync(file, 'utf8')));
  });

  it('has a spot for every hotspot of the home islet except the driftline, in registry order', () => {
    const expected = homeZones.filter(zone => zone.id !== DRIFTLINE).map(zone => zone.id);
    expect(fakeCatalogue.spots.map(spot => spot.plot)).toEqual(expected);
  });

  it('uses the name of the hotspot as the name of the plot', () => {
    const names = Object.fromEntries(homeZones.map(zone => [zone.id, zone.name]));
    for (const spot of fakeCatalogue.spots) expect(spot.plotName, spot.plot).toBe(names[spot.plot]);
  });

  it('has the level 1 price and the starter pack of the open-world design', () => {
    expect(fakeCatalogue.starterTimber).toBe(20);
    expect(fakeCatalogue.priceList).toEqual([{level: 1, coins: 300, timber: 10}]);
  });

  it('opens only the workshop and the signal station for building', () => {
    const buildable = fakeCatalogue.spots.filter(spot => spot.buildable).map(spot => spot.type);
    expect(buildable).toEqual(['workshop', 'signal_station']);
  });

  it('has exactly one signal station, on the islet_signal_station hotspot', () => {
    const stations = fakeCatalogue.spots.filter(spot => spot.type === 'signal_station');
    expect(stations.map(spot => spot.plot)).toEqual(['islet_signal_station']);
  });
});
