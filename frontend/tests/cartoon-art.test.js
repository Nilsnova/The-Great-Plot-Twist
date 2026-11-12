// The clean cartoon art (GAME-V3.md §7): the same frame names and boxes the renderers use, ten
// captain colours, boarders that drop into the wave atlas, and a density that fits its budget.
import { describe, expect, it } from 'vitest';
import { pirateDimensions } from '../src/pixel/pirate-catalog.js';
import { pixelSizes } from '../src/pixel/catalog.js';
import { ATLAS_IDS, CARTOON_EXTRA_IDS, PIXEL_ONLY_IDS } from '../src/pirates/render.js';
import { LEVEL_ART, PIP_ART } from '../src/island/world.js';
import { framesFor, hasCartoon, islandFrame } from '../src/art/registry.js';
import { CAPTAIN_PALETTES } from '../src/art/people.js';
import { ATLAS_BUDGET, artDensity, fitDensity } from '../src/art/textures.js';
import { captainVariant, resolveActorAsset } from '../src/world/others/logic.js';
import { hasGround } from '../src/art/ground.js';

describe('clean cartoon art', () => {
  it('draws every wave atlas sprite with the old box and anchor, plus the boarders', async () => {
    const cartoon = ATLAS_IDS.filter(id => !PIXEL_ONLY_IDS.includes(id)), ids = [...cartoon, ...CARTOON_EXTRA_IDS], frames = await framesFor(ids);
    expect(ids.filter(id => !frames[id])).toEqual([]);
    for (const id of cartoon) expect(frames[id].slice(0, 3)).toEqual(pirateDimensions[id]);
    // The pixel boarders (16 px wide) are replaced by the cartoon ones (24 px, the cutlass needs the room).
    expect(PIXEL_ONLY_IDS).toEqual(['pirate-boarder-1', 'pirate-boarder-2', 'pirate-boarder-3']);
    expect(frames['captain-cutlass'].slice(0, 3)).toEqual(pirateDimensions['captain-musket-1']);
    // The boarders keep the captain's box; a fallen captain (captain health, GAME-V3.md §3) lies in a 40 x 24 one.
    for (const id of CARTOON_EXTRA_IDS) expect(frames[id].slice(0, 3)).toEqual(id.startsWith('captain-down-') ? [40, 24, 3] : [24, 32, 3]);
  });
  it('draws the island: level art, pips, the explorer frames and the scenery of the home island', () => {
    const names = [...Object.values(LEVEL_ART).flat(), PIP_ART, 'cabin', 'oak', 'pine', 'birch', 'rock', 'flowers', 'grass-tuft', 'bench', 'barrel', 'lantern',
      ...['', '-back', '-side'].flatMap(view => [`explorer${view}`, `explorer${view}-walk-1`, `explorer${view}-walk-2`])];
    for (const name of names) {
      expect(islandFrame(name), name).not.toBeNull();
      const [w, h, anchor] = islandFrame(name);
      expect([w / 16, h / 16, anchor / h]).toEqual(pixelSizes[name]);
    }
    expect(hasGround('home_islet')).toBe(true);
    expect(hasCartoon('pirate-warship-2') && hasCartoon('fx-smoke-1') && !hasCartoon('market-hall')).toBe(true);
  });
  it('offers ten clearly different captains and gives every peer a stable one', () => {
    expect(new Set(CAPTAIN_PALETTES.map(item => item.coat)).size).toBe(10);
    expect(new Set(CAPTAIN_PALETTES.map(item => `${item.coat}/${item.hat}`)).size).toBe(10);
    for (let n = 1; n <= 10; n++) for (const view of ['', '-back', '-side']) for (const step of ['', '-walk-1', '-walk-2'])
      expect(islandFrame(`captain-${n}${view}${step}`)).not.toBeNull();
    expect(captainVariant({id: 'p-abc'})).toBe(captainVariant({id: 'p-abc'}));
    expect(captainVariant({id: 'x', colour: 7})).toBe(7);
    expect(new Set(Array.from({length: 40}, (_, i) => captainVariant({id: `peer-${i}`}))).size).toBeGreaterThan(6);
    const all = () => true;
    expect(resolveActorAsset({id: 'x', colour: 4}, {facing: 'left', moving: true, frame: 2, hasAsset: all})).toBe('captain-4-side-walk-2');
  });
  it('rasterises at the screen density, capped by quality and fitted to the atlas budget', () => {
    expect(artDensity({width: 1280, height: 800, pixelRatio: 2})).toBe(4);
    expect(artDensity({width: 1280, height: 800, pixelRatio: 2, quality: 'low'})).toBe(2);
    expect(artDensity({width: 1280, height: 800, pixelRatio: 1})).toBeGreaterThanOrEqual(2.5);
    expect(artDensity({width: 390, height: 844, pixelRatio: 3})).toBe(4);
    const area = 640 * 900, density = fitDensity(area, 4, ATLAS_BUDGET.low);
    expect(area * density * density * 4 * 4 / 3).toBeLessThanOrEqual(ATLAS_BUDGET.low);
    expect(fitDensity(area, 2, ATLAS_BUDGET.high)).toBe(2);
  });
});
