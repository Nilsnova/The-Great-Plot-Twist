// Readability rules of the panel's stylesheet (spec 9.5): text of at least 14 px, touch targets of 44 px, calm motion.
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../../src/screens/market/market.css', import.meta.url), 'utf8');

describe('market.css', () => {
  it('never sets text smaller than 14 px', () => {
    const sizes = [...css.matchAll(/font(?:-size)?\s*:\s*(?:[a-z-]+\s+)*(\d+(?:\.\d+)?)px/g)].map(match => Number(match[1]));
    expect(sizes.length).toBeGreaterThan(3);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
  });

  it('gives choices and buttons a touch target of at least 44 px', () => {
    expect(css).toMatch(/\.market-choice[^{]*\{[^}]*min-height:\s*44px/);
  });

  it('turns every animation and transition off for reduced motion, by setting and by system preference', () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/data-reduced-motion=["']?true["']?/);
  });

  it('adapts to a 375 px phone without horizontal scrolling', () => {
    expect(css).toMatch(/max-width:\s*(?:4\d\d|5\d\d|6\d\d)px/);
    expect(css).toMatch(/overflow-wrap:\s*anywhere/);
    expect(css).not.toMatch(/overflow-x:\s*scroll/);
  });

  it('writes no em or en dashes', () => {
    expect(css).not.toMatch(/[\u2013\u2014]/);
  });
});
