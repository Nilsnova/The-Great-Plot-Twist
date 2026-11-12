// The art lane's evidence (GAME-V3.md §7): the home island at rest, a wave with ships, the HUD and a
// build card, at one size per run, plus a frame-rate reading with 40 ships on screen.
//   node scripts/capture-art.js <folder> 1280x800 [label] [devicePixelRatio]     (and again with 390x844)
// The 40-ship reading drives a second wave renderer with a synthetic fleet on the live scene, so the
// number is the drawing cost of the art, independent of how many ships a wave happens to send.
import {mkdir, writeFile} from 'node:fs/promises';
import {openWorldBrowser, settle, measure} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/art';
const [width, height] = (process.argv[3] ?? '1280x800').split('x').map(Number);
const label = process.argv[4] ?? 'after', ratio = Number(process.argv[5] ?? 1);
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const size = `${width}x${height}${ratio !== 1 ? `@${ratio}x` : ''}`, name = id => `${out}/${label}-${id}-${size}.png`;
const shot = async id => { await page.waitForTimeout(400); await settle(page); await page.screenshot({path: name(id)}); console.log(name(id)); };
const stand = (x, z) => page.evaluate(([x, z]) => { const g = window.__island; g.player.position.set(x, g.world.current.groundHeight?.(x, z) ?? 1.03, z); g.view.setPlace(g.world.current.id, g.player.position); }, [x, z]);
const island = (fn, arg) => page.evaluate(([source, arg]) => (0, eval)(source)(window.__island.island, arg), [String(fn), arg]);
const wave = () => page.evaluate(() => { const w = window.__island.waves?.island.wave; return w ? {phase: w.state.phase, ships: w.state.ships.length, pause: !!w.pause} : null; });
async function until(test, timeout = 120000) { const end = Date.now() + timeout; while (Date.now() < end) { if (test(await wave())) return; await page.waitForTimeout(250); } throw new Error('timed out'); }
const closeCards = async () => { for (let i = 0; i < 4 && await page.locator('dialog[open]').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } };
const report = {label, width, height, ratio};
try {
  await page.setViewportSize({width, height});
  if (ratio !== 1) await (await page.context().newCDPSession(page)).send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: ratio, mobile: width < 600});
  await page.goto(`${env.url}/?islands=fake`);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.locator('#play').click();
  for (let i = 0; i < 8; i++) {
    await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open]') || (window.__island?.world.current?.id === 'home_islet' && window.__island.island?.island && !document.querySelector('dialog[open]')), null, {timeout: 40000, polling: 100});
    if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
    else if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click();
    else break;
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => window.__island.waves && !document.querySelector('dialog[open]'), null, {timeout: 30000});
  await page.evaluate(() => { window.__island.settings.hour = 12; });
  await stand(0, 4);
  await page.waitForTimeout(1500);
  await shot('01-island-idle');
  report.idle = await measure(page, 120);
  // A built island: walls, cannons, a mortar, the watchtower and a house, some upgraded, with crew.
  await island(async i => { i.dev.setWaveBest(8); i.dev.setCoins(5000); await i.load(); i.dev.setWaveBest(8); });
  await island(async i => {
    const spots = i.island.spots.filter(spot => !spot.built);
    const pick = prefix => spots.filter(spot => spot.id.startsWith(prefix)).map(spot => spot.id);
    for (const id of pick('wall').slice(0, 6)) await i.build(id, 'wall').catch(() => {});
    const towers = pick('cannon');
    for (const [n, id] of towers.slice(0, 5).entries()) await i.build(id, n === 1 || n === 3 ? 'mortar' : 'cannon').catch(() => {});
    for (const id of pick('tower_').slice(0, 1)) await i.build(id, 'watchtower').catch(() => {});
    for (const id of pick('house').slice(0, 2)) await i.build(id, 'house').catch(() => {});
    for (const id of [...towers.slice(0, 3), ...pick('wall').slice(0, 2)]) { await i.upgrade(id).catch(() => {}); }
    for (const id of [towers[0], towers[1], pick('wall')[0]]) if (id) await i.upgrade(id).catch(() => {});
    for (const crew of ['gunner', 'carpenter', 'lookout']) await i.hire(crew).catch(() => {});
  });
  await closeCards();
  await stand(0, 4);
  await page.waitForTimeout(800);
  await shot('02-island-built');
  // The HUD with a build card.
  const spot = await island(i => i.island.spots.find(item => !item.built)?.id ?? i.island.spots[0].id);
  await island((i, id) => i.pick(id), spot);
  await page.locator('dialog[open]').first().waitFor({timeout: 5000}).catch(() => {});
  await shot('03-hud-card');
  await closeCards();
  // A wave with ships.
  await island(async i => { i.dev.setWaveBest(4); await i.load(); });
  console.log('bell:', JSON.stringify(await island(async i => i.ringBell())));
  await until(state => state && state.ships >= 1, 90000);
  await until(state => state && state.ships >= 3, 25000).catch(() => {});
  await page.waitForTimeout(1500);
  await shot('04-wave');
  report.wave = await measure(page, 120);
  // 40 ships on screen: a synthetic fleet drawn by a second wave renderer on the live scene.
  report.ships40 = await page.evaluate(async () => {
    const g = window.__island, module = await import('/src/pirates/render.js');
    const atlas = await module.loadAtlas();
    const renderer = module.createWaveRenderer({scene: g.scene, atlas, defenses: []});
    const kinds = ['sloop', 'sloop', 'brig', 'sloop', 'brig', 'flagship', 'sloop', 'warship'];
    const ships = Array.from({length: 40}, (_, i) => ({id: `s${i}`, kind: kinds[i % kinds.length], x: 0, z: 0, hp: 3 + (i % 3), maxHp: 5, state: 'sailing'}));
    let running = true, t = 0, last = performance.now();
    const tick = now => {
      if (!running) return; const dt = Math.min(.1, (now - last) / 1000); last = now; t += dt;
      ships.forEach((ship, i) => { const a = i / 40 * Math.PI * 2 + t * .05, r = 26 + (i % 4) * 3; ship.x = Math.cos(a) * r; ship.z = Math.sin(a) * (r + 2); });
      renderer.update({state: {ships, walls: [], towers: [], fog: 0, sight: 28}, simTime: t, dt});
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    g.camera.userData.battleZoom = .45;
    await new Promise(resolve => setTimeout(resolve, 2500));
    const start = performance.now(), times = []; let previous = start, calls = 0;
    for (let i = 0; i < 180; i++) { await new Promise(requestAnimationFrame); const now = performance.now(); times.push(now - previous); previous = now; calls = Math.max(calls, g.renderer.info.render.calls); }
    const fps = Math.round(180 * 1000 / (performance.now() - start)), sorted = [...times].sort((a, b) => a - b);
    window.__artStress = {stop() { running = false; renderer.dispose(); delete g.camera.userData.battleZoom; }};
    return {fps, p95Ms: Math.round(sorted[Math.floor(sorted.length * .95)] * 10) / 10, calls, instances: renderer.stats().instances,
      buffer: [g.renderer.domElement.width, g.renderer.domElement.height]};
  });
  await shot('05-forty-ships');
  await page.evaluate(() => window.__artStress?.stop());
  // The island at night: the dusk wash, lit windows and light pools over the cartoon art.
  await page.evaluate(() => { window.__island.settings.hour = 21.5; });
  await page.waitForTimeout(1200);
  await shot('06-night');
  console.log(JSON.stringify(report));
  await writeFile(`${out}/${label}-perf-${size}.json`, JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({path: `${out}/${label}-failure-${size}.png`}).catch(() => {});
  console.log('errors:', env.errors);
  throw error;
} finally { await env.close(); }
