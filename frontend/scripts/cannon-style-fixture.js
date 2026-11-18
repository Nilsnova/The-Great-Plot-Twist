// Browser-only verification helper, imported by the coordinated actual-game capture lane.
// It paints supplementary family sheets; these are not screenshots of playable integration.
import {drawTower} from '../src/art/island.js';
import {islandFrame, framesFor} from '../src/art/registry.js';
import {cartoonAtlas, frameCanvas} from '../src/art/textures.js';
import {paint} from '../src/art/paint.js';
import {loadArt} from '../src/world/art.js';

const names = Array.from({length: 5}, (_, i) => {
  const tier = i ? `-l${i + 1}` : '';
  return [`island-cannon${tier}`, `island-cannon-fire${tier}`, `island-cannon${tier}-damaged`, `island-cannon${tier}-broken`];
}).flat();
function check(ok, message) { if (!ok) throw new Error(message); }
function digest(data) {
  let hash = 2166136261;
  for (const value of data) hash = Math.imul(hash ^ value, 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Exercise the real registered world material and combat-atlas routes at both quality densities. */
export async function verifyCannonStyle() {
  const frames = await framesFor(names), results = [], sheets = [];
  for (const density of [1.5, 2]) {
    const world = await loadArt(names, {density});
    try {
      const atlas = await cartoonAtlas(names, {density, quality: density === 1.5 ? 'low' : 'high'});
      check(atlas.missing.length === 0 && atlas.density === density, 'cannon atlas is complete at the requested density');
      const sheet = document.createElement('canvas'); sheet.width = 4 * 240; sheet.height = 5 * 180;
      const preview = sheet.getContext('2d'); preview.fillStyle = '#17424a'; preview.fillRect(0, 0, sheet.width, sheet.height);
      for (const [i, name] of names.entries()) {
        check(frames[name] === islandFrame(name), `${name}: shared frame object`);
        check(JSON.stringify(frames[name].slice(0, 3)) === '[48,32,5]', `${name}: frame and anchor`);
        const image = world[name].map.image, r = atlas.rects[name];
        const direct = image.getContext('2d').getImageData(0, 0, image.width, image.height).data;
        const packed = atlas.image.getContext('2d').getImageData(Math.round(r.x * density), Math.round(r.y * density), image.width, image.height).data;
        check(direct.some((value, at) => at % 4 === 3 && value > 128), `${name}: visible raster`);
        let maxDelta = 0;
        for (let p = 0; p < direct.length; p++) {
          // Fully transparent RGB is not meaningful; compare all visible channels and every alpha.
          if (p % 4 !== 3 && direct[p - p % 4 + 3] === 0 && packed[p - p % 4 + 3] === 0) continue;
          maxDelta = Math.max(maxDelta, Math.abs(direct[p] - packed[p]));
        }
        check(maxDelta <= 2, `${name}: world/atlas raster delta ${maxDelta}`);
        results.push({name, density, width: image.width, height: image.height, anchor: r.anchor, worldAtlasMaxDelta: maxDelta, digest: digest(direct)});
        preview.drawImage(image, (i % 4) * 240 + 24, Math.floor(i / 4) * 180 + 16, 192, 128);
        preview.fillStyle = '#fff0cf'; preview.font = '14px sans-serif';
        preview.fillText(name.replace('island-cannon', `Level ${Math.floor(i / 4) + 1}`), (i % 4) * 240 + 12, Math.floor(i / 4) * 180 + 165);
      }
      const rows = results.filter(item => item.density === density);
      for (let level = 1; level <= 5; level++) {
        const row = rows.slice((level - 1) * 4, level * 4);
        check(new Set(row.map(item => item.digest)).size === 4, `level ${level}: idle/fire/damaged/broken remain distinct`);
        const before = paint(drawTower('cannon', level, 'broken', false), [48, 32], density);
        const after = paint(drawTower('cannon', level, 'broken', true), [48, 32], density);
        check(before.toDataURL() === after.toDataURL(), `level ${level}: broken tower cannot fire`);
      }
      check(new Set(rows.filter((_, i) => i % 4 === 0).map(item => item.digest)).size === 5, 'all five intact level identities remain distinct');
      sheets.push({density, dataUrl: sheet.toDataURL('image/png')});
    } finally {
      for (const material of Object.values(world)) { material.map?.dispose(); material.dispose(); }
    }
  }
  return {scope: 'supplementary real Canvas2D family and shared world/combat route proof; actual-game captures remain separate', results, sheets};
}
