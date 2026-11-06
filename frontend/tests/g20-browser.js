// Isolated real-DOM harness for G20 component unit tests, not a game/end-to-end fixture.
import { beforeAll, afterAll } from 'vitest';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

export function browserHarness() {
  let server, browser, base;
  beforeAll(async () => {
    server = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)),
      server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    await server.listen(); base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true });
  }, 30000);
  afterAll(async () => { await browser?.close(); await server?.close(); });
  const evaluate = async (action, argument, modules = {}, usePage = false) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== base || url.pathname.startsWith('/api/')) return route.abort();
        if (modules[url.pathname]) return route.fulfill({ contentType: 'text/javascript', body: modules[url.pathname] });
        if (url.pathname === '/g20-harness') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
        return route.continue();
      });
      await page.goto(base + '/g20-harness');
      // Define import inside Chromium: Vitest transforms imports in Node callbacks for SSR.
      await page.addScriptTag({ type: 'module', content: 'window.g20Import = path => import(path);' });
      await page.waitForFunction(() => typeof window.g20Import === 'function');
      return usePage ? await action(page, base) : await page.evaluate(action, argument);
    } finally { await context.close(); }
  };
  evaluate.withPage = action => evaluate(action, undefined, {}, true);
  return evaluate;
}
