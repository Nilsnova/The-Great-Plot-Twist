// The scratch-login Vite entry refuses production/preview; normal builds never select it.
import { afterEach, expect, it, vi } from 'vitest';
import configure from '../../scripts/dev/vite.config.mjs';
afterEach(() => vi.unstubAllEnvs());
it('refuses build and preview before it can inject a fake sign-in panel', () => {
  expect(() => configure({ command: 'build' })).toThrow('serve-only');
  expect(() => configure({ command: 'serve', isPreview: true })).toThrow('serve-only');
});
it('requires an explicit loopback API port and disables env-file discovery', () => {
  vi.stubEnv('G22_API_PORT', '');
  expect(() => configure({ command: 'serve' })).toThrow('explicit local API port');
  vi.stubEnv('G22_API_PORT', '43219');
  const config = configure({ command: 'serve' });
  expect(config.server.host).toBe('127.0.0.1'); expect(config.envDir).toBe(false);
  expect(config.server.proxy['/api']).toBe('http://127.0.0.1:43219');
  expect(config.plugins[0].apply).toBe('serve');
});
