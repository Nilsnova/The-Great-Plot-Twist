// New challenge (tab 2): who to challenge (any captain, or one by name), how many rounds, the
// stake, and the sealed picker. The button seals your signals and sends the challenge in one
// step. The name is only a lookup key for the server. Stakes above your coins are disabled with a
// reason. Nothing here decides an outcome: the screen sends choices, the server checks them again.
// Used by: panel.js.
import { STAKE_CHOICES, ROUND_CHOICES, isCaptainName } from './logic.js';
import { createPicker } from './picker.js';
import { button, field, node, uniqueId } from './dom.js';

const NAME_HINT = 'Captain names use 2 to 24 letters, numbers, spaces, dots, dashes or underscores.';

// A native radio inside a label, styled as a button by the CSS.
function choice(groupName, value, text, checked = false) {
  const label = node('label', 'duel-choice'), input = node('input'), words = node('span', '', text);
  input.type = 'radio';
  input.name = groupName;
  input.value = String(value);
  input.checked = checked;
  label.append(input, words);
  return { label, input, words };
}

function group(legendText, ...children) {
  const box = node('fieldset', 'duel-group'), row = node('div', 'duel-choices');
  row.append(...children);
  box.append(node('legend', '', legendText), row);
  return box;
}

export function createNewChallenge({ onSend }) {
  const element = node('form', 'duel-form'), id = uniqueId('duel-form');
  let rounds = ROUND_CHOICES[0], stake = 0, byName = false, coins = 0, rulesKey = '', stakeChoices = [];
  element.noValidate = true;
  element.addEventListener('submit', event => event.preventDefault());

  const anyCaptain = choice(`${id}-who`, 'any', 'Any captain (open challenge)', true);
  const namedCaptain = choice(`${id}-who`, 'name', 'A captain by name');
  const nameInput = node('input');
  Object.assign(nameInput, { type: 'text', maxLength: 24, autocomplete: 'off', spellcheck: false });
  const nameField = field("Captain's name, as shown in the harbor", nameInput);
  const nameHint = node('p', 'duel-hint');
  nameHint.setAttribute('aria-live', 'polite');
  nameField.hidden = true;
  const roundsBox = node('div', 'duel-choices'), stakesBox = node('div', 'duel-choices');
  const picker = createPicker({ onChange: refreshSeal });
  const sealButton = button('Seal and send', send, { disabled: true });
  const roundsGroup = group('Rounds', roundsBox), stakeGroup = group('Stake from each captain', stakesBox);
  element.append(group('Opponent', anyCaptain.label, namedCaptain.label), nameField, nameHint, roundsGroup, stakeGroup, picker.element, sealButton);

  function refreshSeal() {
    const nameOk = !byName || isCaptainName(nameInput.value);
    nameHint.textContent = byName && nameInput.value && !nameOk ? NAME_HINT : '';
    sealButton.textContent = stake > 0 ? `Seal, stake ${stake} and send` : 'Seal and send';
    sealButton.disabled = !(picker.isComplete() && nameOk && stake <= coins);
  }

  function setOpponent(isName) {
    byName = isName;
    nameField.hidden = !isName;
    refreshSeal();
  }

  // Rounds and stakes come from the server's rules, so a friendly-only ring shows only "Friendly".
  function drawChoices(rules) {
    roundsBox.replaceChildren();
    stakesBox.replaceChildren();
    for (const count of rules.roundChoices ?? ROUND_CHOICES) {
      const option = choice(`${id}-rounds`, count, `${count} rounds`, count === rounds);
      option.input.addEventListener('change', () => { rounds = count; picker.setRounds(count); refreshSeal(); });
      roundsBox.append(option.label);
    }
    stakeChoices = [];
    for (const amount of rules.stakeChoices ?? STAKE_CHOICES) {
      const option = choice(`${id}-stake`, amount, amount === 0 ? 'Friendly' : String(amount), amount === stake);
      option.input.addEventListener('change', () => { stake = amount; refreshSeal(); });
      stakesBox.append(option.label);
      stakeChoices.push({ amount, ...option });
    }
  }

  function stakeLabel(amount) {
    if (amount === 0) return 'Friendly';
    return amount > coins ? `${amount}, you have ${coins} coins` : String(amount);
  }

  function refreshStakes() {
    for (const { amount, input, words } of stakeChoices) {
      input.disabled = amount > coins;
      words.textContent = stakeLabel(amount);
    }
    if (stake > coins) {
      stake = 0;
      stakeChoices.find(option => option.amount === 0)?.input.click();
    }
  }

  async function send() {
    sealButton.disabled = true;
    const result = await onSend({ opponentName: byName ? nameInput.value.trim() : null, rounds, stake, signals: picker.getSignals() });
    if (result?.ok) reset();
    refreshSeal();
  }

  function reset() {
    anyCaptain.input.click();
    nameInput.value = '';
    picker.setRounds(rounds);
  }

  anyCaptain.input.addEventListener('change', () => setOpponent(false));
  namedCaptain.input.addEventListener('change', () => setOpponent(true));
  nameInput.addEventListener('input', refreshSeal);
  picker.setRounds(rounds);

  return {
    element,
    update(view) {
      coins = view.coins ?? 0;
      const key = JSON.stringify([view.rules.roundChoices, view.rules.stakeChoices]);
      if (key !== rulesKey) {
        rulesKey = key;
        drawChoices(view.rules);
      }
      refreshStakes();
      refreshSeal();
    },
    // Rematch: open the form with the other captain's name filled in.
    prefill(name) {
      namedCaptain.input.click();
      nameInput.value = name;
      refreshSeal();
      nameInput.focus();
    },
  };
}
