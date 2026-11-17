// Component evidence: unchanged pause menu versus this branch's real report UI.
// Events come from createWave; no live start, payment, finish or room request is made.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir, writeFile} from 'node:fs/promises';

const out = new URL('../../docs/evidence/COC-39/', import.meta.url).pathname;
const server = await createServer({configFile: false, root: new URL('../', import.meta.url).pathname,
  envDir: false, logLevel: 'error', server: {host: '127.0.0.1', port: 0, hmr: false}});
let browser;
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`, errors = [], results = [];
  await mkdir(out, {recursive: true});
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true});
  for (const size of [{width: 1280, height: 720}, {width: 375, height: 812}]) {
    const page = await browser.newPage({viewport: size});
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base || url.pathname.startsWith('/api/')) { errors.push(`Unexpected request: ${url.pathname}`); return route.abort(); }
      if (url.pathname === '/report-evidence') return route.fulfill({contentType: 'text/html', body: '<!doctype html><html><body></body></html>'});
      return route.continue();
    });
    await page.goto(`${base}/report-evidence`);
    await page.addScriptTag({type: 'module', content: 'window.loadReportModule = path => import(path);'});
    await page.waitForFunction(() => !!window.loadReportModule);
    await page.evaluate(async () => {
      for (const sheet of ['base', 'kit/kit', 'kit/components', 'shell']) await window.loadReportModule(`/src/ui/${sheet}.css`);
      const {createModal} = await window.loadReportModule('/src/ui/kit/modal.js');
      const {fillPauseMenu} = await window.loadReportModule('/src/shell/pause.js');
      window.openEvidenceMenu = () => {
        const modal = createModal({title: 'Menu'}), nav = document.createElement('nav');
        modal.element.classList.add('shell-screen'); nav.className = 'shell-menu';
        fillPauseMenu(nav, {play: () => modal.dispose(), page() {}, show() {}});
        modal.setContent(nav); modal.open(); return modal;
      };
      window.beforeReportMenu = window.openEvidenceMenu();
    });
    const key = `${size.width}x${size.height}`;
    await page.screenshot({path: `${out}before-${key}.png`});
    const result = await page.evaluate(async () => {
      window.beforeReportMenu.dispose();
      const {mountDefenseReport} = await window.loadReportModule('/src/pirates/defense-report-feature.js');
      const {createWave} = await window.loadReportModule('/src/pirates/sim.js');
      const {on, emit} = await window.loadReportModule('/src/core/events.js');
      const defenses = [{id: 'wall_1', kind: 'wall', level: 1, x: 0, z: 20}, {id: 'cannon_1', kind: 'cannon', level: 1, x: 0, z: 10}];
      window.reportEvidence = mountDefenseReport({on, container: document.body, context: () => 'fixture', defenses: () => defenses});
      emit({type: 'wave_controller_started', waveId: 'fixture-wave', wave: 12});
      const sim = createWave({wave: 12, seed: 77, defenses, island: {hp: 40}, pathing: true, towerHealth: true});
      for (let i = 0; i < 4000 && !sim.done; i++) window.reportEvidence.events(sim.step(.25));
      if (!sim.done) throw new Error('Evidence wave did not finish');
      window.openEvidenceMenu();
      return window.reportEvidence.read();
    });
    await page.getByRole('button', {name: 'Last defense report', exact: true}).click();
    await page.getByRole('region', {name: 'Last defense report'}).waitFor();
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) throw new Error('Report overflows viewport');
    await page.screenshot({path: `${out}after-${key}.png`});
    results.push({size, report: result}); await page.close();
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${out}capture-results.json`, JSON.stringify({kind: 'controlled-component-evidence', liveBackend: false, browserErrors: errors, results}, null, 2) + '\n');
  console.log(`4 screenshots saved; 2 viewports; browser errors: ${errors.length}; no API writes.`);
} finally { await browser?.close(); await server.close(); }
