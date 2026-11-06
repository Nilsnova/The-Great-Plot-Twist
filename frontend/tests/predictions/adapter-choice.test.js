// Which adapter the desk uses, and the guard that keeps the practice desk out of the production build.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDeskAdapter } from '../../src/screens/predictions/adapter.js';

describe('choosing the adapter', () => {
  it('uses the practice desk in development with ?desk=local', async () => {
    const adapter = await createDeskAdapter({ search: '?desk=local' });
    expect(adapter.label).toBe('Practice desk: not real coins');
  });

  it('uses the real server when the address has no desk setting', async () => {
    const adapter = await createDeskAdapter({ search: '' });
    expect(adapter.label).toBeNull();
  });

  it('uses the real server for any other value', async () => {
    expect((await createDeskAdapter({ search: '?desk=remote' })).label).toBeNull();
    expect((await createDeskAdapter({ search: '?desk=LOCAL' })).label).toBeNull();
  });

  it('keeps the practice desk behind the development guard, so the build can drop it', () => {
    const source = readFileSync(new URL('../../src/screens/predictions/adapter.js', import.meta.url), 'utf8');
    const guarded = /if\s*\(\s*import\.meta\.env\.DEV\s*&&[^)]*\)\s*\{[^}]*import\(\s*['"]\.\/adapter-fake\.js['"]\s*\)/;
    expect(source).toMatch(guarded);
    expect(source).not.toMatch(/^import[^\n]*adapter-fake/m);
    expect(source.match(/import\(\s*['"]\.\/adapter-fake\.js['"]\s*\)/g)).toHaveLength(1);
  });
});
