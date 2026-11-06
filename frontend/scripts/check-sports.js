// Local production-asset rehearsal: stand-in HTTP only, strict preview CSP, native phone/keyboard UI.
// Run after npm run build. Fictional/future fixtures below never contact a sports provider.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { openWorldBrowser } from './world-browser-tools.js';
import { BOARD, FIXTURE, MINE, OPEN_STAKE, SAVED } from '../tests/sports/sample-answers.js';

const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'));
const panelAsset = manifest['src/screens/sports/panel.js'];
const httpAsset = manifest['src/screens/sports/http.js'];
const env = await openWorldBrowser({ preview: true }), { page } = env;
const report = { checks: [], production: true, network: 'local intercepted API only' };
const check = (ok, label) => { assert.ok(ok, label); report.checks.push(label); };
let mode = 'live', saved = false, paid = false, failOnce = true, hostile = true;
const calls = [];
await page.route('**/api/**', async route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  const body = request.method() === 'POST' ? request.postDataJSON() : null;
  calls.push({ path, body, authorization: request.headers().authorization });
  const send = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
  if (path === '/api/sports') {
    if (mode === 'off') return send({ error: { code: 'feature_off', message: 'Sports predictions are not available yet.' } }, 404);
    if (mode === 'unavailable') return send({ error: { code: 'sports_unavailable', message: 'Current sports results are not available right now.' } }, 503);
    const fixture = { ...FIXTURE, home: hostile ? '<img src=x onerror=alert(1)> Harbor Athletic' : FIXTURE.home };
    if (mode === 'recorded') Object.assign(fixture, { source: 'recorded', canStake: true });
    if (mode === 'closed') Object.assign(fixture, { canStake: false, status: 'playing' });
    return send({ ...BOARD, fixtures: mode === 'removed' ? [] : [fixture] });
  }
  if (path === '/api/sports/mine') return send({ ...MINE, coins: saved ? 990 : 1000,
    checksUnavailable: mode === 'unverified', stakes: saved ? [{ ...OPEN_STAKE,
      ...(paid ? { status: 'settled', payout: 19, settlement: 'winners' } : {}) }] : [] });
  if (path === '/api/sports/stake') {
    saved = true;
    if (failOnce) { failOnce = false; return send({ error: { code: 'database_unavailable', message: 'Answer lost.' } }, 503); }
    return send({ ...SAVED, repeat: true });
  }
  if (path === '/api/sports/settle') {
    paid = true;
    return send({ settled: true, repeat: false, fixtureId: FIXTURE.id, settlement: 'winners', paidCoins: 19, cutCoins: 1 });
  }
  return send({ error: { code: 'feature_off', message: 'Local test only.' } }, 404);
});
try {
  await page.goto(`${env.url}/ui-kit.html`);
  await page.evaluate(async ({ panelPath, httpPath, css }) => {
    window.__sportsViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.__sportsViolations.push(event.violatedDirective));
    for (const path of css) { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = `/${path}`; document.head.append(link); }
    const { createSportsPanel } = await import(`/${panelPath}`);
    const { createSportsHttp } = await import(`/${httpPath}`);
    const opener = document.createElement('button'); opener.textContent = 'Open test pavilion'; document.body.prepend(opener); opener.focus();
    window.__sportsToken = null; window.__sportsReset = 0;
    window.__sports = createSportsPanel({ container: document.body,
      adapter: createSportsHttp({ getToken: () => window.__sportsToken }), getToken: () => window.__sportsToken,
      resetInput: () => window.__sportsReset++, focusGame: () => opener.focus(), refreshMs: 200,
    });
    await window.__sports.open();
  }, { panelPath: panelAsset.file, httpPath: httpAsset.file, css: panelAsset.css ?? [] });
  const dialog = page.locator('.sports-modal');
  await dialog.getByText('Source updated', { exact: false }).waitFor();
  check(calls.every(call => !call.authorization), 'Public board sends no Authorization header');
  check(!calls.some(call => call.path.endsWith('/mine')), 'Anonymous visitors never request private stakes');
  check(await dialog.locator('img').count() === 0 && (await dialog.textContent()).includes('<img src=x'), 'Hostile team names stay plain text');
  check((await dialog.textContent()).includes('Simulation') && (await dialog.textContent()).includes('may be delayed'), 'Play money and source freshness are visible');
  await page.getByRole('tab', { name: 'Fixtures', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  check(await page.getByRole('tab', { name: 'My stakes', exact: true }).getAttribute('aria-selected') === 'true', 'Keyboard arrows select My stakes');
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  check(await page.getByRole('button', { name: 'Open test pavilion' }).evaluate(element => element === document.activeElement), 'Escape restores invoking focus');
  const before = calls.length; await page.waitForTimeout(450);
  check(calls.length === before, 'Polling stops when the dialog closes');

  await page.evaluate(async () => { window.__sportsToken = 'local-test-account'; await window.__sports.open(); });
  await page.getByRole('tab', { name: 'Fixtures', exact: true }).click();
  await dialog.getByLabel('Play coins', { exact: true }).fill('10');
  await dialog.getByRole('button', { name: 'Review stake', exact: true }).click();
  check(await dialog.getByRole('button', { name: 'Confirm stake', exact: true }).evaluate(element => element === document.activeElement), 'Review focuses the explicit confirmation');
  await dialog.getByRole('button', { name: 'Confirm stake', exact: true }).click();
  await dialog.getByText('The stake outcome is unknown.', { exact: false }).waitFor();
  const first = calls.find(call => call.path.endsWith('/stake'));
  check(Object.keys(first.body).sort().join(',') === 'amount,fixtureId,pick,stakeId', 'Stake body contains only the approved intent fields');
  await page.keyboard.press('Escape'); mode = 'removed';
  await page.evaluate(() => window.__sports.open());
  await dialog.getByRole('button', { name: 'Retry same stake', exact: true }).click();
  await dialog.getByText('This stake was already saved.', { exact: false }).waitFor();
  const writes = calls.filter(call => call.path.endsWith('/stake'));
  check(writes.length === 2 && JSON.stringify(writes[0].body) === JSON.stringify(writes[1].body), 'Lost-answer retry survives close/reopen and a fixture leaving the public board');
  await page.getByRole('tab', { name: 'My stakes', exact: true }).click();
  mode = 'unverified'; await dialog.getByRole('button', { name: 'Refresh results', exact: true }).click();
  await dialog.getByText('Result checks are temporarily unavailable.', { exact: false }).waitFor();
  check((await dialog.textContent()).includes('No payout has been confirmed'), 'Unavailable result checks never imply a payout');
  await dialog.getByRole('button', { name: 'Check verified result', exact: true }).click();
  await dialog.getByText('Paid · 19 coins returned', { exact: true }).waitFor();
  check(JSON.stringify(calls.find(call => call.path.endsWith('/settle')).body) === JSON.stringify({ fixtureId: FIXTURE.id }), 'Settlement sends a fixture only, never an outcome');

  await page.getByRole('tab', { name: 'Fixtures', exact: true }).click();
  for (const state of ['recorded', 'closed', 'off', 'unavailable']) {
    mode = state; await dialog.getByRole('button', { name: 'Refresh results', exact: true }).click();
    const expected = { recorded: 'Recorded example', closed: 'In play', off: 'not open yet', unavailable: 'not available right now' }[state];
    await dialog.getByText(expected, { exact: false }).first().waitFor();
    check(await dialog.getByRole('button', { name: 'Review stake', exact: true }).count() === 0, `${state}: no stake form is offered`);
  }
  mode = 'live'; saved = false; paid = false; hostile = false;
  await dialog.getByRole('button', { name: 'Refresh results', exact: true }).click();
  await dialog.getByLabel('Play coins', { exact: true }).waitFor();
  await page.setViewportSize({ width: 375, height: 812 });
  check(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), 'Phone dialog has no horizontal overflow');
  check(await dialog.locator('button,input,select').evaluateAll(elements => elements.filter(element => element.getClientRects().length).every(element => element.getBoundingClientRect().height >= 40)), 'Phone controls remain touch sized');
  await page.screenshot({ path: 'captures/G15-Sports-Phone.png' });
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.screenshot({ path: 'captures/G15-Sports-Desktop.png' });
  await page.evaluate(() => window.__sports.dispose());
  check(await dialog.count() === 0, 'Disposal removes the modal');
  const stopped = calls.length; await page.waitForTimeout(450); check(calls.length === stopped, 'Disposed panel leaves no polling');
  check(await page.evaluate(() => window.__sportsViolations.length === 0), 'Production panel obeys the strict preview CSP');
  check(env.external.length === 0, 'No external/provider requests');
  check(env.errors.filter(error => !/Failed to load resource: the server responded with a status of (404|503)/.test(error)).length === 0, 'No unexpected browser errors');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile('captures/G15-Sports-Checks.json', JSON.stringify(report, null, 2));
  await env.close();
}
