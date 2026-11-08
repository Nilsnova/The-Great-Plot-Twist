// Checks the pure measurements used by the browser accessibility audit.
import { describe, expect, it } from 'vitest';
import {
  parseColour, compositeColour, luminance, contrastRatio, withinViewport,
  hasHorizontalOverflow, touchTargetMeetsMinimum, minimumTextSize, duplicateNames,
  insideClosedDetails, renderedForAudit, focusCandidatesForAudit, tabbableForAudit, touchRectForAudit, visibleFocusForAudit,
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

describe('native focus and associated-label measurements', () => {
  const style = element => ({visibility: 'visible', pointerEvents: 'auto', ...element.style});
  function control(properties = {}) {
    const element = {tagName: 'INPUT', type: 'radio', name: '', form: null, tabIndex: 0,
      checked: false, disabled: false, labels: [], parentElement: null, style: {},
      getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; },
      getBoundingClientRect: () => ({width: 22, height: 22}),
      getRootNode() { return this.tree; },
      closest() { return this.hidden || this.inert ? this : null; },
      matches(selector) { return selector === ':disabled' && (this.disabled || this.disabledFieldset); },
      ...properties};
    return element;
  }
  function tree(...elements) {
    const root = {querySelectorAll: () => elements};
    for (const element of elements) element.tree = root;
    return root;
  }
  function label(input, properties = {}) {
    const element = control({tagName: 'LABEL', type: undefined, control: input,
      getBoundingClientRect: () => ({width: 180, height: 44}), ...properties});
    input.labels.push(element); return element;
  }

  it('uses checked or first enabled named radios and keeps unnamed radios separate', () => {
    const first = control({name: 'side'}), chosen = control({name: 'side', checked: true});
    const disabled = control({name: 'stake', checked: true, disabled: true});
    const next = control({name: 'stake'}), later = control({name: 'stake'}), a = control(), b = control();
    const root = tree(first, chosen, disabled, next, later, a, b);
    expect(tabbableForAudit(root, style)).toEqual([chosen, next, a, b]);
    chosen.checked = false; expect(tabbableForAudit(root, style)).toEqual([first, next, a, b]);
    expect(focusCandidatesForAudit(root, style)).toEqual([first, chosen, next, later, a, b]);
  });

  it('groups by actual form owner and tree, including a checked group member outside an audited subsection', () => {
    const form = {}, otherForm = {};
    const inside = control({name: 'shared', form}), outside = control({name: 'shared', form, checked: true});
    const other = control({name: 'shared', form: otherForm}), unowned = control({name: 'shared'});
    const root = tree(inside, outside, other, unowned), subsection = {querySelectorAll: () => [inside, other, unowned]};
    expect(tabbableForAudit(root, style)).toEqual([outside, other, unowned]);
    expect(tabbableForAudit(subsection, style)).toEqual([other, unowned]);
    const separate = control({name: 'shared', form});
    expect(tabbableForAudit(tree(separate), style)).toEqual([separate]);
  });

  it('keeps positive tabindex violations before collapse and excludes disabled, negative, hidden and inert stops', () => {
    const positiveRadio = control({name: 'side', tabIndex: 2}), checked = control({name: 'side', checked: true});
    const positive = control({tagName: 'DIV', type: undefined, tabIndex: 3});
    const negative = control({tagName: 'BUTTON', tabIndex: -1}), disabled = control({disabledFieldset: true});
    const hidden = control({hidden: true}), inert = control({inert: true}), invisible = control({style: {visibility: 'hidden'}});
    const root = tree(positiveRadio, checked, positive, negative, disabled, hidden, inert, invisible);
    const candidates = focusCandidatesForAudit(root, style);
    expect(candidates).toEqual([positiveRadio, checked, positive]);
    expect(candidates.filter(element => element.tabIndex > 0)).toEqual([positiveRadio, positive]);
    expect(tabbableForAudit(root, style)).toEqual([checked, positive]);
  });

  it.each(['radio', 'checkbox'])('measures a genuine active associated %s label as a native target', type => {
    const input = control({type}), associated = label(input), original = input.getBoundingClientRect();
    expect(touchTargetMeetsMinimum(original)).toBe(false);
    expect(touchRectForAudit(input, style)).toEqual(associated.getBoundingClientRect());
    expect(touchTargetMeetsMinimum(touchRectForAudit(input, style))).toBe(true);
    expect(input.checked).toBe(false);
  });

  it('does not count decorative, wrong-control, hidden, inert or pointer-disabled labels', () => {
    const input = control(); label(input, {control: control()}); label(input, {hidden: true});
    label(input, {inert: true}); label(input, {style: {pointerEvents: 'none'}});
    label(input, {style: {visibility: 'hidden'}});
    expect(touchRectForAudit(input, style)).toEqual(input.getBoundingClientRect());
    const disabled = control({disabledFieldset: true}); label(disabled);
    expect(touchTargetMeetsMinimum(touchRectForAudit(disabled, style))).toBe(false);
    const button = control({tagName: 'BUTTON', type: 'button'}); label(button);
    expect(touchRectForAudit(button, style)).toEqual(button.getBoundingClientRect());
  });

  it('keeps the 44px floor and never unions separate insufficient label rectangles', () => {
    const small = control(); label(small, {getBoundingClientRect: () => ({width: 200, height: 43.9})});
    expect(touchTargetMeetsMinimum(touchRectForAudit(small, style))).toBe(false);
    const split = control(); label(split, {getBoundingClientRect: () => ({width: 20, height: 80})});
    label(split, {getBoundingClientRect: () => ({width: 80, height: 20})});
    expect(touchTargetMeetsMinimum(touchRectForAudit(split, style))).toBe(false);
    label(split, {getBoundingClientRect: () => ({width: 44, height: 44})});
    expect(touchRectForAudit(split, style)).toEqual({width: 44, height: 44});
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

describe('visible native focus indicators', () => {
  const style = element => ({visibility: 'visible', opacity: '1', outlineStyle: 'none',
    outlineWidth: '0px', outlineColor: 'rgb(0, 0, 0)', ...element.style});
  const ring = {outlineStyle: 'solid', outlineWidth: '3px', outlineColor: 'rgb(243, 213, 140)'};
  function element(properties = {}) {
    return {tagName: 'INPUT', type: 'radio', focused: true, labels: [], style: {}, parentElement: null,
      getClientRects() { return this.hidden ? [] : [{}]; },
      getBoundingClientRect: () => ({width: 44, height: 44}),
      closest() { return this.hidden || this.inert ? this : null; },
      matches(selector) { return selector === ':focus' && this.focused; }, ...properties};
  }
  function associated(input, properties = {}) {
    const label = element({tagName: 'LABEL', type: undefined, control: input, style: {...ring}, ...properties});
    input.labels.push(label); return label;
  }

  it('accepts an actual own ring and requires current focus, nonzero width, nontransparent color and opacity', () => {
    const button = element({tagName: 'BUTTON', type: 'button', style: {...ring}});
    expect(visibleFocusForAudit(button, style)).toBe(true);
    button.focused = false; expect(visibleFocusForAudit(button, style)).toBe(false); button.focused = true;
    for (const bad of [{outlineStyle: 'none'}, {outlineStyle: 'hidden'}, {outlineWidth: '0px'},
      {outlineColor: 'transparent'}, {outlineColor: 'rgba(1, 2, 3, 0)'}, {opacity: '0'}]) {
      button.style = {...ring, ...bad}; expect(visibleFocusForAudit(button, style)).toBe(false);
    }
    button.style = {...ring}; button.parentElement = element({style: {opacity: '0'}});
    expect(visibleFocusForAudit(button, style)).toBe(false);
    button.parentElement.style.opacity = '.5'; expect(visibleFocusForAudit(button, style)).toBe(true);
  });

  it.each(['radio', 'checkbox'])('accepts a visible genuine %s label ring over an opacity-zero input', type => {
    const input = element({type, style: {opacity: '0', ...ring}});
    expect(visibleFocusForAudit(input, style)).toBe(false);
    const label = associated(input); expect(visibleFocusForAudit(input, style)).toBe(true);
    label.style.outlineColor = 'transparent'; expect(visibleFocusForAudit(input, style)).toBe(false);
    label.style = {...ring, opacity: '0'}; expect(visibleFocusForAudit(input, style)).toBe(false);
    label.style = {...ring}; label.parentElement = element({style: {opacity: '0'}});
    expect(visibleFocusForAudit(input, style)).toBe(false);
  });

  it('rejects invisible, wrong-control and decorative rings and does not substitute labels for other input types', () => {
    const input = element({style: {opacity: '0'}});
    input.parentElement = element({tagName: 'DIV', style: {...ring}});
    expect(visibleFocusForAudit(input, style)).toBe(false);
    associated(input, {control: element()}); associated(input, {hidden: true}); associated(input, {inert: true});
    associated(input, {style: {...ring, visibility: 'hidden'}});
    expect(visibleFocusForAudit(input, style)).toBe(false);
    const text = element({type: 'text', style: {opacity: '0'}}); associated(text);
    expect(visibleFocusForAudit(text, style)).toBe(false);
  });
});
