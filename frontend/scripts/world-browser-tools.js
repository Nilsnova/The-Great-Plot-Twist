// Shared local Chrome setup and settled frame measurements for the world smoke check.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
export async function openWorldBrowser({ preview = false } = {}) {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  let executablePath;
  for (const path of candidates) { try { await access(path); executablePath = path; break; } catch { /* Installed browsers only. */ } }
  if (!executablePath) throw new Error('Install Chrome or set CHROME_PATH.');
  const url = process.env.TEST_URL || 'http://127.0.0.1:5175';
  const server = process.env.TEST_URL ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(preview ? ['preview'] : []), '--host', '127.0.0.1', '--port', '5175', '--strictPort'], { stdio: 'pipe' });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) break; } catch { /* Wait for Vite. */ } await new Promise(resolve => setTimeout(resolve, 250)); }
    const browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => { if (!r.url().startsWith(url) && !r.url().startsWith('data:')) external.push(r.url()); });
    await mkdir('captures', { recursive: true });
    return { page, browser, errors, external, url, close: async () => { await browser.close(); server?.kill(); } };
  } catch (error) { server?.kill(); throw error; }
}
export async function settle(page) { await page.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); }); }
export async function measure(page, frames = 90) {
  return page.evaluate(async frames => {
    const g = window.__island, start = performance.now(); let calls = 0, triangles = 0;
    for (let i = 0; i < frames; i++) { await new Promise(requestAnimationFrame); calls = Math.max(calls, g.renderer.info.render.calls); triangles = Math.max(triangles, g.renderer.info.render.triangles); }
    return { fps: Math.round(frames * 1000 / (performance.now() - start)), calls, triangles,
      ...g.renderer.info.memory, roots: g.scene.children.filter(o => o.name.startsWith('place:')).length,
      objects: g.world.current.group.children.length, programs: g.renderer.info.programs.length };
  }, frames);
}

// Compare the real native framebuffer with/without the explorer at a clear stand point.
export async function explorerVisible(page) {
  return page.evaluate(() => {
    const g = window.__island, sprite = g.scene.children.find(o => o.userData.asset === 'explorer');
    const gl = g.renderer.getContext(), point = sprite.position.clone().project(g.camera);
    const width = Math.round(24 * g.camera.zoom), height = Math.round(32 * g.camera.zoom);
    const x = Math.round((point.x + 1) / 2 * gl.drawingBufferWidth - width / 2);
    const y = Math.round((point.y + 1) / 2 * gl.drawingBufferHeight - 3 * g.camera.zoom);
    const before = new Uint8Array(width * height * 4), after = new Uint8Array(before.length);
    g.renderer.render(g.scene, g.camera); gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, before);
    sprite.visible = false; g.renderer.render(g.scene, g.camera); gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, after);
    sprite.visible = true; g.renderer.render(g.scene, g.camera);
    return before.filter((value, i) => i % 4 !== 3 && value !== after[i]).length > 100;
  });
}
