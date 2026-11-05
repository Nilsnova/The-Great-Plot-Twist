// A reusable readable dialogue box; all content comes from its caller, not story rules.
import { node, reducedMotion, uniqueId, portraitSource } from './dom.js';
import { createButton } from './button.js';
import {getPreferences,onPreferences} from '../../settings/preferences.js';
import { createTypewriter, choiceKey } from './logic.js';
export function createDialogue({ onChoice, ...initial } = {}) {
  const element = node('section','kit-dialogue'), portrait = node('div','kit-portrait'), copy = node('div','kit-dialogue-copy');
  const speaker = node('h3'), text = node('p','kit-dialogue-text'), choices = node('ol','kit-choices'), live = node('p','kit-sr-only');
  text.tabIndex = -1;
  speaker.id = uniqueId('speaker'); text.id = uniqueId('line'); element.setAttribute('aria-labelledby',speaker.id); live.setAttribute('role','status');
  const skip = createButton({label:'Show full text', onClick:() => complete(), variant:'quiet'}); skip.element.setAttribute('aria-controls',text.id);
  copy.append(speaker,text,skip.element,choices,live); element.append(portrait,copy);
  let writer, options = [], buttons = [], selected = 0, frame, previous = 0, announced = false;
  function paint() {
    text.textContent = writer.text;
    buttons.forEach((button,index) => { button.disabled = !writer.done || !!options[index].disabled; button.setAttribute('aria-current',String(index===selected)); });
    const hadSkipFocus = document.activeElement === skip.element;
    skip.element.hidden = writer.done;
    if (hadSkipFocus && writer.done) (buttons.find((button,index)=>index>=selected&&!button.disabled) ?? buttons.find(button=>!button.disabled) ?? text).focus();
    if (writer.done && !announced) { live.textContent = writer.text; announced = true; }
  }
  function complete() { writer.skip(); cancelAnimationFrame(frame); paint(); (buttons.find((button,index)=>index>=selected&&!button.disabled) ?? buttons.find(button=>!button.disabled) ?? text).focus(); }
  function tick(now) {
    writer.tick(previous ? (now-previous)/1000 : 0); previous = now; paint();
    if (!writer.done) frame = requestAnimationFrame(tick);
  }
  function update(data) {
    const keepFocus = element.contains(document.activeElement);
    cancelAnimationFrame(frame); buttons = []; choices.replaceChildren(); selected = 0; previous = 0; announced = false; live.textContent = '';
    speaker.textContent = String(data.speaker ?? 'Field notes'); options = (data.choices ?? []).slice(0,9);
    writer = createTypewriter(data.text ?? '',{rate:getPreferences().textSpeed||36,reducedMotion:reducedMotion()||getPreferences().textSpeed===0}); portrait.replaceChildren(); portrait.hidden = !data.portrait;
    const source = data.portrait ? portraitSource(data.portrait.src) : null;
    if (source) { const image = node('img'); image.src = source; image.alt = data.portrait.alt ?? data.speaker ?? '';
      const scale = Number.isInteger(data.portrait.scale) && data.portrait.scale > 0 ? Math.min(4,data.portrait.scale) : 3;
      image.style.width = `${(data.portrait.width ?? 24)*scale}px`; image.style.height = `${(data.portrait.height ?? 32)*scale}px`; portrait.append(image); }
    options.forEach((option,index) => {
      const li = node('li'), button = node('button','kit-choice',`${index+1}. ${option.label}`); button.type = 'button';
      button.dataset.choice = option.id;
      button.onclick = () => onChoice?.(option.id,index); button.onfocus = () => { selected=index; paint(); };
      li.append(button); if (option.hint) li.append(node('small','kit-choice-hint',option.hint)); choices.append(li); buttons.push(button);
    });
    paint(); if (!writer.done) frame = requestAnimationFrame(tick);
    if (keepFocus) (writer.done ? buttons.find(button=>!button.disabled) ?? text : skip.element).focus();
  }
  const key = event => {
    if (event.target.closest('input,textarea,select')) return;
    if (event.repeat && (event.key==='Enter' || event.key===' ' || /^[1-9]$/.test(event.key))) { event.preventDefault(); event.stopPropagation(); return; }
    const next = choiceKey(event.key,selected,options.length);
    if (!next && event.key !== 'Enter') return;
    event.preventDefault(); event.stopPropagation();
    if (!writer.done) { complete(); return; }
    if (next?.activate && options[next.index].disabled) return;
    if (next && !next.activate) {
      const direction = ['ArrowUp','ArrowLeft','End'].includes(event.key) ? -1 : 1;
      for(let i=0;i<options.length&&options[next.index].disabled;i++) next.index=(next.index+options.length+direction)%options.length;
    }
    if (next) { selected=next.index; paint(); buttons[selected]?.focus(); if (next.activate) onChoice?.(options[selected].id,selected); }
  };
  const stopPreferences=onPreferences(()=>{if(reducedMotion()||getPreferences().textSpeed===0)complete();else writer.setRate(getPreferences().textSpeed);});
  element.addEventListener('keydown',key); update(initial);
  return { element, update, complete, pause(){cancelAnimationFrame(frame);}, focus() { (writer.done ? buttons.find(button=>!button.disabled) ?? text : skip.element).focus(); },
    dispose() { stopPreferences();cancelAnimationFrame(frame); element.removeEventListener('keydown',key); skip.dispose(); element.remove(); },
  };
}
