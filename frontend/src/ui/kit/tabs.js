// Native tabs with automatic arrow/Home/End selection and matching labelled panels.
import './components.css';
import { node, content, uniqueId } from './dom.js';
export function createTabs({ items = [], selected = 0, onChange } = {}) {
  const element = node('section','kit-tabs'), bar = node('div','kit-tablist'); bar.setAttribute('role','tablist');
  const buttons = [], panels = [], cleanups = [];
  function select(index, focus = false) {
    if (!buttons[index]) return; selected = index;
    buttons.forEach((button,i) => { button.setAttribute('aria-selected',String(i===index)); button.tabIndex = i===index ? 0 : -1; panels[i].hidden = i!==index; });
    if (focus) buttons[index].focus(); onChange?.(items[index].id, index);
  }
  items.forEach((item,index) => {
    const button = node('button','kit-tab',item.label), panel = node('section','kit-tabpanel'); button.type = 'button';
    button.id = uniqueId('tab'); panel.id = uniqueId('tabpanel'); button.setAttribute('role','tab');
    panel.setAttribute('role','tabpanel'); panel.tabIndex = 0; button.setAttribute('aria-controls',panel.id); panel.setAttribute('aria-labelledby',button.id); content(panel,item.body);
    const click = () => select(index); const key = event => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index+1)%items.length;
      else if (event.key === 'ArrowLeft') next = (index+items.length-1)%items.length;
      else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = items.length-1; else return;
      event.preventDefault(); event.stopPropagation(); select(next,true);
    };
    button.addEventListener('click',click); button.addEventListener('keydown',key);
    cleanups.push(() => { button.removeEventListener('click',click); button.removeEventListener('keydown',key); });
    buttons.push(button); panels.push(panel); bar.append(button);
  });
  element.append(bar,...panels); select(Math.max(0,Math.min(items.length-1,selected)));
  return { element, select, dispose() { cleanups.forEach(fn=>fn()); element.remove(); } };
}
