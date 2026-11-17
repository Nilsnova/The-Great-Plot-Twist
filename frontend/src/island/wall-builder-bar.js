// Actual construction controls display controller state and forward intents; they decide no purchase rule.
import {node} from '../ui/kit/dom.js';
import './wall-builder.css';
export function createWallBuilderBar({container, handlers}) {
  let current = null;
  const bar = node('section', 'island-move-bar island-wall-builder'); bar.hidden = true; bar.setAttribute('aria-label', 'Build walls');
  const title = node('strong', 'island-move-title', 'Build walls'), hint = node('p', 'island-move-line wall-builder-hint');
  const status = node('p', 'island-move-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const price = node('p', 'island-move-line wall-builder-price'), actions = node('div', 'wall-builder-actions');
  const button = (label, action, quiet = true) => { const item = node('button', `kit-button${quiet ? ' kit-quiet' : ''}`, label);
    item.type = 'button'; item.addEventListener('click', action); return item; };
  const undo = button('Undo', () => handlers.undo()), clear = button('Clear', () => handlers.clear());
  undo.setAttribute('aria-label', 'Remove last');
  const close = button('Cancel', () => handlers.cancel());
  const submit = button('Get price', () => current?.phase === 'enable_failed' ? handlers.open()
    : ['ready', 'unknown'].includes(current?.phase) ? handlers.confirm() : handlers.quote(), false);
  const camera = node('div', 'wall-builder-camera'); camera.setAttribute('aria-label', 'Village camera'); camera.setAttribute('role', 'group');
  for (const [label, action, name] of [['−', 'out', 'Zoom out'], ['+', 'in', 'Zoom in'], ['Fit', 'fit', 'Fit village']]) {
    const item = button(label, () => handlers.camera?.(action)); item.setAttribute('aria-label', name); camera.append(item);
  }
  const fine = node('details', 'wall-builder-fine'), summary = node('summary', '', 'Fine position');
  const layout = node('div', 'wall-builder-fine-layout'), pad = node('div', 'wall-builder-fine-pad'), anchors = node('p', 'wall-builder-anchors');
  pad.setAttribute('role', 'group'); pad.setAttribute('aria-label', 'Move draft one square');
  const fineButtons = [];
  for (const [label, direction, dx, dz] of [['←', 'west', -1, 0], ['↑', 'north', 0, -1], ['↓', 'south', 0, 1], ['→', 'east', 1, 0]]) {
    const item = button(label, () => handlers.shift?.(dx, dz)); item.classList.add(`fine-${direction}`);
    item.setAttribute('aria-label', `Shift draft one square ${direction}`); fineButtons.push(item); pad.append(item);
  }
  layout.append(pad, anchors); fine.append(summary, layout);
  fine.addEventListener('toggle', () => bar.classList.toggle('has-fine-position', fine.open)); // Existing camera cache watches bar classes.
  actions.append(undo, clear, close, submit); bar.append(title, hint, status, price, fine, camera, actions); container.append(bar);
  return {
    render(model) {
      const opening = bar.hidden && !!model; current = model; bar.hidden = !model; if (!model) { fine.open = false; bar.classList.remove('has-fine-position'); return; }
      title.textContent = `Build walls · ${model.cells.length} ${model.cells.length === 1 ? 'wall' : 'walls'}`;
      const warning = ['building', 'unknown'].includes(model.phase);
      hint.textContent = warning ? 'Closing does not cancel a purchase already sent.' : 'Tap to start, then add walls or turn. Arrow keys add one wall.';
      hint.hidden = !warning && model.cells.length > 0 && !!model.status;
      status.textContent = model.status; bar.classList.toggle('is-refused', ['refused', 'enable_failed'].includes(model.phase));
      price.textContent = model.quote ? `Total: ${model.quote.totalCost} coins · Wall slots remaining: ${model.quote.remaining}` : 'Get the price to check these positions.';
      price.hidden = !model.quote; // The unquoted status and Get price action already explain the next step.
      // The game camera caches insets using classes as well as text; each reflow is explicit.
      bar.classList.toggle('has-wall-warning', warning);
      bar.classList.toggle('has-wall-instructions', !hint.hidden);
      bar.classList.toggle('has-wall-quote', !price.hidden);
      const editable = ['draft', 'ready', 'refused'].includes(model.phase) && !model.busy;
      undo.disabled = clear.disabled = !editable || !model.cells.length;
      fineButtons.forEach(item => { item.disabled = !editable || !model.cells.length; });
      const first = model.cells[0], last = model.cells.at(-1);
      anchors.textContent = first ? `First: ${first.x}, ${first.z} · Last: ${last.x}, ${last.z} · One square = 0.5` : 'Tap a square first.';
      close.textContent = ['building', 'unknown'].includes(model.phase) ? 'Close' : 'Cancel';
      submit.disabled = model.busy || model.phase === 'enabling' || (!model.cells.length && model.phase !== 'enable_failed');
      submit.textContent = model.busy ? 'Please wait…' : model.phase === 'ready' ? `Build for ${model.quote.totalCost} coins`
        : model.phase === 'unknown' ? 'Check previous build' : model.phase === 'enable_failed' ? 'Try opening again' : 'Get price';
      if (opening) close.focus({preventScroll: true});
    },
    get element() { return bar; }, dispose() { bar.remove(); },
  };
}
