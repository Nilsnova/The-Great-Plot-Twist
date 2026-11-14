// T21: no v3 screen (title, intro, front door, How to play) asks for a painted or pixel picture. The
// title, every cutscene and the How to play sprites are cartoon art drawn in code (GAME-V3.md §7);
// the old pictures stay in public/ (nothing is deleted) and the build leaves them out of dist.
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {UNSHIPPED, unshipped} from '../scripts/unshipped-art.js';
import {scenes} from '../src/cutscenes/scenes.js';
import {ONE_ISLAND_PAGES, TUTORIAL_PAGES} from '../src/tutorial/pages.js';

const files = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : /\.(js|css|html|json)$/.test(name) ? [path] : [];
});
// The screens of the v3 flow before the island: the cold title, its cartoon scene, Play's front door,
// the lore and arrival cutscenes, How to play, and the drawings they share.
const V3_SCREENS = [
  'index.html', 'src/main.js', 'src/ui/shell.css', 'src/shell/controller.js', 'src/shell/screens.js', 'src/shell/routes.js',
  ...files('src/title'), ...files('src/front-door'), ...files('src/cutscenes'), ...files('src/tutorial'), ...files('src/art'),
];
// Justified exceptions: none of these is loaded by a v3 screen.
const ALLOWED = {
  // The generated registry of the old painted cutscene and title files (scripts/cutscene_art/generate.py);
  // tests/cutscene-art.test.js keeps it honest. Nothing imports it any more (checked below).
  'src/cutscenes/art.js': 'old generated registry, imported by nothing',
};
const RASTER = /(?:cutscenes|places|pixel)\/[\w.${}-]*\.(?:png|webp|jpe?g)|['"`](?:cutscenes|places|pixel)\/(?:\$\{|['"`])|\.(?:png|webp)['"`]/;

describe('v3 screens draw their pictures in code', () => {
  it('no title, intro, front door or How to play source names a /cutscenes, /places or /pixel picture', () => {
    const found = V3_SCREENS.filter(path => !ALLOWED[path] && RASTER.test(readFileSync(path, 'utf8')));
    expect(found).toEqual([]);
  });

  it('nothing imports the old cutscene picture registry', () => {
    const users = files('src').filter(path => /cutscenes\/art\.js['"]/.test(readFileSync(path, 'utf8')));
    expect(users).toEqual([]);
  });

  it('every cutscene shot is a code-drawn panel, never an image layer', () => {
    for (const [id, shots] of Object.entries(scenes)) for (const shot of shots) {
      expect(typeof shot.panel, id).toBe('string');
      expect(shot.layers, id).toBeUndefined();
    }
  });

  it('How to play only names cartoon drawings (never a pixel file)', () => {
    for (const page of [...TUTORIAL_PAGES, ...ONE_ISLAND_PAGES]) for (const sprite of page.art) {
      expect(sprite.name, page.id).toMatch(/^[a-z0-9-]+$/);
      expect(sprite.file, page.id).toBeUndefined();
    }
  });
});

describe('the pictures no screen shows', () => {
  it('stay in public/ (never deleted) and are named exactly', () => {
    for (const entry of UNSHIPPED) expect(existsSync(join('public', entry)), entry).toBe(true);
    expect(unshipped('cutscenes/lore-intro.webp')).toBe(true);
    expect(unshipped('cutscenes/manifest.json')).toBe(true);
    expect(unshipped('places/title.webp')).toBe(true);
    expect(unshipped('places/chart.png')).toBe(false); // the sea chart still ships: /api/config can bring travel back
    expect(unshipped('pixel/explorer.png')).toBe(false); // the pixel workshop (asset-library.html) still shows every sprite
  });

  it('are asked for by no source file at all', () => {
    const names = ['title.webp', 'title.png', 'title-sky', 'title-sea', 'lore-intro.webp', 'keepers-lock.webp', 'lamps-relight.webp', 'cutscenes/arrival'];
    const sources = [...files('src'), 'index.html', 'asset-library.html', 'ui-kit.html', 'host.html'].filter(path => existsSync(path) && !ALLOWED[path] && path !== 'src/pixel/catalog.js');
    const found = sources.flatMap(path => { const text = readFileSync(path, 'utf8'); return names.filter(name => text.includes(name)).map(name => `${path}: ${name}`); });
    expect(found).toEqual([]);
  });
});
