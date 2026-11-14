// Contact sheet of every tower kind x level x state (T33 art prep). Starts Vite, paints the island frames in a
// real browser with the game's own paint() and saves docs/evidence/T33/tower-states-contact-sheet.png.
// Rows: kind and state; columns: levels 1 to 5. Needs Chrome (CHROME_PATH or /usr/bin/google-chrome).
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';

const url = 'http://127.0.0.1:5177', out = new URL('../../docs/evidence/T33/', import.meta.url).pathname;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5177', '--strictPort'], {stdio: 'pipe'});
let browser;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(url)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 250)); }
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage({viewport: {width: 1000, height: 760}, deviceScaleFactor: 2});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.evaluate(async () => {
    const {islandFrame} = await import('/src/art/registry.js'), {paint} = await import('/src/art/paint.js'), {towerStateFrame, TOWER_KINDS, TOWER_STATES} = await import('/src/art/tower-states.js');
    document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:#8fc7e6;color:#1d2b3a;font:12px sans-serif';
    const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:110px repeat(5,160px);gap:6px;padding:10px;align-items:center';
    grid.append(document.createElement('div'));
    for (let n = 1; n <= 5; n++) { const t = document.createElement('b'); t.textContent = `level ${n}`; grid.append(t); }
    for (const kind of TOWER_KINDS) for (const state of TOWER_STATES) {
      const label = document.createElement('b'); label.textContent = `${kind} ${state}`; grid.append(label);
      for (let n = 1; n <= 5; n++) {
        const [w, h, anchor, draw] = islandFrame(towerStateFrame(kind, n, state)), art = paint(draw, [w, h], 6);
        art.style.cssText = `width:${w * 3}px;height:${h * 3}px`; grid.append(art);
      }
    }
    document.body.append(grid);
  });
  await mkdir(out, {recursive: true});
  await page.screenshot({path: `${out}tower-states-contact-sheet.png`, fullPage: true});
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('saved', `${out}tower-states-contact-sheet.png`);
} finally { await browser?.close(); server.kill(); }
