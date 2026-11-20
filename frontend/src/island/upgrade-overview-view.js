import {node} from '../ui/kit/dom.js';
import {overviewRows} from './upgrade-overview.js';
import './upgrade-overview.css';

// Filters the current accepted list and sends a building selection by its stable ID.
export function drawUpgradeOverview(body, model, {kind = 'all', state = 'all', choose = () => {}, find = null} = {}) {
  const filters = node('div', 'base-overview-filters');
  function select(label, id, value, options, changed) {
    const field = node('label', 'base-overview-filter', label), input = node('select', 'kit-input');
    input.dataset.focus = id; input.setAttribute('aria-label', label);
    for (const [key, name] of options) { const option = node('option', '', name); option.value = key; input.append(option); }
    input.value = value;
    input.addEventListener('change', () => changed(input.value)); field.append(input); filters.append(field);
    return input;
  }
  const first = select('Building type', 'overview-kind', kind,
    [['all', 'All types'], ...model.kinds.map(item => [item.id, item.name])], next => choose(next, state));
  select('Next building level', 'overview-state', state,
    [['all', 'All levels'], ['ready', 'Within budget'], ['blocked', 'Not ready yet'], ['top', 'Highest building level']], next => choose(kind, next));
  const rows = overviewRows(model, kind, state), count = node('p', 'base-overview-count', `${rows.length} shown`);
  count.setAttribute('role', 'status');
  const list = node('ul', 'base-overview-list'); list.setAttribute('aria-label', 'Your buildings');
  for (const row of rows) {
    const item = node('li', `base-overview-row is-${row.state}`); item.dataset.spot = row.id;
    const head = node('div', 'base-overview-head');
    head.append(node('strong', '', row.name), node('span', 'base-overview-level', `Level ${row.level}`));
    const next = node('div', 'base-overview-action');
    next.append(node('p', 'base-overview-next', row.next));
    if (find && row.onMap) {
      const action = node('button', 'kit-button kit-quiet base-overview-find', 'Find');
      action.type = 'button'; action.dataset.focus = `overview-${row.id}`;
      action.setAttribute('aria-label', `Find ${row.name} at ${row.place}`);
      action.addEventListener('click', () => { if (action.isConnected) find(row.id); });
      next.append(action);
    }
    item.append(head, node('span', 'base-overview-place', row.place), next);
    for (const text of [row.reason, row.skill, row.paths]) if (text) item.append(node('p', 'base-overview-detail', text));
    list.append(item);
  }
  body.append(node('p', 'island-purpose', model.lead));
  if (model.note) body.append(node('p', 'island-purpose', model.note));
  body.append(filters, count, list);
  if (!rows.length) body.append(node('p', 'island-purpose', model.rows.length ? 'No buildings match these filters.' : model.empty));
  if (model.message) { const error = node('p', 'island-message', model.message); error.setAttribute('role', 'alert'); body.append(error); }
  return first;
}
