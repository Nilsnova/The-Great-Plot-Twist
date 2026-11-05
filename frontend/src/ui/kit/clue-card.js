// Presentation of a clue supplied by the story/board team. Pinning only emits intent.
import { node, uniqueId } from './dom.js';
import { createButton } from './button.js';
export function createClueCard({ title = '', body = '', state = 'new', onPin } = {}) {
  const element = node('article','kit-clue-card'), heading = node('h3','',title), text = node('p','',body), badge = node('span','kit-badge');
  heading.id = uniqueId('clue'); element.setAttribute('aria-labelledby',heading.id);
  const pin = createButton({ label:'Pin clue', onClick:() => onPin?.() });
  element.append(badge,heading,text); if (onPin) element.append(pin.element);
  function update(data) {
    if (data.title !== undefined) heading.textContent = data.title;
    if (data.body !== undefined) text.textContent = data.body;
    if (data.state) state = data.state;
    element.dataset.state = ['new','pinned','used'].includes(state) ? state : 'new';
    badge.textContent = ({new:'New clue',pinned:'Pinned',used:'Used in a deduction'})[element.dataset.state];
    pin.element.setAttribute('aria-pressed',String(state==='pinned')); pin.update({label:state==='pinned' ? 'Unpin clue' : 'Pin clue'});
  }
  update({state}); return { element, update, dispose() { pin.dispose(); element.remove(); } };
}
