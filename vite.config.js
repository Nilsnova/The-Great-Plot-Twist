// Relative asset URLs let the static build live in a subfolder too.
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  test: { include: ['tests/**/*.test.js'] },
});
