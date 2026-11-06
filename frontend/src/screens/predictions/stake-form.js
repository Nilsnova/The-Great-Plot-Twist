// The stake form of one question card: the side (a fieldset with two radio buttons), the amount, the
// Stake button, and after Stake the confirm step. DOM only.
//
// `form` is the card's own state { side, amount, step, busy }. This file reads it to draw the form and
// updates side and amount as the player types; the steps themselves are driven by `actions`:
//   { submit(), confirm(), back() }
//
// Used by: questions-view.js.

import { confirmGroup } from './confirm-group.js';
import { button, node, uniqueId } from './dom-helpers.js';
import { stakeConfirmText } from './view-model.js';

const SIDES = [['yes', 'Yes'], ['no', 'No']];

function sideChoices(id, form, locked, legend) {
  const fieldset = node('fieldset', 'desk-fieldset');
  fieldset.disabled = locked;
  fieldset.append(node('legend', '', legend));
  for (const [value, label] of SIDES) {
    const radio = node('input');
    Object.assign(radio, { type: 'radio', name: `side-${id}`, value, checked: form.side === value });
    radio.dataset.focus = `side-${value}`;
    radio.addEventListener('change', () => { form.side = value; });
    const choice = node('label', 'desk-choice');
    choice.append(radio, node('span', '', label));
    fieldset.append(choice);
  }
  return fieldset;
}

function amountField(form, locked, model) {
  const amountId = uniqueId('desk-amount');
  const hintId = uniqueId('desk-hint');
  const label = node('label', 'desk-label', model.amountLabel);
  label.htmlFor = amountId;
  const input = node('input', 'desk-amount');
  Object.assign(input, {
    id: amountId, type: 'number', inputMode: 'numeric', step: '1', value: form.amount, disabled: locked,
    min: String(model.min), max: String(model.max),
  });
  input.dataset.focus = 'amount';
  input.setAttribute('aria-describedby', hintId);
  input.addEventListener('input', () => { form.amount = input.value; });
  const hint = node('p', 'desk-hint', model.hint);
  hint.id = hintId;
  return [label, input, hint];
}

export function buildStakeForm({ id, model, form, actions }) {
  const block = node('form', 'desk-form');
  block.noValidate = true;
  const locked = form.step === 'confirm' || form.busy;
  block.append(sideChoices(id, form, locked, model.legend), ...amountField(form, locked, model));
  if (form.step === 'confirm') {
    const text = stakeConfirmText({ side: form.side, amount: Number(form.amount) });
    block.append(confirmGroup({ text, busy: form.busy, onConfirm: actions.confirm, onBack: actions.back }));
  } else {
    block.append(button('Stake', () => {}, { focus: 'stake', type: 'submit' }));
  }
  block.addEventListener('submit', event => {
    event.preventDefault();
    actions.submit();
  });
  return block;
}
