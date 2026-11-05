// A native data table. Values are supplied by feature owners, never calculated here.
import { node } from './dom.js';
export function createTable({ caption = 'Records', columns = [], rows = [] } = {}) {
  const element = node('table','kit-table'), title = node('caption','',caption), head = node('thead'), body = node('tbody');
  const header = node('tr'); columns.forEach(column => { const cell = node('th','',column.label); cell.scope = 'col'; header.append(cell); });
  head.append(header); element.append(title,head,body);
  function update(data) {
    if (data.caption !== undefined) title.textContent = data.caption;
    if (data.rows) rows = data.rows; body.replaceChildren();
    rows.forEach(row => { const tr = node('tr'); columns.forEach(column => tr.append(node('td','',row[column.key] ?? '—'))); body.append(tr); });
  }
  update({rows}); return { element, update, dispose() { element.remove(); } };
}
