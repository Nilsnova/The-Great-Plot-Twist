// Lightweight labels remain identical to the team registry's existing place names.
import {describe,it,expect} from 'vitest';
import {places} from '../src/world/places/registry.js';
import {placeLabels,placeLabel} from '../src/world/places/labels.js';

describe('public place labels',()=>{
  it('matches every registry name without creating or renaming a place',()=>{
    expect(Object.keys(placeLabels)).toEqual(Object.keys(places));
    for(const [id,place] of Object.entries(places))expect(placeLabel(id)).toBe(place.name);
  });
  it('does not expose prototype properties as place names',()=>{
    for(const id of ['unknown','constructor','__proto__',null])expect(placeLabel(id)).toBeNull();
  });
});
