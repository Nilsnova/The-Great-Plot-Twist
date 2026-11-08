// Visual equivalents of important sound cues, placed in the currently active modal when needed.
import {node} from '../ui/kit/dom.js';
export default function createCaptionsView(container) {
  const element=node('p','sound-caption');element.setAttribute('role','status');element.setAttribute('aria-live','polite');element.hidden=true;
  let timer;
  function position(){
    const inDialog=!!element.closest('dialog');element.classList.toggle('in-dialog',inDialog);
    if(inDialog){element.style.removeProperty('bottom');return;}
    // Keep the caption over the scenery, above readable HUD controls and prompts.
    const controls=[...container.querySelectorAll('.bottom-bar,.interact:not([hidden]),.build-badge')].filter(node=>node.getClientRects().length);
    const top=Math.min(innerHeight,...controls.map(node=>node.getBoundingClientRect().top));
    element.style.bottom=`${Math.max(18,innerHeight-top+12)}px`;
  }
  window.addEventListener('resize',position);
  return {show(text){clearTimeout(timer);const dialog=[...document.querySelectorAll('dialog[open]')].at(-1),header=dialog?.querySelector(':scope > .kit-modal-header');
    if(header)header.after(element);else if(dialog)dialog.prepend(element);else container.append(element);
    element.textContent=text;element.hidden=false;position();timer=setTimeout(()=>{element.hidden=true;},3800);},
    dispose(){clearTimeout(timer);window.removeEventListener('resize',position);element.remove();}};
}
