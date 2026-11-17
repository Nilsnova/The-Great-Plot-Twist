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
