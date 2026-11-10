// Build the standalone help using the real app config; reject unsafe markup and leaked reveals.
import {beforeAll, afterAll, describe, it, expect} from 'vitest';
import {build} from 'vite';
import {readFile, mkdtemp, rm, readlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {containsFingerprint} from '../scripts/spoiler-guard.js';

let output, html, assets;
beforeAll(async () => {
  output = await mkdtemp(join(tmpdir(), 'g23-help-'));
  await build({logLevel: 'silent', build: {outDir: output, emptyOutDir: true}});
  html = await readFile(join(output, 'help.html'), 'utf8');
  assets = await Promise.all(['help.js', 'help.css', 'kit.css'].map(name =>
    readFile(join(output, 'help', name), 'utf8')));
}, 30000);
afterAll(async () => { if (output) await rm(output, {recursive: true, force: true}); });

describe('standalone player help', () => {
  it('ships through the unchanged production build and shares the pixel kit', async () => {
    expect(html).toBe(await readFile('help.html', 'utf8'));
    expect(await readlink('public/help.html')).toBe('../help.html');
    expect(assets[2]).toBe(await readFile('src/ui/kit/kit.css', 'utf8'));
    expect(html).toContain('class="kit-panel');
    expect(html).toContain('./help/help.js');
    expect(html).toContain('./help/help.css');
    expect(assets[0]).toContain('addEventListener');
  });

  it('enforces a restrictive CSP without inline code, styles, forms or remote assets', () => {
    const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    for (const rule of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
      "connect-src 'none'", "base-uri 'none'", "form-action 'none'", "object-src 'none'"]) {
      expect(policy).toContain(rule);
    }
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|https:|data:|\*/);
    expect(html).not.toMatch(/<style\b|\sstyle\s*=|\son[a-z]+\s*=|javascript:/i);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    expect(scripts).toHaveLength(1);
    expect(scripts[0][1]).toMatch(/src="\.\/help\/help\.js"/);
    expect(scripts[0][2].trim()).toBe('');
    expect(html).not.toMatch(/src="https?:/i);
    expect(assets[1]).not.toMatch(/@import|url\(/i);
  });

  it('keeps every topic and working contents anchor available without JavaScript', () => {
    const topics = ['start', 'islet', 'exchange', 'predictions', 'duels',
      'weather', 'controls', 'accessibility', 'report', 'privacy'];
    for (const id of topics) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`href="#${id}"`);
    }
    expect(html).toContain('10×');
    expect(html).toContain('zero');
    expect(html).toContain('Play money only');
    expect(html).toContain('not connected');
    expect(html).toContain('Your positions');
    for (const removed of ['id="crews"', 'id="case"', 'Relighting', 'Live crews', 'Lighthouse prologue', 'culprit', 'accusation'])
      expect(html).not.toContain(removed);
    expect(html).toContain('source freshness');
    expect(html).not.toContain('optional spoiler-safe hint assistant');
    expect(html).not.toContain('older market service');
  });

  it('contains neither protected reveal fingerprint in help assets or the manual', async () => {
    const {fingerprints} = JSON.parse(await readFile('tests/fixtures/reveal-fingerprints.json', 'utf8'));
    const manual = await readFile('../docs/HOW-TO-PLAY.md', 'utf8');
    for (const text of [html, ...assets, manual]) {
      for (const fingerprint of fingerprints) expect(containsFingerprint(text, fingerprint)).toBe(false);
    }
  });

  it('ships no images since the crew rehearsal pictures left with the mystery', () => {
    expect([...html.matchAll(/<img\b[^>]+>/g)]).toHaveLength(0);
  });

  it('ships the current privacy notice without obsolete provider or deletion claims', async () => {
    const privacy = await readFile(join(output, 'privacy.html'), 'utf8');
    const canonical = await readFile('../docs/PRIVACY.md', 'utf8');
    expect(privacy).toBe(await readFile('privacy.html', 'utf8'));
    for (const notice of [canonical, privacy]) {
      expect(notice).toContain('sessionStorage');
      expect(notice).toContain('Reloading can restore sign-in');
      expect(notice).not.toContain('Login tokens stay in memory, not application cookies or persistent storage');
      expect(notice).not.toContain('ordinary browser game is still waiting');
    }
    for (const words of ['all of your ledger history', 'lowest occupied seat', 'security audit',
      'Finnhub', 'Manifold', 'BALLDONTLIE']) expect(privacy).toContain(words);
    expect(privacy).not.toMatch(/AI companion|companion_llm|OpenAI|Anthropic/);
    expect(privacy).not.toMatch(/Finnhub[^<]*not integrated|Manifold[^<]*not implemented/);
    expect(privacy).toContain("connect-src 'none'");
    expect(privacy).not.toMatch(/<style\b|\sstyle\s*=|\son[a-z]+\s*=|javascript:/i);
  });
});
