// Safe presentational controls shared by case screens. No network or outcome rules.
import {node} from '../ui/kit/dom.js';
import {createButton} from '../ui/kit/button.js';
export {node};
export function button(label,onClick,{disabled=false,focus,quiet=false,ariaLabel}={}) {
  const control=createButton({label,onClick,disabled,variant:quiet?'quiet':'primary'}).element;
  if(ariaLabel)control.setAttribute('aria-label',ariaLabel);control.disabled=disabled;if(focus)control.dataset.focus=focus;return control;
}
export function labelledSelect(title,options,onChange,{value,focus}={}) {
  const label=node('label','case-field'),select=node('select');label.append(node('span','',title),select);
  for(const option of options){const item=node('option','',option.label);item.value=option.id;select.append(item);}
  if(value!==undefined)select.value=value;if(focus)select.dataset.focus=focus;select.onchange=()=>onChange(select.value);return {element:label,select};
}
export function facts(items) {
  const list=node('dl','case-facts');for(const [label,value] of items)list.append(node('dt','',label),node('dd','',value));return list;
}
export function secondsLabel(value=0){const seconds=Math.max(0,Math.ceil(value));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
export function restoreFocus(root,render) {
  const key=root.contains(document.activeElement)?document.activeElement.dataset.focus:null;render();
  if(key)([...root.querySelectorAll('[data-focus]')].find(node=>node.dataset.focus===key)??root.querySelector('button:not(:disabled),input,select'))?.focus({preventScroll:true});
}
