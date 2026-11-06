// A list of cards that keeps each card's own parts alive between refreshes.
// Every card is an <article> with a body that is rebuilt only when something it shows has changed, and a
// live region (role="status") that is never replaced, so a screen reader announces each new message.
//
//   const list = createCardList('desk-cards');
//   list.sync([{ id, signature, render(body) { ... }, notice }]);
//
// Used by: questions-view.js and presenter-view.js.

import { keepFocus, liveStatus, node, setText } from './dom-helpers.js';

export function createCardList(className) {
  const element = node('div', className);
  const cards = new Map();

  function makeCard() {
    const article = node('article', 'desk-card');
    const body = node('div', 'desk-card-body');
    const status = liveStatus();
    article.append(body, status);
    return { article, body, status, signature: null };
  }

  // items: one { id, signature, render(body), notice } per card, in the order to show.
  function sync(items) {
    const ids = new Set(items.map(item => item.id));
    for (const id of [...cards.keys()]) if (!ids.has(id)) cards.delete(id);
    for (const item of items) {
      if (!cards.has(item.id)) cards.set(item.id, makeCard());
      const card = cards.get(item.id);
      if (card.signature !== item.signature) {
        keepFocus(card.article, () => item.render(card.body, card.article));
        card.signature = item.signature;
      }
      setText(card.status, item.notice ?? '');
    }
    const articles = items.map(item => cards.get(item.id).article);
    const inOrder = articles.length === element.children.length && articles.every((article, index) => element.children[index] === article);
    if (!inOrder) element.replaceChildren(...articles);
  }

  return { element, sync, card: id => cards.get(id) ?? null };
}
