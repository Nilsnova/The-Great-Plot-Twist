// The quest strip, top-right in the HUD: a title with progress and at most three goals. Tap a goal
// for its one-line hint. It only draws a view ({title, progress, items, allDone, finale}); the rules
// live in first-quests.js (the first 3 minutes) and class-demo/quests.js (the class demo).
import {node, uniqueId} from './kit/dom.js';

// focusGame: after a pointer tap the keyboard goes back to the game, so E and WASD keep working.
export function createQuestStrip({parent, focusGame}) {
  const element = node('section', 'quest-strip'), heading = node('h2', 'quest-title'), title = node('span', 'quest-name'), progress = node('span', 'quest-progress');
  const list = node('ol'), hint = node('p', 'quest-hint'), next = node('p', 'quest-next');
  heading.id = uniqueId('quest-strip');
  heading.append(title, progress);
  element.dataset.hudGroup = 'quests';
  element.setAttribute('aria-labelledby', heading.id);
  hint.setAttribute('role', 'status');hint.hidden = true;next.hidden = true;
  element.append(heading, list, hint, next);
  parent.append(element);
  let open = null, rows = new Map(), lastKey = '', items = [];

  function toggleHint(item) {
    open = open === item.id ? null : item.id;
    hint.textContent = open ? item.hint : '';
    hint.hidden = !open;
    for (const [id, button] of rows) button.setAttribute('aria-expanded', String(id === open));
  }

  function render(view) {
    const key = JSON.stringify([view.title, view.progress, view.finale, view.items.map(item => [item.id, item.done, item.current])]);
    if (key === lastKey) return view;
    lastKey = key;items = view.items;
    title.textContent = view.title;progress.textContent = view.progress ?? '';
    if (open && !items.some(item => item.id === open)) { open = null; hint.hidden = true; }
    list.replaceChildren();rows = new Map();
    for (const item of items) {
      const li = node('li'), button = node('button', 'quest-item'), check = node('span', 'quest-check', item.done ? '✓' : String(item.step ?? ''));
      button.type = 'button';button.dataset.done = String(item.done);button.dataset.quest = item.id;
      if (item.current) button.dataset.current = 'true';
      button.setAttribute('aria-expanded', String(open === item.id));
      button.setAttribute('aria-label', `${item.label}: ${item.done ? 'done' : 'not done yet'}. Show a hint.`);
      check.setAttribute('aria-hidden', 'true');
      button.append(check, node('span', 'quest-label', item.label));
      button.addEventListener('click', event => { toggleHint(item); if (event.detail > 0) focusGame?.(); });
      rows.set(item.id, button);li.append(button);list.append(li);
    }
    next.textContent = view.finale ?? '';
    next.hidden = !view.allDone || !view.finale;
    return view;
  }

  return {element, render,
    get current() { return items.find(item => item.current) ?? items.find(item => !item.done) ?? null; },
    set hidden(value) { element.hidden = value; },
    closeHint() { if (!open) return false; open = null; hint.hidden = true; for (const button of rows.values()) button.setAttribute('aria-expanded', 'false'); return true; },
    dispose() { element.remove(); }};
}
