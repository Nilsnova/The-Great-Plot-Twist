// Relative asset URLs let the static build live in a subfolder too.
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: { rolldownOptions: { input: {
    game: resolve(import.meta.dirname, 'index.html'),
    workshop: resolve(import.meta.dirname, 'asset-library.html'),
    uiKit: resolve(import.meta.dirname, 'ui-kit.html'),
  } } },
  test: { include: ['tests/**/*.test.js'] },
});
