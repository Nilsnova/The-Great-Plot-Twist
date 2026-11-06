// Read-only browser smoke for an already-running G22 loopback stack; no real login or provider.
// Usage: node frontend/scripts/check-local-dev.js http://127.0.0.1:5173
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const target = new URL(process.argv[2] ?? 'http://127.0.0.1:5173');
assert.ok(target.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
  && !target.username && !target.password && target.pathname === '/' && !target.search && !target.hash,
'The local development check accepts only a plain loopback HTTP address.');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium', headless: true });
try {
  const page = await browser.newPage(), external = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== target.origin && url.protocol !== 'data:') { external.push(url.origin); return route.abort(); }
    return route.continue();
  });
  await page.goto(target.href);
  const panel = page.getByRole('complementary', { name: 'Local development sign-in' });
  await panel.getByRole('option').first().waitFor({ state: 'attached' });
  assert.equal(await panel.getByRole('option').count(), 20);
  await panel.getByRole('button', { name: 'Test sign in', exact: true }).click();
  await panel.getByText('demo coins', { exact: false }).waitFor();
  const own = await page.evaluate(async () => {
    const { session } = await import('/src/online/session.js');
    const headers = { Authorization: `Bearer ${session.getToken()}` };
    const response = await fetch('/api/market/portfolio', { headers });
    const portfolio = await response.json();
    const config = await fetch('/api/config').then(reply => reply.json());
    return { status: response.status, positions: portfolio.positions?.length, config };
  });
  assert.equal(own.status, 200); assert.equal(own.positions, 1);
  assert.equal(own.config.demoMode, true); assert.equal(own.config.flags.market, true);
  assert.equal(own.config.flags.sports, false); assert.equal(own.config.flags.festival, false);
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
  console.log('G22 local browser: 20 dummy identities, sign-in, current own portfolio, local-only traffic and disabled sports/festival passed.');
} finally { await browser.close(); }
