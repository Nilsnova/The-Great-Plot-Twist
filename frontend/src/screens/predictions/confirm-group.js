// The "are you sure?" step shared by the stake form and the presenter buttons: a sentence that says what
// will happen, then Confirm and Back. DOM only. The sentence is focusable, so the keyboard focus can go
// there first (a screen reader reads it) and Tab then reaches Confirm and Back.
//
// Used by: stake-form.js and presenter-view.js.

import { button, node, setBusy, uniqueId } from './dom-helpers.js';

export function confirmGroup({ text, busy, onConfirm, onBack }) {
  const group = node('div', 'desk-confirm');
  group.setAttribute('role', 'group');
  const sentence = node('p', 'desk-confirm-text', text);
  sentence.id = uniqueId('desk-confirm');
  sentence.tabIndex = -1;
  sentence.dataset.focus = 'confirm-text';
  group.setAttribute('aria-labelledby', sentence.id);

  const actions = node('div', 'desk-actions');
  const confirmButton = button('Confirm', onConfirm, { focus: 'confirm' });
  setBusy(confirmButton, busy);
  actions.append(confirmButton, button('Back', onBack, { quiet: true, focus: 'back', disabled: busy }));
  group.append(sentence, actions);
  return group;
}
