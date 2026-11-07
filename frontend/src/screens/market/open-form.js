// The open-position form inside a company card: side, stake, the 10x note, the zero point and the confirm button.
// It shows what openPreview() says and sends one intent through onSubmit. It works out nothing itself.
// Side and stake are native radio groups in a fieldset, so the keyboard and screen readers work as usual.
// Used by: board-view.js.
import { node, uniqueId } from '../../ui/kit/dom.js';
import { createButton } from '../../ui/kit/button.js';
import { coinsText } from './format.js';
import { setText } from './parts.js';
import { openPreview } from './view-models.js';

const SIDES = [
  { value: 'rising', label: 'Rising: you gain when the price goes up' },
  { value: 'falling', label: 'Falling: you gain when the price goes down' },
];

function radioGroup(legend, name, onChange) {
  const element = node('fieldset', 'market-choices');
  element.append(node('legend', '', legend));
  let chosen = null, signature = '';
  return {
    element,
    get value() { return chosen; },
    setOptions(options) {
      if (JSON.stringify(options) === signature) return;
      signature = JSON.stringify(options);
      element.querySelectorAll('label').forEach(label => label.remove());
      for (const option of options) {
        const input = node('input'), label = node('label', 'market-choice');
        input.type = 'radio'; input.name = name; input.value = String(option.value); input.checked = option.value === chosen;
        input.addEventListener('change', () => { chosen = option.value; onChange(); });
        label.append(input, node('span', '', option.label));
        element.append(label);
      }
    },
    clear() { chosen = null; element.querySelectorAll('input').forEach(input => { input.checked = false; }); },
    focus() { element.querySelector('input')?.focus(); },
  };
}

export function createOpenForm({ onSubmit, onCancel }) {
  const id = uniqueId('market-form');
  const element = node('div', 'market-form');
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', 'Open a position');
  let row = null, rules = null, busy = false, disabled = false, generation = 0;
  const side = radioGroup('Which way will the price go?', `${id}-side`, refresh);
  const stake = radioGroup('Stake', `${id}-stake`, refresh);
  const note = node('p', 'market-note'), zero = node('p', 'market-preview'), loss = node('p', 'market-preview');
  const confirm = createButton({ label: 'Choose a side and a stake', onClick: submit });
  const cancel = createButton({ label: 'Cancel', variant: 'quiet', onClick: () => onCancel?.() });
  const actions = node('div', 'market-form-actions');
  actions.append(confirm.element, cancel.element);
  side.setOptions(SIDES);
  element.append(side.element, stake.element, note, zero, loss, actions);

  function refresh() {
    const preview = openPreview(row, side.value, stake.value, rules);
    setText(note, preview.noteText);
    for (const [paragraph, text] of [[zero, preview.zeroText], [loss, preview.lossText]]) {
      setText(paragraph, text);
      paragraph.hidden = !text;
    }
    confirm.update({ label: preview.confirmLabel, disabled: disabled || busy || !preview.ready });
    return preview;
  }

  async function submit() {
    const preview = refresh();
    if (!preview.ready || busy || disabled) return;
    const scope = generation;
    busy = true;
    refresh();
    try { await onSubmit({ companyId: row.id, side: preview.side, stake: preview.stake }); }
    finally { if (scope === generation) { busy = false; refresh(); } }
  }

  return {
    element,
    update(nextRow, nextRules, options = {}) {
      row = nextRow; rules = nextRules; disabled = Boolean(options.disabled);
      const choices = rules?.stakeChoices ?? [];
      stake.setOptions(choices.map(choice => ({ value: choice.stake, label: `${coinsText(choice.stake)} coins + ${coinsText(choice.fee)} fee` })));
      refresh();
    },
    reset() { generation += 1; busy = false; side.clear(); stake.clear(); refresh(); },
    focus() { side.focus(); },
  };
}
