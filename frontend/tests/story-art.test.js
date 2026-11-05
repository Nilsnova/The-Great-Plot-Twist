// The existing actor renderer can reuse each selected NPC's complete original pose set.
import { expect, it } from 'vitest';
import { characterIds, characterArtIds, characterArt, storyDimensions } from '../src/pixel/story-catalog.js';
import { pixelArtIds } from '../src/pixel/catalog.js';
it('registers nine poses and a portrait for every cast/crew title without preloading them', () => {
  for (const id of characterIds) {
    const ids = characterArtIds(id); expect(ids).toHaveLength(9);
    expect(ids.every(name=>Object.hasOwn(storyDimensions,name)&&!pixelArtIds.includes(name))).toBe(true);
    expect(storyDimensions[id+'-portrait']).toEqual([64,80,0]);
    const art = Object.fromEntries(ids.map(name=>[name,{name}]));
    expect(Object.keys(characterArt(art,id)).sort()).toEqual(['explorer','explorer-back','explorer-side','explorer-walk-1','explorer-walk-2','explorer-back-walk-1','explorer-back-walk-2','explorer-side-walk-1','explorer-side-walk-2'].sort());
  }
});
it('refuses missing or unknown character poses', () => {
  expect(()=>characterArtIds('unknown')).toThrow('Unknown character');
  expect(()=>characterArt({},characterIds[0])).toThrow('Load character pose');
});
