// Checks the pure measurements used by the browser accessibility audit.
import { describe, expect, it } from 'vitest';
import {
  parseColour, compositeColour, luminance, contrastRatio, withinViewport,
  hasHorizontalOverflow, touchTargetMeetsMinimum, minimumTextSize, duplicateNames,
  insideClosedDetails, renderedForAudit,
} from '../scripts/a11y-helpers.js';

describe('accessibility colour measurements', () => {
  it('reads computed comma and space/slash CSS colours', () => {
    expect(parseColour('rgb(12, 34, 56)')).toEqual({ r: 12, g: 34, b: 56, a: 1 });
    expect(parseColour('rgba(12, 34, 56, 0.5)')).toEqual({ r: 12, g: 34, b: 56, a: 0.5 });
    expect(parseColour('rgb(100% 0% 50% / 25%)')).toEqual({ r: 255, g: 0, b: 127.5, a: 0.25 });
    expect(parseColour('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseColour('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColour('#00000080').a).toBeCloseTo(128 / 255);
  });

  it('rejects unsupported or malformed colours instead of claiming a pass', () => {
    for (const css of [null, '', 'red', 'rgb(no 0 0)', 'rgb(0 0)', 'rgb(0, 0, 0 / .5)', 'rgb(999 0 0)']) {
      expect(parseColour(css)).toBeNull();
    }
    expect(() => contrastRatio(null, parseColour('#fff'))).toThrow(TypeError);
  });

  it('has the known black/white 21:1 and identical-colour 1:1 ratios', () => {
    const black = parseColour('#000');
    const white = parseColour('#fff');
    expect(luminance(black)).toBe(0);
    expect(luminance(white)).toBe(1);
    expect(contrastRatio(black, white)).toBe(21);
    expect(contrastRatio(white, black)).toBe(21);
    expect(contrastRatio(black, black)).toBe(1);
    expect(luminance(parseColour('rgb(128 128 128)'))).toBeCloseTo(0.21586, 5);
  });

  it('composites alpha before calculating contrast', () => {
    const grey = compositeColour(parseColour('rgb(0 0 0 / 50%)'), parseColour('#fff'));
    expect(grey).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
    expect(contrastRatio(parseColour('rgb(0 0 0 / 50%)'), parseColour('#fff'))).toBeCloseTo(3.97665, 4);
    expect(contrastRatio(parseColour('transparent'), parseColour('#fff'))).toBe(1);
    expect(contrastRatio(parseColour('#000'), parseColour('transparent'))).toBe(21);
    expect(compositeColour(parseColour('transparent'), parseColour('transparent')).a).toBe(0);
    expect(compositeColour(parseColour('rgb(255 0 0 / .5)'), parseColour('rgb(0 0 255 / .5)')))
      .toEqual({ r: 170, g: 0, b: 85, a: 0.75 });
  });
});

describe('native disclosure visibility in the accessibility audit', () => {
  function element(tagName, parentElement = null, properties = {}) {
    const el = { tagName: tagName.toUpperCase(), parentElement, children: [],
      open: false, hidden: false, inert: false, ariaHidden: false,
      getClientRects: () => [{ width: 80, height: 44 }],
      getBoundingClientRect: () => ({ width: 80, height: 44 }),
      contains(child) { for (let node = child; node; node = node.parentElement) if (node === this) return true; return false; },
      closest() { for (let node = this; node; node = node.parentElement) if (node.hidden || node.inert || node.ariaHidden) return node; return null; },
      ...properties };
    parentElement?.children.push(el);return el;
  }
  const rendered = el => renderedForAudit(el, () => ({ visibility: 'visible' }));

  it('excludes closed disclosure content even if the browser reports nonzero boxes', () => {
    const details = element('details'), summary = element('summary', details), icon = element('span', summary);
    const body = element('section', details), button = element('button', body);
    expect(rendered(details)).toBe(true);expect(rendered(summary)).toBe(true);expect(rendered(icon)).toBe(true);
    expect(rendered(body)).toBe(false);expect(rendered(button)).toBe(false);
    details.open = true;expect(rendered(button)).toBe(true);
  });

  it('checks every closed details ancestor, including an outer closed disclosure', () => {
    const outer = element('details'), outerSummary = element('summary', outer), body = element('section', outer);
    const inner = element('details', body, { open: true }), innerSummary = element('summary', inner), button = element('button', innerSummary);
    expect(insideClosedDetails(button)).toBe(true);outer.open = true;expect(insideClosedDetails(button)).toBe(false);
    inner.open = false;expect(rendered(innerSummary)).toBe(true);expect(rendered(button)).toBe(true);
    expect(rendered(outerSummary)).toBe(true);
  });

  it('allows only the first direct summary of each closed details', () => {
    const details = element('details'), body = element('section', details);
    const nested = element('summary', body), first = element('summary', details), second = element('summary', details);
    expect(rendered(first)).toBe(true);expect(rendered(second)).toBe(false);expect(rendered(nested)).toBe(false);
  });

  it('rejects zero-height, hidden, inert and collapsed content without reducing size floors', () => {
    expect(rendered(element('button', null, { getBoundingClientRect: () => ({ width: 80, height: 0 }) }))).toBe(false);
    expect(rendered(element('button', element('section', null, { inert: true })))).toBe(false);
    expect(rendered(element('button', element('section', null, { hidden: true })))).toBe(false);
    expect(rendered(element('button', element('section', null, { ariaHidden: true })))).toBe(false);
    expect(renderedForAudit(element('button'), () => ({ visibility: 'collapse' }))).toBe(false);
    expect(renderedForAudit(element('button'), () => ({ visibility: 'hidden' }))).toBe(false);
    expect(rendered(element('button'))).toBe(true);
  });
});

describe('accessibility geometry and text', () => {
  it('detects clipping on a 320px viewport with a one-pixel rounding allowance', () => {
    const viewport = { width: 320, height: 640 };
    expect(withinViewport({ left: 0, top: 0, right: 320, bottom: 640 }, viewport)).toBe(true);
    expect(withinViewport({ left: -1, top: 0, right: 321, bottom: 641 }, viewport)).toBe(true);
    expect(withinViewport({ left: 0, top: 0, right: 322, bottom: 40 }, viewport)).toBe(false);
    expect(withinViewport({ left: 0, top: -2, right: 100, bottom: 40 }, viewport)).toBe(false);
    expect(withinViewport({}, viewport)).toBe(false);
    expect(hasHorizontalOverflow({ scrollWidth: 321, clientWidth: 320 })).toBe(false);
    expect(hasHorizontalOverflow({ scrollWidth: 322, clientWidth: 320 })).toBe(true);
    expect(hasHorizontalOverflow({})).toBe(true);
  });

  it('requires both dimensions to meet the 44px touch minimum', () => {
    expect(touchTargetMeetsMinimum({ width: 44, height: 44 })).toBe(true);
    expect(touchTargetMeetsMinimum({ width: 43.9, height: 80 })).toBe(false);
    expect(touchTargetMeetsMinimum({ width: 80, height: 43.9 })).toBe(false);
    expect(touchTargetMeetsMinimum({})).toBe(false);
  });

  it('keeps the approved minimum sizes for each text context', () => {
    expect(['gameplay', 'case', 'story', 'metadata'].map(minimumTextSize)).toEqual([16, 18, 19, 16]);
    expect(() => minimumTextSize('unknown')).toThrow(RangeError);
  });

  it('reports each duplicate name once, ignoring empty names', () => {
    expect(duplicateNames([' Open  chart ', 'OPEN\nCHART', 'open chart', '', '  ', null, 'Close']))
      .toEqual(['open chart']);
    expect(duplicateNames(['Open', 'Close'])).toEqual([]);
  });
});
