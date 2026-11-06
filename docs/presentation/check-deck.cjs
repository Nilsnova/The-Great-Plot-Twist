// Verifies real navigation/notes/CSP/print behavior without contacting a network server.
// Optional G25_FILE_MODE=1 tests file: directly where browser policy permits it.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {createRequire} = require('node:module');
const root = __dirname;
const repo = path.resolve(root, '../..');
const {chromium} = createRequire(path.join(repo, 'frontend/package.json'))('playwright-core');
const artifacts = process.env.G25_ARTIFACTS || `/tmp/g25-checks-${Date.now()}`;
const fileMode = process.env.G25_FILE_MODE === '1';
const base = 'http://127.0.0.1:43125/'; // Intercepted from disk; no server is started.
const report = {baseline:'d5ad219', transport:fileMode ? 'file:' : 'offline disk interception', checks:[]};
const passed = label => report.checks.push(label);
const mime = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml'};

(async () => {
  await fs.mkdir(artifacts, {recursive:true});
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/chromium', headless:true});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:900}, offline:true});
    const errors = [], violations = [], remote = [];
    await context.exposeBinding('recordCsp', (_source, directive) => { violations.push(directive); });
    await context.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', event => window.recordCsp(event.violatedDirective));
    });
    context.on('page', page => {
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'file:' && fileMode) { await route.continue(); return; }
      if (url.origin !== new URL(base).origin) {
        remote.push(url.origin); await route.abort(); return;
      }
      const local = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!local.startsWith(root + path.sep)) { await route.abort(); return; }
      try { await route.fulfill({body:await fs.readFile(local), contentType:mime[path.extname(local)] || 'application/octet-stream'}); }
      catch { await route.fulfill({status:404, body:'Not found'}); }
    });
    const page = await context.newPage();
    await page.goto(fileMode ? pathToFileURL(path.join(root, 'index.html')).href : base);
    await page.locator('#counter').filter({hasText:'01 / 10'}).waitFor();
    assert.equal(await page.locator('.slide:visible').count(), 1);
    assert.equal(await page.locator('template').count(), 10);
    assert.equal(await page.locator('[style],[onclick],script:not([src])').count(), 0);
    assert.deepEqual(await page.locator('.slide').evaluateAll(slides => slides.map(s => Number(s.dataset.seconds))), [45,55,80,75,70,55,70,75,75,45]);
    passed('Ten slides, full notes, 10:45 allocation; no inline script/style');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#counter').textContent(), '02 / 10');
    await page.locator('#slide-2 h2').click();
    assert.equal(await page.locator('#counter').textContent(), '03 / 10');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('End');
    assert.equal(await page.locator('#counter').textContent(), '10 / 10');
    assert.equal(await page.locator('#next').isDisabled(), true);
    await page.keyboard.press('Home');
    assert.equal(await page.locator('#previous').isDisabled(), true);
    passed('Arrow keys, click, Home/End and boundary controls work');
    // Inspect every slide at presentation size, including image loading and clipping.
    for (let i=1; i<=10; i++) {
      await page.goto(`${fileMode ? pathToFileURL(path.join(root,'index.html')).href : base}#slide-${i}`);
      await page.locator(`#slide-${i}:visible`).waitFor();
      assert.equal(await page.locator('.slide:visible').count(), 1);
      const geometry = await page.evaluate(() => ({
        width:innerWidth, height:innerHeight, documentWidth:document.documentElement.scrollWidth,
        bodyHeight:document.body.scrollHeight,
        images:[...document.querySelectorAll('.slide:not([hidden]) img')].map(img => img.complete && img.naturalWidth > 0),
      }));
      assert.ok(geometry.documentWidth <= geometry.width, `Slide ${i}: horizontal overflow`);
      assert.ok(geometry.bodyHeight <= geometry.height + 2, `Slide ${i}: vertical overflow`);
      assert.ok(geometry.images.every(Boolean), `Slide ${i}: image missing`);
      await page.screenshot({path:path.join(artifacts, `slide-${String(i).padStart(2,'0')}.png`)});
    }
    passed('All slides and original diagrams load without desktop overflow');
    await page.keyboard.press('Home');
    const popup = page.waitForEvent('popup');
    await page.locator('#notes-link').click();
    const notes = await popup;
    await notes.waitForLoadState();
    await notes.locator('#notes-copy p').waitFor();
    assert.match(await notes.locator('#pair-status').textContent(), /^Paired/);
    await page.keyboard.press('ArrowRight');
    await notes.locator('#counter').filter({hasText:'02 / 10'}).waitFor();
    await notes.locator('#next').click();
    await page.locator('#counter').filter({hasText:'03 / 10'}).waitFor();
    await notes.keyboard.press('ArrowRight');
    await page.locator('#counter').filter({hasText:'04 / 10'}).waitFor();
    assert.match(await notes.locator('#slide-timing').textContent(), /3:00–4:15/);
    await page.evaluate(() => window.postMessage({type:'g25-navigate',index:9}, '*'));
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#counter').textContent(), '04 / 10');
    passed('Paired notes sync both directions; keyboard survives button focus; unrelated messages ignored');
    await notes.locator('#clock-toggle').click();
    await notes.waitForFunction(() => document.querySelector('#clock').textContent !== '0:00');
    await notes.locator('#clock-toggle').click();
    const paused = await notes.locator('#clock').textContent();
    await notes.waitForTimeout(1100);
    assert.equal(await notes.locator('#clock').textContent(), paused);
    await notes.locator('#clock-reset').click();
    assert.equal(await notes.locator('#clock').textContent(), '0:00');
    await notes.screenshot({path:path.join(artifacts,'speaker-view.png')});
    passed('Rehearsal clock starts, pauses and resets');
    await notes.close();
    const standalone = await context.newPage();
    await standalone.goto((fileMode ? pathToFileURL(path.join(root,'index.html')).href : base) + '?view=notes#slide-7');
    assert.match(await standalone.locator('#pair-status').textContent(), /^Standalone/);
    assert.equal(await standalone.locator('#notes-copy p').count(), 1);
    await standalone.emulateMedia({media:'print'});
    assert.equal(await standalone.locator('.slide:visible').count(), 10);
    assert.equal(await standalone.locator('#notes-panel:visible').count(), 0);
    assert.deepEqual(await standalone.locator('.slide').evaluateAll(slides => slides.filter(slide => slide.scrollHeight > slide.clientHeight + 2).map(slide => slide.id)), []);
    await standalone.close();
    passed('Standalone notes view opens on a bookmarked slide and prints audience slides only');
    await page.setViewportSize({width:390,height:844});
    await page.keyboard.press('Home');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#counter').textContent(), '02 / 10');
    passed('Narrow viewport retains navigation without horizontal overflow');
    await page.setViewportSize({width:1440,height:900});
    await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('.slide:visible').count(), 10);
    assert.equal(await page.locator('#notes-panel:visible,.toolbar:visible,.footer:visible').count(), 0);
    const clipped = await page.locator('.slide').evaluateAll(slides => slides.filter(slide => slide.scrollHeight > slide.clientHeight + 2 || slide.scrollWidth > slide.clientWidth + 2).map(slide => slide.id));
    assert.deepEqual(clipped, [], 'Print content overflows a slide');
    const pdf = process.env.G25_PDF || path.join(artifacts,'presentation.pdf');
    await page.pdf({path:pdf, preferCSSPageSize:true, printBackground:true, displayHeaderFooter:false, tagged:true, outline:true});
    passed('Print displays all ten slides, hides controls/notes, fits pages and exports PDF');
    assert.deepEqual(violations, [], 'Content Security Policy violations');
    assert.deepEqual(errors, [], 'Browser errors');
    assert.deepEqual(remote, [], 'External network requests');
    passed('No external requests, browser errors or CSP violations with offline context');
    report.pdf=pdf;
    report.artifacts=artifacts;
    await fs.writeFile(path.join(artifacts,'report.json'), JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
