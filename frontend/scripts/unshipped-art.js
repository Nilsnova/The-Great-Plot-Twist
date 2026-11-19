// Pictures that stay in public/ but no screen shows any more (T21: the title, the intro and every
// cutscene are drawn in code, GAME-V3.md §7). The project never deletes files, so they keep their place
// in the repository; the build copies public/ itself and leaves these out of dist, so nobody downloads
// them. tests/v3-raster-free.test.js checks that no source file still asks for one.
import {copyFileSync, existsSync, mkdirSync, readdirSync, statSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';

// Paths relative to public/; a path ending in / leaves out the whole folder.
export const UNSHIPPED = Object.freeze([
  'cutscenes/', // the painted title planes (title-*.webp), four painted cutscene frames and their manifest
  'places/title.webp', // the painted title backdrop
  'places/title.png', // its fallback
  // Original world authoring sheets stay in the repository; runtime uses the proved compiled sources.
  'village/buildings-hero-v1.png', 'village/houses-v1.png', 'village/houses-v2.png', 'village/landmarks-v1.png',
  'village/services-v1.png', 'village/home-fixed-v2.png', 'village/nature-v1.png', 'village/cannons-v1.png',
  'village/walls-posts-v1.png', 'village/walls-surfaces-v1.png',
  'village/core-v1.png', 'village/home-heart-v2.png', 'village/progress-v1.png', 'village/mortars-v1.png',
  'village/harpoons-v1.png', 'village/culverins-v1.png', 'village/swivels-v1.png',
  // The proved 4x PNG masters (the pre-VIS64 wall sheet among them, kept for the transport proof) and the
  // authored terrain atlas: the game downloads their WebP from village/shipped/ (scripts/ship-village-art.mjs).
  'village/compiled/', 'village/terrain-materials-v1.png',
]);

/** True when a path under public/ ('places/title.webp') stays out of the build. */
export function unshipped(path) {
  const name = path.split('\\').join('/');
  return UNSHIPPED.some(entry => (entry.endsWith('/') ? name.startsWith(entry) : name === entry));
}

function copyPublic(from, to, root) {
  mkdirSync(to, {recursive: true});
  for (const entry of readdirSync(from)) {
    const source = join(from, entry), target = join(to, entry), path = relative(root, source);
    if (unshipped(statSync(source).isDirectory() ? `${path}/` : path)) continue;
    if (statSync(source).isDirectory()) copyPublic(source, target, root);
    else if (!existsSync(target)) copyFileSync(source, target); // what the bundle wrote wins, as with Vite's own copy
  }
}

// Vite's own public copy is switched off (build.copyPublicDir: false); this copies everything else.
export function publicCopyPlugin() {
  let config = null;
  return {
    name: 'plot-twist-public-copy', apply: 'build',
    configResolved(resolved) { config = resolved; },
    writeBundle() {
      const publicDir = config.publicDir;
      if (!publicDir || !existsSync(publicDir)) return;
      copyPublic(publicDir, resolve(config.root, config.build.outDir), publicDir);
    },
  };
}
