// Captures the production island card, scene marker layer and wave replay hooks with a signed-in-shaped
// offline transport. The adapter returns canonical recovery and repair DTOs but makes no server call.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.resolve(scriptDirectory, '..');
const captureDirectory = path.join(frontendDirectory, 'captures');
const server = await createServer({configFile: path.join(frontendDirectory, 'vite.config.js'),
  server: {host: '127.0.0.1', port: 0}});
let browser;

try {
  await mkdir(captureDirectory, {recursive: true});
  await server.listen();
  const baseUrl = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader']});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseUrl}/tests/fixtures/structure-recovery-integration.html`);
  await page.waitForFunction(() => window.recoveryFixture?.ready || window.recoveryFixture?.error, null, {timeout: 60000});
  const bootError = await page.evaluate(() => window.recoveryFixture.error ?? null);
  assert.equal(bootError, null, `fixture boot failed: ${bootError}`);
  const save = async name => {
    await page.waitForTimeout(250);
    await page.screenshot({path: path.join(captureDirectory, name), fullPage: true});
  };
  const pick = async (spot, viewport = null) => {
    if (viewport) await page.setViewportSize(viewport);
    await page.evaluate(spotId => window.recoveryFixture.pick(spotId), spot);
    await page.waitForTimeout(250);
  };
  const clickRepair = () => page.locator('.recovery-repair').click();

  await pick('wall_1');
  await page.getByText('45 / 60 HP').waitFor();
  await page.getByText('Or wait about 2 min 30 sec for free repair').waitFor();
  await page.getByRole('button', {name: 'Repair now: pay 10 coins'}).waitFor();
  await save('t59-integrated-between-desktop.png');

  await page.evaluate(() => window.recoveryFixture.setRepairMode('insufficient_funds'));
  await clickRepair();
  await page.waitForTimeout(500);
  const refusalUi = await page.evaluate(() => ({error: document.querySelector('.recovery-error')?.textContent ?? null,
    repairCalls: window.recoveryFixture.getCalls().filter(call => call.path === '/api/island/structures/repair').length}));
  assert.equal(refusalUi.repairCalls, 1, 'refusal must reach the signed-shape repair endpoint');
  assert.equal(refusalUi.error, 'Not enough coins for this repair.');
  const refused = await page.evaluate(() => window.recoveryFixture.getState().rows.find(row => row.spot === 'wall_1'));
  assert.equal(refused.hpUnits, 750_000, 'refusal keeps exact server HP');
  await save('t59-integrated-refusal-desktop.png');

  await page.evaluate(() => window.recoveryFixture.pick('cannon_1'));
  await page.getByText('0 / 80 HP').waitFor();
  await page.locator('.recovery-bar[aria-valuenow="0"]').waitFor();
  await page.locator('.recovery-marker').waitFor();
  await save('t59-integrated-zero-ruin-desktop.png');

  await page.evaluate(() => window.recoveryFixture.setRepairMode('success'));
  await page.evaluate(() => window.recoveryFixture.pick('wall_1'));
  await clickRepair();
  await page.waitForFunction(() => !document.querySelector('.recovery-hp'));
  const paidBetween = await page.evaluate(() => window.recoveryFixture.getCalls().filter(call => call.path === '/api/island/structures/repair').length);
  assert.equal(paidBetween, 2, 'refusal and accepted between-wave request reached the adapter');
  await save('t59-integrated-full-between-desktop.png');

  await pick('cannon_3', {width: 375, height: 812});
  await page.getByText('0.00006 / 60 HP').waitFor();
  const tinyBar = await page.locator('.health-fill').first().evaluate(element => element.getBoundingClientRect().width);
  assert.ok(tinyBar >= 1, `tiny positive bar must be visible: ${tinyBar}px`);
  await save('t59-integrated-tiny-phone.png');

  await page.evaluate(() => window.recoveryFixture.close());
  const callsBeforePreparation = await page.evaluate(() => window.recoveryFixture.getCalls().filter(call => call.path.endsWith('/health')).length);
  await page.evaluate(() => window.recoveryFixture.startWave());
  await page.waitForFunction(() => window.recoveryFixture.getState().phase === 'preparing');
  await pick('cannon_1', {width: 390, height: 844});
  await page.getByText('0 / 80 HP').waitFor();
  await page.getByText('3 Repair now uses left this wave').waitFor();
  const preparationButton = await page.locator('.recovery-repair').evaluate(element => ({disabled: element.disabled,
    label: element.textContent, card: element.closest('.island-card-build')?.innerText ?? element.parentElement?.parentElement?.innerText ?? '',
    html: element.outerHTML, phase: window.recoveryFixture.getState().phase}));
  preparationButton.canonical = await page.evaluate(() => window.recoveryFixture.readCanonical());
  preparationButton.calls = await page.evaluate(() => window.recoveryFixture.getCalls());
  assert.equal(preparationButton.disabled, false, `preparation repair must be enabled: ${JSON.stringify(preparationButton)}`);
  assert.equal(preparationButton.canonical.data?.displayPhase, 'preparing', `preparation view should be current: ${JSON.stringify(preparationButton)}`);
  await clickRepair();
  await page.waitForTimeout(1000);
  const preparationRepair = await page.evaluate(() => ({state: window.recoveryFixture.getState(),
    error: document.querySelector('.recovery-error')?.textContent ?? null,
    buttonCount: document.querySelectorAll('.recovery-repair').length,
    buttonClicks: window.recoveryFixture.getRepairButtonClicks(),
    repairCalls: window.recoveryFixture.getCalls().filter(call => call.path === '/api/island/structures/repair')}));
  assert.equal(preparationRepair.state.remainingPaidUses, 2,
    `preparation repair did not advance quota: ${JSON.stringify(preparationRepair)}`);
  assert.equal(await page.evaluate(() => window.recoveryFixture.getCalls().filter(call => call.path.endsWith('/health')).length), callsBeforePreparation,
    'preparation paid repair must not submit a combat-health checkpoint');
  await pick('cannon_2');
  await page.getByText('28 / 70 HP').waitFor();
  await page.getByText('2 Repair now uses left this wave').waitFor();
  await page.getByText('Automatic repair paused during waves').first().waitFor();
  await save('t59-integrated-preparation-phone.png');

  const combat = await page.evaluate(() => window.recoveryFixture.waitForCombat());
  assert.equal(combat, true, 'controller enters recovery combat from its frozen wave snapshot');
  await pick('cannon_2', {width: 1440, height: 900});
  await page.getByText('28 / 70 HP').waitFor();
  await page.getByText('Automatic repair paused during waves').first().waitFor();
  await save('t59-integrated-combat-desktop.png');

  await page.evaluate(() => window.recoveryFixture.holdEvents());
  await clickRepair();
  await page.waitForTimeout(1500);
  const combatRepair = await page.evaluate(() => ({error: document.querySelector('.recovery-error')?.textContent ?? null,
    state: window.recoveryFixture.getState(), calls: window.recoveryFixture.getCalls()}));
  assert.ok(combatRepair.calls.some(call => call.method === 'POST' && call.path.endsWith('/health'))
    && combatRepair.calls.filter(call => call.path === '/api/island/structures/repair').length >= 4,
  `combat repair should checkpoint and reach the repair route: ${JSON.stringify(combatRepair)}`);
  await page.getByText('28 / 70 HP').waitFor();
  await save('t59-integrated-combat-http-response-held.png');
  await page.evaluate(() => window.recoveryFixture.releaseEvents());
  await page.waitForFunction(() => !document.querySelector('.recovery-hp'), null, {timeout: 15000});
  await save('t59-integrated-combat-journal-applied.png');

  await page.evaluate(() => window.recoveryFixture.close());
  await pick('cannon_4', {width: 390, height: 844});
  assert.equal(await page.locator('.recovery-hp').count(), 0, 'full health hides the recovery card and bar');
  await save('t59-integrated-full-phone.png');

  const calls = await page.evaluate(() => window.recoveryFixture.getCalls());
  assert.ok(calls.some(call => call.path.endsWith('/health')));
  assert.ok(calls.some(call => call.path.startsWith('/api/waves/') && call.path.includes('/events')));
  assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
  console.log(`Captured ${calls.length} signed-shape adapter requests; between/prep/combat and refusal/full/tiny cases passed.`);
  console.log('Offline adapter only: no authenticated account, charge, or database was used.');
} finally {
  if (browser) await browser.close();
  await server.close();
}
