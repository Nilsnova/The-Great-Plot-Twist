// Refresh-aware audit identities must accept replacement but reject a changed keyboard route.
import {expect, it} from 'vitest';
import {snapshotFocusForAudit, focusStepForAudit} from '../scripts/a11y-helpers.js';

const style = () => ({visibility: 'visible', outlineStyle: 'solid', outlineWidth: '3px', outlineColor: '#fff', opacity: '1'});
function fixture(keys = [null, 'first', 'second']) {
  const root = {controls: [], ownerDocument: {activeElement: null},
    querySelectorAll(selector) { return selector === '[data-a11y-order]' ? this.controls.filter(el => el.dataset.a11yOrder !== undefined) : this.controls; },
    contains(element) { return this.controls.includes(element); }};
  const button = key => ({tagName: 'BUTTON', type: 'button', className: 'same-button', textContent: 'Same label',
    dataset: key === null ? {} : {key}, tabIndex: 0, parentElement: null,
    getAttribute() { return null; }, closest() { return null; },
    getClientRects() { return [{}]; }, getBoundingClientRect() { return {width: 50, height: 44}; },
    matches(selector) { return selector === ':focus' && root.ownerDocument.activeElement === this; }});
  root.controls = keys.map(button);
  const snapshot = snapshotFocusForAudit(root, style);
  return {root, snapshot, button, check(index = 1) {
    root.ownerDocument.activeElement = root.controls[index];
    return focusStepForAudit(root, snapshot, index, style);
  }};
}

it('accepts keyed replacement at the original native position without copying the audit marker', () => {
  const f = fixture(); f.root.controls[1] = f.button('first');
  expect(f.root.controls[1].dataset.a11yOrder).toBeUndefined();
  expect(f.check()).toMatchObject({domOrder: true, inside: true, visible: true, countMatches: true, identitiesMatch: true});
});

it.each(['reorder', 'substitute', 'insert', 'remove', 'duplicate', 'positive', 'unkeyed replacement', 'unkeyed promotion'])('rejects %s despite matching button classes and text', change => {
  const f = fixture();
  if (change === 'reorder') [f.root.controls[1], f.root.controls[2]] = [f.root.controls[2], f.root.controls[1]];
  if (change === 'substitute') f.root.controls[1] = f.button('other');
  if (change === 'insert') f.root.controls.push(f.button('extra'));
  if (change === 'remove') f.root.controls.pop();
  if (change === 'duplicate') f.root.controls[2] = f.button('first');
  if (change === 'positive') f.root.controls[2].tabIndex = 1;
  if (change === 'unkeyed replacement') f.root.controls[0] = f.button(null);
  if (change === 'unkeyed promotion') f.root.controls[0].dataset.key = 'new';
  expect(f.check().domOrder).toBe(false);
});

it('rejects duplicate baseline keys and a focus on the wrong native index', () => {
  const duplicate = fixture([null, 'same', 'same']);
  expect(duplicate.snapshot.duplicateKeys).toEqual(['same']);
  expect(duplicate.check().domOrder).toBe(false);
  const f = fixture(); f.root.ownerDocument.activeElement = f.root.controls[2];
  expect(focusStepForAudit(f.root, f.snapshot, 1, style).domOrder).toBe(false);
});

it('retains the original unkeyed marker and keeps containment and visible-focus checks independent', () => {
  const f = fixture([null, ' ', 'next']);
  expect(f.check(0).domOrder).toBe(true);
  f.root.ownerDocument.activeElement = f.button('outside');
  expect(focusStepForAudit(f.root, f.snapshot, 1, style)).toMatchObject({domOrder: false, inside: false});
  f.root.ownerDocument.activeElement = f.root.controls[1];
  expect(focusStepForAudit(f.root, f.snapshot, 1, () => ({...style(), outlineStyle: 'none'})))
    .toMatchObject({domOrder: true, inside: true, visible: false});
});

function lobbyFixture(refreshKey = 'focus') {
  const f = fixture([null, null, null, null, null]);
  for (const [index, action] of [[2, 'copy'], [3, 'start'], [4, 'done']]) f.root.controls[index].dataset.focus = action;
  f.root.controls[1].tagName = 'INPUT'; f.root.controls[1].type = 'text';
  f.root.controls[1].readOnly = true; f.root.controls[1].getAttribute = name => name === 'aria-label' ? 'Game link' : null;
  const snapshot = snapshotFocusForAudit(f.root, style, {refreshKey});
  return {...f, snapshot, replacement(action) { const button = f.button(null); button.dataset.focus = action; return button; },
    replacementField(label = 'Game link') {
      const input = f.button(null); input.tagName = 'INPUT'; input.type = 'text'; input.readOnly = true;
      input.getAttribute = name => name === 'aria-label' ? label : null; return input;
    },
    check(index = 3, styleOf = style) {
      f.root.ownerDocument.activeElement = f.root.controls[index];
      return focusStepForAudit(f.root, snapshot, index, styleOf);
    }};
}

it('accepts a whole refreshed lobby body at its original native positions without copying stamps', () => {
  const f = lobbyFixture();
  f.root.controls[1] = f.replacementField(); f.root.controls[2] = f.replacement('copy');
  f.root.controls[3] = f.replacement('start'); f.root.controls[4] = f.replacement('done');
  expect(f.snapshot.count).toBe(5);
  for (const control of f.root.controls.slice(1)) expect(control.dataset.a11yOrder).toBeUndefined();
  for (const index of [1, 2, 3, 4]) expect(f.check(index)).toMatchObject({domOrder: true, inside: true, visible: true,
    countMatches: true, identitiesMatch: true, duplicateKeys: [], positiveTabindex: false});
});

it.each(['reorder', 'substitute', 'duplicate', 'insert', 'remove', 'positive', 'tag', 'type', 'missing', 'field label', 'field readonly', 'field category spoof', 'unkeyed replacement', 'unkeyed promotion'])(
  'still rejects lobby %s when semantic refresh identity is enabled', change => {
    const f = lobbyFixture(); f.root.controls[3] = f.replacement('start'); f.root.controls[4] = f.replacement('done');
    if (change === 'reorder') [f.root.controls[3], f.root.controls[4]] = [f.root.controls[4], f.root.controls[3]];
    if (change === 'substitute') f.root.controls[3] = f.replacement('another-action');
    if (change === 'duplicate') f.root.controls[4] = f.replacement('start');
    if (change === 'insert') f.root.controls.push(f.replacement('extra'));
    if (change === 'remove') f.root.controls.pop();
    if (change === 'positive') f.root.controls[3].tabIndex = 1;
    if (change === 'tag') f.root.controls[3].tagName = 'INPUT';
    if (change === 'type') f.root.controls[3].type = 'submit';
    if (change === 'missing') delete f.root.controls[3].dataset.focus;
    if (change === 'field label') f.root.controls[1].getAttribute = name => name === 'aria-label' ? 'Other link' : null;
    if (change === 'field readonly') f.root.controls[1].readOnly = false;
    if (change === 'field category spoof') { f.root.controls[1].readOnly = false; f.root.controls[1].dataset.focus = 'readonly-input:Game link'; }
    if (change === 'unkeyed replacement') f.root.controls[0] = f.button(null);
    if (change === 'unkeyed promotion') f.root.controls[0].dataset.focus = 'new';
    expect(f.check().domOrder).toBe(false);
  });

it('keeps semantic lobby identity opt-in and rejects wrong position, invisible focus and duplicate baseline actions', () => {
  const strict = lobbyFixture('key'); strict.root.controls[3] = strict.replacement('start');
  expect(strict.check().domOrder).toBe(false);
  const strictField = lobbyFixture('key'); strictField.root.controls[1] = strictField.replacementField();
  expect(strictField.check().domOrder).toBe(false);
  const f = lobbyFixture(); f.root.ownerDocument.activeElement = f.root.controls[4];
  expect(focusStepForAudit(f.root, f.snapshot, 3, style).domOrder).toBe(false);
  expect(f.check(3, () => ({...style(), outlineStyle: 'none'})))
    .toMatchObject({domOrder: true, inside: true, visible: false});
  f.root.controls[4].dataset.focus = 'start';
  const duplicate = snapshotFocusForAudit(f.root, style, {refreshKey: 'focus'});
  expect(duplicate.duplicateKeys).toEqual(['focus:start']);
  expect(focusStepForAudit(f.root, duplicate, 3, style).domOrder).toBe(false);
  f.root.controls[4] = f.replacementField();
  expect(snapshotFocusForAudit(f.root, style, {refreshKey: 'focus'}).duplicateKeys).toEqual(['readonly-input:Game link']);
});

it('refuses arbitrary refresh identity fields such as changing display text', () => {
  const f = fixture();
  expect(() => snapshotFocusForAudit(f.root, style, {refreshKey: 'textContent'})).toThrow(RangeError);
});
