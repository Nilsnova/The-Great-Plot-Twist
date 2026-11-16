// One unlock card (T52) in the kit's modal: the wave it came with, what the new thing is, how to use it, where it
// lives in the Menu, and Show me (walk the camera there), Got it and, with more cards waiting, Skip all. The words
// come from cardText() (src/tutorial/unlock-cards.js). Escape and the close button mean Got it. Focus starts on
// Got it and goes back to the game after (the kit modal restores the focus it found).
//   const card = openUnlockCard({container, text, index, total});
//   card.done -> 'ok' | 'show' | 'skip_all' | 'disposed'
import './coach.css';
import {createModal} from '../ui/kit/modal.js';
import {createButton} from '../ui/kit/button.js';
import {node} from '../ui/kit/dom.js';

export function openUnlockCard({container = document.body, text, index = 1, total = 1} = {}) {
  let settle = null;
  const done = new Promise(resolve => { settle = resolve; });
  const body = node('div', 'unlock-body');
  const how = node('p', 'unlock-how');how.append(node('strong', '', 'How: '), document.createTextNode(text.how));
  const menu = node('p', 'unlock-note', text.menu);menu.hidden = !text.menu;
  const practice = node('p', 'unlock-note', text.practice);practice.hidden = !text.practice;
  const actions = node('div', 'unlock-actions');
  const finish = reason => { if (!settle) return; const resolve = settle; settle = null; modal.close(reason); resolve(reason); };
  const ok = createButton({label: 'Got it', onClick: () => finish('ok')});
  const show = text.showMe ? createButton({label: 'Show me', variant: 'quiet', onClick: () => finish('show')}) : null;
  const skip = total > 1 ? createButton({label: `Skip all ${total - index + 1}`, variant: 'quiet', onClick: () => finish('skip_all')}) : null;
  actions.append(ok.element, ...(show ? [show.element] : []), ...(skip ? [skip.element] : []));
  const count = node('p', 'unlock-count', `${index} of ${total}`);count.hidden = total < 2;
  body.append(node('p', 'unlock-eyebrow', text.eyebrow), node('p', 'unlock-what', text.what), how, menu, practice, actions, count);
  const modal = createModal({title: text.title, body, onCancel: () => finish('ok')});
  modal.element.classList.add('unlock-card');
  modal.element.addEventListener('close', () => finish('ok'));
  modal.open(container, ok.element);
  return {element: modal.element, done,
    get isOpen() { return modal.element.open; },
    close(reason = 'ok') { finish(reason); },
    dispose() { if (settle) { const resolve = settle; settle = null; resolve('disposed'); } modal.dispose(); }};
}
