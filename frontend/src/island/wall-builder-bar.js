// Actual construction controls display controller state and forward intents; they decide no purchase rule.
import {node} from '../ui/kit/dom.js';
import './wall-builder.css';
export function createWallBuilderBar({container, handlers}) {
  let current = null;
  const bar = node('section', 'island-move-bar island-wall-builder'); bar.hidden = true; bar.setAttribute('aria-label', 'Build walls');
  const title = node('strong', 'island-move-title', 'Build walls'), hint = node('p', 'island-move-line');
  const status = node('p', 'island-move-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const price = node('p', 'island-move-line'), actions = node('div', 'wall-builder-actions');
  const button = (label, action, quiet = true) => { const item = node('button', `kit-button${quiet ? ' kit-quiet' : ''}`, label);
    item.type = 'button'; item.addEventListener('click', action); return item; };
  const undo = button('Remove last', () => handlers.undo()), clear = button('Clear', () => handlers.clear());
  const close = button('Cancel', () => handlers.cancel());
  const submit = button('Get price', () => current?.phase === 'enable_failed' ? handlers.open()
    : ['ready', 'unknown'].includes(current?.phase) ? handlers.confirm() : handlers.quote(), false);
  const camera = node('div', 'wall-builder-camera'); camera.setAttribute('aria-label', 'Village camera'); camera.setAttribute('role', 'group');
  for (const [label, action, name] of [['−', 'out', 'Zoom out'], ['+', 'in', 'Zoom in'], ['Fit', 'fit', 'Fit village']]) {
    const item = button(label, () => handlers.camera?.(action)); item.setAttribute('aria-label', name); camera.append(item);
  }
  actions.append(undo, clear, close, submit); bar.append(title, hint, status, price, camera, actions); container.append(bar);
  return {
    render(model) {
      const opening = bar.hidden && !!model; current = model; bar.hidden = !model; if (!model) return;
      title.textContent = `Build walls · ${model.cells.length} ${model.cells.length === 1 ? 'wall' : 'walls'}`;
      hint.textContent = ['building', 'unknown'].includes(model.phase) ? 'Closing does not cancel a purchase already sent.' : 'Tap to start, then add walls or turn. Arrow keys add one wall.';
      status.textContent = model.status; bar.classList.toggle('is-refused', ['refused', 'enable_failed'].includes(model.phase));
      price.textContent = model.quote ? `Total: ${model.quote.totalCost} coins · Remaining after building: ${model.quote.remaining}` : 'Get the price to check these positions.';
      const editable = ['draft', 'ready', 'refused'].includes(model.phase) && !model.busy;
      undo.disabled = clear.disabled = !editable || !model.cells.length;
      close.textContent = ['building', 'unknown'].includes(model.phase) ? 'Close' : 'Cancel';
      submit.disabled = model.busy || model.phase === 'enabling' || (!model.cells.length && model.phase !== 'enable_failed');
      submit.textContent = model.busy ? 'Please wait…' : model.phase === 'ready' ? `Build for ${model.quote.totalCost} coins`
        : model.phase === 'unknown' ? 'Check previous build' : model.phase === 'enable_failed' ? 'Try opening again' : 'Get price';
      if (opening) close.focus({preventScroll: true});
    },
    get element() { return bar; }, dispose() { bar.remove(); },
  };
}
