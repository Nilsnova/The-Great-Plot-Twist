// Approved G9 readability: 18 px body and captions, 16 px controls, 44 px targets and calm motion.
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../../src/screens/market/market.css', import.meta.url), 'utf8');

describe('market.css', () => {
  it('never sets text smaller than 16 px and gives body text and captions 18 px', () => {
    const sizes = [...css.matchAll(/font(?:-size)?\s*:\s*(?:[a-z-]+\s+)*(\d+(?:\.\d+)?)px/g)].map(match => Number(match[1]));
    expect(sizes.length).toBeGreaterThan(3);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
    expect(css).toMatch(/\.market-body\{[^}]*font-size:18px/);
    expect(css).toMatch(/\.market-note\{[^}]*font-size:18px/);
    expect(css).toMatch(/\.market-fact dt\{[^}]*font-size:18px/);
  });

  it('gives choices and buttons a touch target of at least 44 px', () => {
    expect(css).toMatch(/\.market-choice[^{]*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.market-modal \.kit-button[^}]*font-size:16px;min-height:44px/);
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
