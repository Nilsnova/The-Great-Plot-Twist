// Relative asset URLs let the static build live in a subfolder too.
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  server: {proxy:{'/api':'http://127.0.0.1:8000'}},
  preview: {proxy:{'/api':'http://127.0.0.1:8000'}},
  build: { manifest:true,rolldownOptions: { input: {
    game: resolve(import.meta.dirname, 'index.html'),
    workshop: resolve(import.meta.dirname, 'asset-library.html'),
    uiKit: resolve(import.meta.dirname, 'ui-kit.html'),
    caseLab: resolve(import.meta.dirname, 'case-lab.html'),
    host: resolve(import.meta.dirname, 'host.html'),
  } } },
  test: { include: ['tests/**/*.test.js'] },
});
