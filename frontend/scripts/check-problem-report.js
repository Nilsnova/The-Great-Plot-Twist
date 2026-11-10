// Inspect public GitHub issue drafts locally without navigating or submitting any data.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
import {startFromTitle} from './shell-browser-tools.js';

const env = await openWorldBrowser({preview: true});
const {page} = env;
const stamp = JSON.parse(await readFile('dist/build-stamp.json', 'utf8'));
const report = {checks: []};
function check(ok, label) {
  assert.ok(ok, label);
  report.checks.push(label);
}
async function draft() {
  const link = page.getByRole('link', {name: 'Report a problem', exact: true});
  await link.waitFor();
  await link.evaluate(element => {
    element.addEventListener('click', event => event.preventDefault(), {once: true});
    element.click();
  });
  const url = new URL(await link.getAttribute('href'));
  check(url.origin + url.pathname === 'https://github.com/Nilsnova/The-Great-Plot-Twist/issues/new'
    && url.href.length < 7000, 'Issue destination is fixed and its URL stays below 7,000 characters');
  check(url.searchParams.get('title').startsWith(`[playtest ${stamp.sha}] `), 'Title carries the playtest build');
  const description = await page.locator(`#${await link.getAttribute('aria-describedby')}`).textContent();
  check(description.includes('Opens GitHub') && description.includes('GitHub account')
    && description.includes('public report'), 'Visible report description explains GitHub and public submission');
  return url.searchParams.get('body');
}
function checkContext(body, screen) {
  check(body.includes(`Build: ${stamp.sha}`) && body.includes(`Screen: ${screen}`),
    'Draft contains its build and validated screen');
  check(body.includes(`Environment: ${stamp.environment ?? 'Unavailable'}`), 'Environment follows the build stamp');
  check(/Mode: (online|unavailable|local)\n/.test(body), 'Adapter mode is a fixed enum');
  check(/Account state: (signed_out|signing_in|signed_in|expired|error)\n/.test(body),
    'Account state excludes account identifiers');
  check(/Browser: (Chrome|Firefox|Safari|Edge|Other)( \d+)?\n/.test(body), 'Browser contains only family and major');
  check(body.includes('Performance: Unavailable'), 'Performance numbers are omitted without perf=1');
  check(body.includes('Check this public report before submitting'), 'Draft carries a public check notice');
  check(body.endsWith('## What happened?\n\n## What you expected\n\n'), 'Both player description sections stay empty');
}
async function plantPrivateControl() {
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.textContent = 'PRIVATE_PLAYER_NAME';
    button.dataset.focus = 'PRIVATE_PLAYER_ID';
    document.querySelector('.preferences').append(button);
    button.click();
    button.remove();
  });
}
async function setGamepads(connected) {
  await page.evaluate(connected => {
    const pad = {
      id: 'PRIVATE_DEVICE_ID', connected: true, mapping: 'standard', axes: [.4, 0],
      buttons: Array.from({length: 17}, () => ({pressed: false})),
    };
    Object.defineProperty(navigator, 'getGamepads', {configurable: true, value: () => connected ? [pad] : []});
  }, connected);
}
try {
  
  await page.goto(env.url);
  await page.getByRole('button', {name: 'Settings', exact: true}).click();
  let body = await draft();
  checkContext(body, 'settings');
  check(body.includes('Place: not_started'), 'Title settings do not invent a place');
  await plantPrivateControl();
  await page.setViewportSize({width: 375, height: 667});
  body = await draft();
  check(body.includes('375 × 667') && !body.includes('PRIVATE_'), 'Viewport updates and private labels stay excluded');
  await page.getByRole('link', {name: 'Report a problem', exact: true}).scrollIntoViewIfNeeded();
  await page.screenshot({path: 'captures/20261106_G9-Report-Settings-375.png'});
  await page.keyboard.press('Escape');
  await startFromTitle(page);
  await page.keyboard.press('Escape');
  body = await draft();
  checkContext(body, 'pause');
  check(body.includes('Place: lighthouse_isle') && body.includes('- pause'),
    'Pause carries the current public place and semantic UI action');
  const actions = body.split('Last UI actions:\n')[1].split('\n\n## What happened?')[0];
  check(actions.split('\n').filter(line => line.startsWith('- ')).length <= 10, 'History stays below eleven actions');
  await setGamepads(true);
  await page.waitForTimeout(120);
  body = await draft();
  check(body.includes('Input: gamepad') && !body.includes('PRIVATE_DEVICE_ID'), 'Gamepad device ids are excluded');
  await setGamepads(false);
  await page.getByRole('link', {name: 'Report a problem', exact: true})
    .dispatchEvent('pointerdown', {pointerType: 'touch'});
  body = await draft();
  check(body.includes('Input: touch'), 'Touch input is a coarse enum');
  await page.screenshot({path: 'captures/20261106_G9-Report-Pause-375.png'});
  check(env.errors.length === 0 && env.external.length === 0,
    'Inspecting the draft creates no external requests or browser errors');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile('captures/20261106_G9-Report-Checks.json', JSON.stringify(report, null, 2) + '\n');
  await env.close();
}
