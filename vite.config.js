// Relative asset URLs let the static build live in a subfolder too.
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: { rolldownOptions: { input: {
    game: resolve(import.meta.dirname, 'index.html'),
    workshop: resolve(import.meta.dirname, 'asset-library.html'),
    studies: resolve(import.meta.dirname, 'scene-studies.html'),
  } } },
  test: { include: ['tests/**/*.test.js'] },
});
