// The Prices pane: simulation notes on top, then one card per company. It draws what view-models.js says
// and hands the player's intent to onOpenPosition. A card is built once and updated in place, so a refresh
// never loses the focus or the form the player is filling in. Used by: panel.js.
import { node, uniqueId } from '../../ui/kit/dom.js';
import { createButton } from '../../ui/kit/button.js';
import { fact, factList, setText, syncList } from './parts.js';
import { createOpenForm } from './open-form.js';
import { boardRows, boardNotes } from './view-models.js';

function createCard(onOpenPosition) {
  const id = uniqueId('market-card');
  const element = node('li', 'market-card');
  const title = node('h3', 'market-card-title'), ticker = node('span', 'kit-badge'), follows = node('p', 'market-follows');
  const price = fact('Price'), status = fact('Status'), tagline = node('p', 'market-tagline'), blocked = node('p', 'market-blocked');
  const toggle = createButton({ label: 'Open a position', onClick: () => (form.element.hidden ? expand() : collapse()) });
  const form = createOpenForm({ onSubmit: onOpenPosition, onCancel: collapse });
  form.element.id = `${id}-form`;
  form.element.hidden = true;
  toggle.element.setAttribute('aria-controls', form.element.id);
  toggle.element.setAttribute('aria-expanded', 'false');
  element.append(title, follows, factList(price, status), tagline, blocked, toggle.element, form.element);

  function expand() {
    form.element.hidden = false;
    element.dataset.open = 'true'; // an open form takes the whole row
    toggle.element.setAttribute('aria-expanded', 'true');
    form.focus();
  }
  function collapse(focusToggle = true) {
    form.element.hidden = true;
    element.dataset.open = 'false';
    toggle.element.setAttribute('aria-expanded', 'false');
    if (focusToggle) toggle.element.focus();
  }
  return {
    element,
    reset() { form.reset(); collapse(false); },
    update(row, rules, disabled) {
      element.dataset.status = row.status;
      setText(ticker, row.ticker);
      if (title.dataset.heading !== row.heading) { title.dataset.heading = row.heading; title.replaceChildren(row.heading, ' ', ticker); }
      setText(follows, row.followsText);
      setText(price.term, row.priceLabel);
      setText(price.value, row.priceAtText ? `${row.priceText} (${row.priceAtText})` : row.priceText);
      setText(status.value, row.statusText);
      setText(tagline, row.tagline);
      toggle.element.hidden = !row.canOpen;
      toggle.element.setAttribute('aria-label', `Open a position in ${row.heading}`);
      blocked.hidden = row.canOpen || row.blockedText === row.statusText; // the status row already says it
      setText(blocked, row.blockedText);
      if (!row.canOpen && !form.element.hidden) collapse(false);
      form.update(row, rules, { disabled });
    },
  };
}

export function createBoardView({ onOpenPosition, timeZone }) {
  const element = node('div', 'market-prices');
  const notes = node('div', 'market-notes'), refresh = node('p', 'market-refresh-note');
  const empty = node('p', 'market-empty'), list = node('ul', 'market-cards');
  element.append(notes, refresh, empty, list);
  const cards = new Map();
  const written = { notes: '' };

  function drawNotes(board) {
    const text = boardNotes(board), lines = [['market-demo', text.demo], ['market-soon', text.soon], ['market-simulation', text.simulation]].filter(line => line[1]);
    if (JSON.stringify(lines) === written.notes) return;
    written.notes = JSON.stringify(lines);
    notes.replaceChildren(...lines.map(([name, line]) => node('p', `market-note ${name}`, line)));
  }
  return {
    element,
    reset() { for (const card of cards.values()) card.reset(); },
    update(board, note, { disabled = false } = {}) {
      const rows = boardRows(board, { timeZone });
      setText(refresh, note);
      refresh.hidden = !note;
      setText(empty, board ? 'No companies are listed right now.' : 'Loading prices…');
      empty.hidden = rows.length > 0 || (!board && Boolean(note));
      drawNotes(board);
      syncList(list, cards, rows, () => createCard(onOpenPosition), (card, row) => card.update(row, board.rules, disabled));
    },
  };
}
