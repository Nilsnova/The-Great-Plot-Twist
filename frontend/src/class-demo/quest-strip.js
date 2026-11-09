// The quest strip: three small goals, always visible on the demo path. Tap a goal for its one-line
// hint. The done state comes from quests.js; this file only draws it.
import {node} from '../ui/kit/dom.js';
import {questView, FINALE_HINT} from './quests.js';

// focusGame: after a pointer tap the keyboard goes back to the game, so E and WASD keep working.
export function createQuestStrip({parent, focusGame}) {
  const element = node('section', 'quest-strip'), heading = node('h2', '', 'Class demo goals');
  const list = node('ol'), hint = node('p', 'quest-hint'), next = node('p', 'quest-next', FINALE_HINT);
  heading.id = 'quest-strip-heading';
  element.setAttribute('aria-labelledby', heading.id);
  hint.setAttribute('role', 'status');hint.hidden = true;next.hidden = true;
  element.append(heading, list, hint, next);
  parent.append(element);
  let open = null, rows = new Map(), lastKey = '';

  function toggleHint(item) {
    open = open === item.id ? null : item.id;
    hint.textContent = open ? item.hint : '';
    hint.hidden = !open;
    for (const [id, button] of rows) button.setAttribute('aria-expanded', String(id === open));
  }

  function update(state) {
    const view = questView(state), key = JSON.stringify(view.items.map(item => item.done));
    if (key === lastKey) return view;
    lastKey = key;
    list.replaceChildren();rows = new Map();
    for (const item of view.items) {
      const li = node('li'), button = node('button', 'quest-item'), check = node('span', 'quest-check', item.done ? '✓' : '');
      button.type = 'button';button.dataset.done = String(item.done);button.dataset.quest = item.id;
      button.setAttribute('aria-expanded', String(open === item.id));
      button.setAttribute('aria-label', `${item.label}: ${item.done ? 'done' : 'not done yet'}. Show a hint.`);
      check.setAttribute('aria-hidden', 'true');
      button.append(check, node('span', 'quest-label', item.label));
      button.addEventListener('click', event => { toggleHint(item); if (event.detail > 0) focusGame?.(); });
      rows.set(item.id, button);li.append(button);list.append(li);
    }
    next.hidden = !view.allDone;
    return view;
  }

  return {element, update,
    set hidden(value) { element.hidden = value; },
    closeHint() { if (!open) return false; open = null; hint.hidden = true; for (const button of rows.values()) button.setAttribute('aria-expanded', 'false'); return true; },
    dispose() { element.remove(); }};
}
