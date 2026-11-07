// The team boundary of the Exchange panel: only http.js fetches, only index.js picks an adapter,
// every file has a header and stays short, and the text follows the writing rules.
import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';

const SRC = new URL('../../src/screens/market/', import.meta.url);
const TESTS = new URL('./', import.meta.url);
const read = async (dir, name) => readFile(new URL(name, dir), 'utf8');
const names = async (dir, pattern) => (await readdir(dir)).filter(name => pattern.test(name));
const sources = async () => Promise.all((await names(SRC, /\.js$/)).map(async name => [name, await read(SRC, name)]));

describe('the panel boundary', () => {
  it('has the files the spec lists', async () => {
    const present = await names(SRC, /./);
    for (const file of ['index.js', 'panel.js', 'board-view.js', 'open-form.js', 'positions-view.js', 'view-models.js', 'words.js', 'format.js', 'http.js', 'fake.js', 'fixtures.js', 'market.css', 'README.md']) {
      expect(present, file).toContain(file);
    }
  });

  it('lets only http.js call fetch', async () => {
    for (const [name, source] of await sources()) {
      if (name === 'http.js') expect(source).toMatch(/\bfetch\b/);
      else expect(source, name).not.toMatch(/\bfetch\s*\(|globalThis\.fetch|window\.fetch/);
    }
  });

  it('lets only index.js import the HTTP adapter or the fake', async () => {
    for (const [name, source] of await sources()) {
      if (name === 'index.js') continue;
      expect(source, name).not.toMatch(/['"]\.\/(http|fake)\.js['"]/);
    }
  });

  it('does not reach into the case adapter, its fake, or any transport', async () => {
    for (const [name, source] of await sources()) {
      expect(source, name).not.toMatch(/from\s+['"][^'"]*(?:adapter\/|\/net\/|online\/)/);
      expect(source, name).not.toMatch(/\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b/);
    }
  });

  it('keeps pure modules free of the DOM and of the game', async () => {
    for (const name of ['format.js', 'words.js', 'result-words.js', 'view-models.js', 'session.js', 'trades.js', 'poller.js', 'uid.js']) {
      const source = await read(SRC, name);
      expect(source, name).not.toMatch(/\bdocument\.|\bwindow\.|from\s+['"][^'"]*(?:kit\/dom|world\/|core\/|three)/);
    }
  });

  it('begins every source file with a header comment and keeps each under 150 lines', async () => {
    for (const [name, source] of await sources()) {
      expect(source.startsWith('//'), `${name} header`).toBe(true);
      expect(source.split('\n').length, `${name} length`).toBeLessThanOrEqual(150);
    }
  });

  it('writes no em or en dashes anywhere, as the engineering rules ask', async () => {
    const files = [
      ...(await names(SRC, /./)).map(name => [SRC, name]),
      ...(await names(TESTS, /./)).map(name => [TESTS, name]),
    ];
    for (const [dir, name] of files) expect(await read(dir, name), name).not.toMatch(/[\u2013\u2014]/);
  });

  it('keeps the screen from deciding rules: no fee, leverage or zero point arithmetic in the views', async () => {
    for (const name of ['panel.js', 'board-view.js', 'open-form.js', 'positions-view.js']) {
      const source = await read(SRC, name);
      expect(source, name).not.toMatch(/\*\s*(?:0\.9|1\.1|leverage|10)\b|Math\.(?:ceil|floor)\(/);
    }
  });

  it('keeps credits out of gameplay and the simulation note in both panes', async () => {
    const board = await read(SRC, 'board-view.js'), positions = await read(SRC, 'positions-view.js');
    expect(board).not.toMatch(/creditRows|market-credits/);
    expect(positions).not.toMatch(/creditRows|market-credits/);
    expect(board).toContain('market-simulation');
    expect(positions).toContain('boardNotes(board).simulation');
    expect(positions).toContain('element.append(simulation,');
  });
});
