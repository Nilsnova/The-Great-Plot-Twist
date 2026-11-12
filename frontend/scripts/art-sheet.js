// The cartoon art at a glance: every drawing of src/art/ on one sheet (a dev aid for the art lane).
//   node scripts/art-sheet.js <out.png> [density] [filter-regex]
import {openWorldBrowser} from './world-browser-tools.js';
const out = process.argv[2] ?? 'captures/art-sheet.png', density = Number(process.argv[3] ?? 3), filter = process.argv[4] ?? '';
const env = await openWorldBrowser(), {page} = env;
try {
  await page.goto(`${env.url}/privacy.html`);
  const size = await page.evaluate(async ([density, filter]) => {
    const registry = await import('/src/art/registry.js'), {paint} = await import('/src/art/paint.js');
    const fleet = (await import('/src/art/fleet.js')).fleetFrames(), people = (await import('/src/art/people.js')).peopleFrames(), island = (await import('/src/art/island.js')).islandFrames();
    const all = {...people, ...island, ...fleet}, names = Object.keys(all).filter(name => !filter || new RegExp(filter).test(name)).filter(name => !/^crew-(deckhand|navigator|cook|salvager)|^explorer/.test(name) || filter);
    document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:#7cc7a8;font:11px sans-serif';
    const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:8px;width:2400px;align-items:flex-end'; document.body.append(wrap);
    for (const name of names) {
      const [w, h, anchor, draw, options] = all[name], cell = document.createElement('figure');
      cell.style.cssText = 'margin:0;display:grid;justify-items:center;background:#5fae8f;padding:4px;border-radius:6px';
      const art = paint(draw, [w, h], density, {outline: options?.outline ?? .9});
      art.style.width = `${w * density / 1}px`; art.style.height = `${h * density}px`; art.style.background = 'repeating-conic-gradient(#6fbd9e 0 25%,#62b392 0 50%) 0 0/16px 16px';
      const line = document.createElement('div'); line.style.cssText = `position:relative;height:0;width:${w * density}px;top:-${anchor * density}px;border-top:1px dashed #c33`;
      const label = document.createElement('figcaption'); label.textContent = name;
      cell.append(art, line, label); wrap.append(cell);
    }
    return {width: 2400, height: wrap.scrollHeight + 20};
  }, [density, filter]);
  await page.setViewportSize({width: size.width, height: Math.min(size.height, 16000)});
  await page.screenshot({path: out, fullPage: true});
  console.log(out, env.errors);
} finally { await env.close(); }
