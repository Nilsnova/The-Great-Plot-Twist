// Small DOM helpers the Exchange views share: a definition-list row, a text setter that skips unchanged text,
// and a keyed list that updates its items in place, so a refresh never loses the focus. Used by: board-view.js and positions-view.js.
import { node } from '../../ui/kit/dom.js';

// One row of a definition list: a label and its value as words. Price and status are never only colour.
export function fact(label) {
  const wrap = node('div', 'market-fact'), term = node('dt', '', label), value = node('dd');
  wrap.append(term, value);
  return { wrap, term, value };
}

export function factList(...facts) {
  const list = node('dl', 'market-facts');
  list.append(...facts.map(item => item.wrap));
  return list;
}

// Writing the same text again would still replace the node, which can unsettle a screen reader.
export function setText(element, text) {
  const next = String(text ?? '');
  if (element.textContent !== next) element.textContent = next;
}

// Keeps `list` in the order of `rows`. `registry` maps a row id to { element, update }. Items that are gone are removed.
export function syncList(list, registry, rows, create, update = (item, row) => item.update(row)) {
  rows.forEach((row, index) => {
    if (!registry.has(row.id)) registry.set(row.id, create(row));
    const item = registry.get(row.id);
    update(item, row);
    if (list.children[index] !== item.element) list.insertBefore(item.element, list.children[index] ?? null);
  });
  for (const [id, item] of registry) {
    if (!rows.some(row => row.id === id)) { item.element.remove(); registry.delete(id); }
  }
}
