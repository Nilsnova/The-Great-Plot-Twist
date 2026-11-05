// Visual equivalents of important sound cues, placed in the currently active modal when needed.
import {node} from '../ui/kit/dom.js';
export function createCaptions(container) {
  const element=node('p','sound-caption');element.setAttribute('role','status');element.setAttribute('aria-live','polite');element.hidden=true;
  let timer;
  return {show(text){clearTimeout(timer);const dialogs=[...document.querySelectorAll('dialog[open]')];(dialogs.at(-1)??container).append(element);element.textContent=text;element.hidden=false;timer=setTimeout(()=>{element.hidden=true;},3800);},
    dispose(){clearTimeout(timer);element.remove();}};
}
