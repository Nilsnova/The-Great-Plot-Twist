// Checks the pure measurements used by the browser accessibility audit.
import { describe, expect, it } from 'vitest';
import {
  parseColour, compositeColour, luminance, contrastRatio, withinViewport,
  hasHorizontalOverflow, touchTargetMeetsMinimum, minimumTextSize, duplicateNames,
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
