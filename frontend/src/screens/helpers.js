// Safe presentational controls shared by case screens. No network or outcome rules.
import {node} from '../ui/kit/dom.js';
import {createButton} from '../ui/kit/button.js';
export {node};
export function button(label,onClick,{disabled=false,focus,quiet=false,ariaLabel}={}) {
  const control=createButton({label,onClick,disabled,variant:quiet?'quiet':'primary'}).element;
  if(ariaLabel)control.setAttribute('aria-label',ariaLabel);control.disabled=disabled;if(focus)control.dataset.focus=focus;return control;
}
export function facts(items) {
  const list=node('dl','case-facts');for(const [label,value] of items)list.append(node('dt','',label),node('dd','',value));return list;
}
