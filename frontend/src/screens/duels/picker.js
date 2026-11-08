// The sealed signal picker: one group per round with three native radio buttons styled as large
// buttons (glyph, name and oil cost), the oil that is left, and a Clear button. A signal the oil
// cannot pay for is disabled and says why in text, and a round can always take Shade, so no
// choice is a dead end. Arrow keys choose inside a round and Tab moves between rounds.
// The rules are in logic.js. The picker holds no secret: it only gathers one player's own choices.
// Used by: challenges.js (answering) and new-challenge.js (challenging).
import { createProgress } from '../../ui/kit/progress.js';
import { SIGNALS, SIGNAL_NAMES, OIL_COST, oilFor, oilLeft, emptyPicks, canPick, needsText, pick, isSealable } from './logic.js';
import { signalGlyph } from './glyphs.js';
import { button, node, uniqueId } from './dom.js';

const oilWords = cost => `${cost} oil`;

export function createPicker({ onChange } = {}) {
  const element = node('div', 'duel-picker');
  const oilLine = node('p', 'duel-oil'), roundsBox = node('div', 'duel-rounds');
  const bar = createProgress({ label: 'Lantern oil', value: 0, max: 1 });
  const groupId = uniqueId('duel-picker');
  let total = 0, picks = [], options = [], disposed=false;
  oilLine.setAttribute('aria-live', 'polite');

  // One <label> with a hidden radio inside, so the whole big button is clickable.
  function optionFor(roundIndex, signal) {
    const label = node('label', 'duel-option'), input = node('input');
    const name = node('span', 'duel-option-name', `${SIGNAL_NAMES[signal]}, ${oilWords(OIL_COST[signal])}`);
    const reason = node('span', 'duel-option-reason');
    input.type = 'radio';
    input.name = `${groupId}-${roundIndex}`;
    input.value = signal;
    input.addEventListener('change', () => {
      if(disposed)return;
      picks = pick(total, picks, roundIndex, signal);
      refresh();
      onChange?.({ signals: [...picks], complete: isSealable(total, picks) });
    });
    label.append(input, signalGlyph(signal), name, reason);
    return { input, reason, signal, roundIndex };
  }

  function build() {
    roundsBox.replaceChildren();
    options = [];
    for (let roundIndex = 0; roundIndex < total; roundIndex++) {
      const group = node('fieldset', 'duel-round'), legend = node('legend', '', `Round ${roundIndex + 1} of ${total}`);
      const row = node('div', 'duel-options');
      for (const signal of SIGNALS) {
        const option = optionFor(roundIndex, signal);
        options.push(option);
        row.append(option.input.parentElement);
      }
      group.append(legend, row);
      roundsBox.append(group);
    }
  }

  // Shows what is chosen, disables what the oil cannot pay for, and says why.
  function refresh() {
    if(disposed)return;
    for (const { input, reason, signal, roundIndex } of options) {
      const allowed = canPick(total, picks, roundIndex, signal);
      input.checked = picks[roundIndex] === signal;
      input.disabled = !allowed;
      input.parentElement.dataset.disabled = String(!allowed);
      reason.textContent = allowed ? '' : needsText(total, picks, roundIndex, signal);
    }
    const left = oilLeft(total, picks);
    oilLine.textContent = `Oil left: ${left} of ${oilFor(total)}`;
    bar.update({ value: left, max: oilFor(total) });
  }

  const clearButton = button('Clear', () => {
    if(disposed)return;
    picks = emptyPicks(total);
    refresh();
    onChange?.({ signals: [...picks], complete: false });
  }, { quiet: true });

  element.append(oilLine, bar.element, roundsBox, clearButton);

  return {
    element,
    setRounds(count) {
      if(disposed)return;
      total = count;
      picks = emptyPicks(count);
      build();
      refresh();
    },
    getSignals: () => [...picks],
    isComplete: () => isSealable(total, picks),
    clear: () => clearButton.click(),
    dispose() { disposed=true;picks=[];options=[];element.replaceChildren();element.remove(); },
  };
}
