// A reusable readable dialogue box; all content comes from its caller, not story rules.
import { node, reducedMotion, uniqueId } from './dom.js';
import { createButton } from './button.js';
import { createTypewriter, choiceKey } from './logic.js';
export function createDialogue({ onChoice, ...initial } = {}) {
  const element = node('section','kit-dialogue'), portrait = node('div','kit-portrait'), copy = node('div','kit-dialogue-copy');
  const speaker = node('h3'), text = node('p','kit-dialogue-text'), choices = node('ol','kit-choices'), live = node('p','kit-sr-only');
  speaker.id = uniqueId('speaker'); text.id = uniqueId('line'); element.setAttribute('aria-labelledby',speaker.id); live.setAttribute('role','status');
  const skip = createButton({label:'Show full text', onClick:() => complete(), variant:'quiet'}); skip.element.setAttribute('aria-controls',text.id);
  copy.append(speaker,text,skip.element,choices,live); element.append(portrait,copy);
  let writer, options = [], buttons = [], selected = 0, frame, previous = 0, announced = false;
  function paint() {
    text.textContent = writer.text;
    buttons.forEach((button,index) => { button.disabled = !writer.done; button.setAttribute('aria-current',String(index===selected)); });
    skip.element.hidden = writer.done;
    if (writer.done && !announced) { live.textContent = writer.text; announced = true; }
  }
  function complete() { writer.skip(); cancelAnimationFrame(frame); paint(); buttons[selected]?.focus(); }
  function tick(now) {
    writer.tick(previous ? (now-previous)/1000 : 0); previous = now; paint();
    if (!writer.done) frame = requestAnimationFrame(tick);
  }
  function update(data) {
    cancelAnimationFrame(frame); buttons = []; choices.replaceChildren(); selected = 0; previous = 0; announced = false; live.textContent = '';
    speaker.textContent = String(data.speaker ?? 'Field notes'); options = (data.choices ?? []).slice(0,9);
    writer = createTypewriter(data.text ?? '',{rate:36,reducedMotion:reducedMotion()}); portrait.replaceChildren(); portrait.hidden = !data.portrait;
    if (data.portrait) { const image = node('img'); image.src = data.portrait.src; image.alt = data.portrait.alt ?? data.speaker ?? ''; portrait.append(image); }
    options.forEach((option,index) => {
      const li = node('li'), button = node('button','kit-choice',`${index+1}. ${option.label}`); button.type = 'button';
      button.onclick = () => onChoice?.(option.id,index); button.onfocus = () => { selected=index; };
      li.append(button); choices.append(li); buttons.push(button);
    });
    paint(); if (!writer.done) frame = requestAnimationFrame(tick);
  }
  const key = event => {
    if (event.target.closest('input,textarea,select')) return;
    const next = choiceKey(event.key,selected,options.length);
    if (!next && event.key !== 'Enter') return;
    event.preventDefault(); event.stopPropagation();
    if (!writer.done) { complete(); return; }
    if (next) { selected=next.index; paint(); buttons[selected]?.focus(); if (next.activate) onChoice?.(options[selected].id,selected); }
  };
  element.addEventListener('keydown',key); update(initial);
  return { element, update, complete, focus() { (writer.done ? buttons[selected] : skip.element)?.focus(); },
    dispose() { cancelAnimationFrame(frame); element.removeEventListener('keydown',key); skip.dispose(); element.remove(); },
  };
}
