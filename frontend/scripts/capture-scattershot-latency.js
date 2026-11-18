// CW1 evidence: compare actual baseline/current simulator results, then capture an offline diagnostic report.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const BASE = '48aee0e7b34c879968c4bc606b543f911032adfa';
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.dirname(frontend), simPath = path.join(frontend, 'src/pirates/sim.js');
const output = path.join(root, 'docs/evidence/CW1-scattershot');
const options = { seed: 11, wave: 6, defenses: [], island: { hp: 1e9 },
  recoveryVersion: 1, waveProtocol: 2, recoveryStructures: [] };
const baseline = execFileSync('git', ['show', `${BASE}:frontend/src/pirates/sim.js`], { cwd: root, encoding: 'utf8' });
const current = await readFile(simPath, 'utf8');
const hash = source => createHash('sha256').update(source).digest('hex');

async function simulate(source) {
  let intercepted = false;
  const server = await createServer({ root: frontend, server: { middlewareMode: true },
    plugins: [{ name: 'cw1-evidence-source', enforce: 'pre', load(id) {
      if (id === simPath) { intercepted = true; return source; }
    } }] });
  try {
    const { createWave } = await server.ssrLoadModule('/src/pirates/sim.js');
    assert.ok(intercepted, 'The simulator must use the explicitly selected source.');
    const sim = createWave(options);
    let first;
    for (let i = 0; i < 6000 && !first; i++) {
      sim.step(.05);
      first = sim.state().ships.find(ship => ship.state === 'sailing');
    }
    assert.ok(first);
    sim.step(.05);
    const observed = sim.state().ships.find(ship => ship.id === first.id);
    const distance = Math.hypot(observed.x - first.x, observed.z - first.z);
    const vx = (observed.x - first.x) / distance, vz = (observed.z - first.z) / distance;
    const input = { type: 'captain_shot', by: 'cw1-evidence', level: 1, skills: [], weapon: 'blunderbuss', targetId: observed.id,
      x: observed.x - vx * 8.7, z: observed.z - vz * 8.7, ax: observed.x, az: observed.z,
      seen: Math.round(sim.state().time / .05) };
    for (let i = 0; i < 20; i++) sim.step(.05);
    const atResolution = sim.state().ships.find(ship => ship.id === observed.id);
    const events = sim.step(.05, [input]);
    for (let i = 0; i < 20; i++) events.push(...sim.step(.05));
    const fired = events.find(event => event.type === 'captain_fired');
    const hits = events.filter(event => event.type === 'ship_hit' && event.shipId === observed.id && event.by === 'captain:cw1-evidence');
    return { sourceSha256: hash(source), input, observed, atResolution, effectiveTick: input.seen + 20,
      selected: fired.targets.map(target => target.id), damage: hits.reduce((sum, event) => sum + event.damage, 0),
      fired, hits };
  } finally { await server.close(); }
}

const before = await simulate(baseline), after = await simulate(current);
assert.deepEqual(before.input, after.input);
assert.deepEqual(before.observed, after.observed);
assert.deepEqual(before.atResolution, after.atResolution);
assert.equal(before.damage, 0);
assert.equal(after.damage, 4.8);
assert.ok(!before.selected.includes(before.observed.id));
assert.ok(after.selected.includes(after.observed.id));
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'simulation.json'), JSON.stringify({ baseline: BASE, options, before, after }, null, 2) + '\n');

function report(data, phase) {
  const hit = data.selected.includes(data.observed.id), color = hit ? '#49dca9' : '#ff8a7e';
  const heading = Math.atan2(data.input.az - data.input.z, data.input.ax - data.input.x);
  const local = item => ({ x: (item.x - data.input.x) * Math.cos(heading) + (item.z - data.input.z) * Math.sin(heading),
    z: -(item.x - data.input.x) * Math.sin(heading) + (item.z - data.input.z) * Math.cos(heading) });
  const point = item => { const at = local(item); return { x: 62 + at.x * 45, y: 180 - at.z * 45 }; };
  const seen = point(data.observed), now = point(data.atResolution);
  const range = item => Math.hypot(item.x - data.input.x, item.z - data.input.z).toFixed(2);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>CW1 ${phase} simulator evidence</title><style>
  *{box-sizing:border-box}body{margin:0;background:#111c26;color:#eef5f8;font:16px/1.4 system-ui,sans-serif}
  main{max-width:1200px;margin:auto;padding:28px 36px}.eyebrow{font-size:12px;letter-spacing:.12em;color:#9bb4c3;text-transform:uppercase}
  h1{font-size:34px;margin:8px 0 4px}p{margin:0;color:#bbcad4}.layout{display:grid;grid-template-columns:1.8fr 1fr;gap:24px;margin-top:26px}
  .panel{background:#182936;border:1px solid #304755;border-radius:16px;padding:24px}.status{color:${color};font-size:25px;font-weight:700}
  .tag{display:inline-block;border:1px solid #516875;border-radius:20px;padding:4px 10px;font-size:12px;margin:8px 0 18px}
  svg{display:block;width:100%;height:270px;margin:12px 0}svg text{font:23px system-ui,sans-serif;fill:#dce8ef}
  .legend{font-size:13px;display:flex;gap:22px;flex-wrap:wrap}.legend span:first-child{color:#71c8ff}.legend span:last-child{color:#ffc778}
  .metrics{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:22px 0}.value{font-size:28px;font-weight:700;color:#fff}.label{color:#9fb6c5;font-size:12px}
  .detail{font-size:14px;border-top:1px solid #304755;padding-top:18px}.detail strong{color:#fff}footer{margin-top:22px;font-size:12px;color:#91aab9}
  @media(max-width:600px){main{padding:20px 16px}h1{font-size:25px}.eyebrow{font-size:10px}.subtitle{font-size:12px}.layout{display:flex;flex-direction:column;gap:14px;margin-top:18px}.panel{padding:16px}.status{font-size:22px}.tag{margin:8px 0 4px}.diagram{padding-bottom:12px}svg{height:auto;margin:12px 0}.legend{font-size:11px;gap:12px}.metrics{margin:14px 0;gap:10px}.value{font-size:24px}.detail{font-size:12px;padding-top:12px}.metrics-panel .status{font-size:17px}footer{font-size:10px;margin-top:14px}}
  </style><main><div class="eyebrow">CW1 · offline simulator diagnostic · ${phase}</div><h1>Scattershot under delay</h1>
  <p class="subtitle">Same moving target and command. Actual simulation output.</p><div class="layout">
  <section class="panel diagram"><div class="status">${hit ? 'Hit registered' : 'Shot missed'}</div>
  <div class="tag">Seed 11 · wave 6 · blunderbuss · level 1</div>
  <svg viewBox="0 0 720 360" role="img" aria-label="Target observed within range, then sailing outside range before the delayed shot resolves">
  <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ffc778"/></marker></defs>
  <path d="M62 180 L429 9 A405 405 0 0 1 429 351 Z" fill="#244e5e" fill-opacity=".7" stroke="#599aac" stroke-width="2"/>
  <line x1="62" y1="180" x2="655" y2="180" stroke="#5c7481" stroke-dasharray="6 7"/>
  <line x1="${seen.x}" y1="${seen.y}" x2="${now.x}" y2="${now.y}" stroke="#ffc778" stroke-width="3" marker-end="url(#arrow)"/>
  <circle cx="62" cy="180" r="12" fill="#fff"/><text x="24" y="223">Captain</text>
  <circle cx="${seen.x}" cy="${seen.y}" r="13" fill="#71c8ff"/><text x="${seen.x - 35}" y="${seen.y - 30}">Seen</text>
  <circle cx="${now.x}" cy="${now.y}" r="13" fill="#ffc778"/><text x="${now.x - 30}" y="${now.y + 46}">Now</text>
  <text x="190" y="94">50° cone</text><text x="228" y="290">9-unit range</text>
  </svg><div class="legend"><span>Blue: observed at tick ${data.input.seen}</span><span>Gold: resolution at tick ${data.effectiveTick}</span></div></section>
  <section class="panel metrics-panel"><div class="status">${phase === 'Before fix' ? 'Baseline selection' : 'Observed-tick selection'}</div>
  <div class="metrics"><div><div class="value">${range(data.observed)}</div><div class="label">Distance when seen</div></div>
  <div><div class="value">${range(data.atResolution)}</div><div class="label">Distance on resolution</div></div>
  <div><div class="value">${hit ? '1' : '0'}</div><div class="label">Target selected</div></div>
  <div><div class="value" style="color:${color}">${data.damage}</div><div class="label">Actual damage</div></div></div>
  <p class="detail">${hit ? '<strong>ship_1 is selected where it was seen.</strong> Its projectile and damage still resolve against the living target.' : '<strong>ship_1 was in range when seen.</strong> Current-position selection misses it after the 1-second command delay.'}</p>
  </section></div><footer>Diagnostic report, not the game UI. Baseline ${BASE.slice(0, 8)}; no hosted room, API, account or paid state.</footer></main></html>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.route('**/*', route => route.abort());
  for (const [variant, data, phase] of [['before', before, 'Before fix'], ['after', after, 'After fix']]) {
    for (const [size, viewport] of [['desktop', { width: 1280, height: 720 }], ['phone', { width: 375, height: 812 }]]) {
      await page.setViewportSize(viewport);
      await page.setContent(report(data, phase));
      await page.evaluate(() => document.fonts.ready);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      assert.ok(height <= viewport.height, `${variant}-${size}: report height ${height} must fit ${viewport.height}.`);
      await page.screenshot({ path: path.join(output, `${variant}-${size}.png`) });
    }
  }
} finally { await browser.close(); }
console.log('CW1: identical input; baseline 0 damage, current 4.8 damage; four 1280×720 / 375×812 diagnostic screenshots captured.');
