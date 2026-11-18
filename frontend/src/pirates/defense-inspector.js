import {BUILDINGS} from '../island/td-rules.js';
import {node} from '../ui/kit/dom.js';

const TARGETS = {'ships': 'ships', 'sailing-ships': 'sailing ships', 'boarders': 'boarders'};
const STOPPED = {destroyed: 'Destroyed', jammed: 'Jammed', silenced: 'Stopped by enemy fire'};
const units = value => String(Number(value.toFixed(2)));

export function coverageText(coverage) {
  const {range, minRange, litRange, status, targets} = coverage;
  const stopped = STOPPED[status];
  if (stopped) return stopped;
  const outer = range > minRange ? `Range · ${units(range)} units` : 'No targets in normal sight';
  const lines = [outer, targets.map(kind => TARGETS[kind]).join(' and ')];
  if (minRange > 0) lines.push(`Starts at ${units(minRange)} units`);
  if (litRange > Math.max(range, minRange)) lines.push(`Lit targets up to ${units(litRange)} units`);
  return lines.join(' · ');
}

export function createDefenseInspector({onSelect, onClose}) {
  const element = node('section', 'pirate-defense-inspector');
  element.setAttribute('aria-label', 'Defense range'); element.hidden = true;
  const picker = node('select', 'pirate-defense-picker');
  picker.setAttribute('aria-label', 'Inspect a defense');
  const close = node('button', 'kit-button kit-quiet pirate-defense-close', 'Close');
  close.type = 'button';
  const text = node('p', 'pirate-defense-coverage');
  text.setAttribute('role', 'status');
  element.append(picker, close, text);
  picker.addEventListener('change', () => onSelect(picker.value));
  close.addEventListener('click', onClose);
  element.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation();
    onClose();
  });
  let options = null;
  function render(model) {
    if (!model) { element.hidden = true; return; }
    if (options !== model.options) {
      options = model.options;
      picker.replaceChildren(...options.map(({id, kind, level}) => {
        const number = id.split('_').slice(1).join('-');
        const name = [BUILDINGS[kind].name, number].filter(Boolean).join(' ');
        const option = node('option', '', `${name} · Level ${level}`);
        option.value = id;
        return option;
      }));
    }
    if (picker.value !== model.coverage.id) picker.value = model.coverage.id;
    const next = coverageText(model.coverage);
    if (text.textContent !== next) text.textContent = next;
    if (element.hidden) { element.hidden = false; picker.focus({preventScroll: true}); }
  }
  return {element, render};
}
