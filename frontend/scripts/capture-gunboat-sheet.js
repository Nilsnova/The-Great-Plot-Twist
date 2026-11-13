// The gunboat's drawings at 6x on a sea-blue sheet, beside a sloop for scale:
//   node scripts/capture-gunboat-sheet.js <folder>
// The three hull frames, the muzzle flash and the two frames of the "jammed" mark (src/art/fleet.js).
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/gunboat';
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
try {
  await page.setViewportSize({width: 1280, height: 760});
  await page.goto(`${env.url}/?islands=fake`);
  await page.evaluate(async () => {
    const {paint} = await import('/src/art/paint.js'), {fleetFrames} = await import('/src/art/fleet.js');
    const frames = fleetFrames(), ids = ['pirate-sloop-1', 'pirate-gunboat-1', 'pirate-gunboat-2', 'pirate-gunboat-3', 'fx-gunboat-flash', 'fx-jam-1', 'fx-jam-2'];
    document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:#2f9ec9;display:flex;flex-wrap:wrap;gap:24px;padding:24px;align-items:flex-end';
    for (const id of ids) {
      const [w, h, , draw, options] = frames[id], art = paint(draw, [w, h], 6, options ?? {});
      art.style.cssText = `width:${w * 6}px;height:${h * 6}px`; document.body.append(art);
    }
  });
  await page.waitForTimeout(400);
  await page.screenshot({path: `${out}/04-gunboat-art-sheet.png`});
  console.log('04-gunboat-art-sheet');
} finally { await env.close(); }
