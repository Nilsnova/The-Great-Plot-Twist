// Actual Canvas art at both required viewports, compared with the chosen Git baseline.
// node scripts/capture-house-levels.js ../docs/evidence/COC-07-house-levels origin/main
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';

const out = process.argv[2] ?? '../docs/evidence/COC-07-house-levels', baseRef = process.argv[3] ?? 'origin/main';
const baselineCommit = execFileSync('git', ['rev-parse', baseRef], {encoding: 'utf8'}).trim();
const baseline = execFileSync('git', ['show', `${baselineCommit}:frontend/src/art/island.js`], {encoding: 'utf8'});
const server = await createServer({configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), envDir: false,
  define: {__BUILD_STAMP__: JSON.stringify({sha: 'art-fixture', builtAt: '2026-11-17T00:00:00Z'})},
  server: {host: '127.0.0.1', port: 0, hmr: false}, logLevel: 'error'});
let browser;
await mkdir(out, {recursive: true});
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true});
  const report = {baseRef, baselineCommit, fixture: 'Actual house painter and current buildingArt selection; no gameplay simulation', captures: []};
  for (const [width, height] of [[1280, 720], [375, 812]]) for (const phase of ['before', 'after']) {
    const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: 1});
    const errors = [], blockedRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base || url.pathname.startsWith('/api/')) { blockedRequests.push(url.pathname); return route.abort(); }
      if (url.pathname === '/house-art-fixture') return route.fulfill({contentType: 'text/html', body: '<!doctype html><html><body></body></html>'});
      if (url.pathname === '/favicon.ico') return route.fulfill({status: 204});
      return route.continue();
    });
    await page.goto(`${base}/house-art-fixture`);
    const masks = await page.evaluate(async ({phase, baseline}) => {
      const {frameCanvas} = await import('/src/art/textures.js');
      const {buildingArt} = await import('/src/island/world.js');
      let frames;
      if (phase === 'before') {
        const code = baseline.replaceAll("from './paint.js'", "from '/src/art/paint.js'").replaceAll("from './tower-states.js'", "from '/src/art/tower-states.js'")
          .replaceAll("from '/src/", `from '${location.origin}/src/`);
        const blob = URL.createObjectURL(new Blob([code], {type: 'text/javascript'}));
        try { frames = (await import(/* @vite-ignore */ blob)).islandFrames(); } finally { URL.revokeObjectURL(blob); }
      } else frames = (await import('/src/art/island.js')).islandFrames();
      document.documentElement.lang = 'en';
      document.head.innerHTML = '<meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:18px;background:#173e39;color:#fff5da;font:15px system-ui}h1{font-size:24px;margin:0 0 5px}p{margin:0 0 16px;color:#c8ded0}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.cell{min-height:125px;border:1px solid #6e9273;border-radius:12px;background:#2c5d47;text-align:center;padding:8px}.name{font-size:12px;display:block;color:#f9df9c}canvas{display:block;height:88px;width:auto;max-width:100%;object-fit:contain;margin:auto}small{display:block;margin-top:10px;color:#c8ded0}@media(min-width:700px){body{padding:24px 12%}.cell{min-height:122px}canvas{height:88px}}</style>';
      document.body.innerHTML = `<h1>House growth · ${phase}</h1><p>Original house art · same ground box and role signs</p><main class="grid"></main><small>Art fixture from the real Canvas renderer. Not a gameplay screenshot.</small>`;
      const result = [];
      for (const role of [null, 'barracks', 'tavern', 'workshop']) for (const level of [1, 2, 3]) {
        const cell = document.createElement('section'); cell.className = 'cell';
        const title = document.createElement('span'); title.className = 'name'; title.textContent = `${role ?? 'House'} · L${level}`; cell.append(title);
        document.querySelector('main').append(cell);
        if (role && level === 1) { cell.append('Role opens at L2'); continue; }
        const id = phase === 'before' ? (role ? `island-house-${role}` : 'island-house') : buildingArt('house', level, role);
        const frame = frames[id], canvas = frameCanvas(id, 3, frame); cell.append(canvas);
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        result.push({role, level, id, box: frame.slice(0, 3), mask: Array.from(pixels.filter((_v, i) => i % 4 === 3), value => value > 200 ? 1 : 0).join('')});
      }
      return result;
    }, {phase, baseline});
    assert.deepEqual(errors, []);
    if (phase === 'after') for (const role of [null, 'barracks', 'tavern', 'workshop']) {
      const group = masks.filter(item => item.role === role);
      assert.equal(new Set(group.map(item => item.mask)).size, group.length, `${role ?? 'plain'} silhouettes differ`);
      for (const item of group) assert.deepEqual(item.box, role ? [80, 72, 8] : [64, 64, 8]);
    }
    const path = `${out}/${phase}-${width}x${height}.png`;
    await page.screenshot({path, fullPage: false});
    assert.deepEqual(errors, []);
    assert.deepEqual(blockedRequests, [], 'the art fixture never calls an API or external host');
    report.captures.push({phase, width, height, path, frames: masks.map(({mask, ...item}) => ({...item,
      silhouetteSha256: createHash('sha256').update(mask).digest('hex')})), browserErrors: errors, blockedRequests});
    await page.close();
  }
  const plainFirst = capture => capture.frames.find(item => item.role === null && item.level === 1).silhouetteSha256;
  for (const width of [1280, 375]) {
    const pair = report.captures.filter(capture => capture.width === width);
    assert.equal(plainFirst(pair[0]), plainFirst(pair[1]), 'level-1 silhouette is preserved');
  }
  await writeFile(`${out}/capture-report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log('4 house-art captures; distinct silhouettes and unchanged frame boxes passed; browser errors: 0');
} finally { await browser?.close(); await server.close(); }
