// A labelled section that hosts another kit component or plain text.
import { node, content, uniqueId } from './dom.js';
export function createPanel({ title = '', body = '', tone = 'wood' } = {}) {
  const element = node('section','kit-panel'), heading = node('h2','kit-heading',title), bodyNode = node('div','kit-panel-body');
  heading.id = uniqueId('panel'); element.setAttribute('aria-labelledby',heading.id);
  if (tone === 'paper') element.classList.add('kit-paper'); content(bodyNode,body); element.append(heading,bodyNode);
  return { element, body:bodyNode, update(data) { if (data.title !== undefined) heading.textContent = data.title; if (data.body !== undefined) content(bodyNode,data.body); }, dispose() { element.remove(); } };
}
