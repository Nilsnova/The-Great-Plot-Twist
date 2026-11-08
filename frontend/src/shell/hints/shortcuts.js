// Uses the shared native dialog for Escape handling, focus restoration and a keyboard trap.
import './shortcuts.css';
import '../../ui/settings-polish.css';
import {node} from '../../ui/kit/dom.js';
import {createModal} from '../../ui/kit/modal.js';

const shortcuts=[
  ['Walk','WASD or arrow keys'],['Run','Shift'],['Interact','E'],['Open the sea chart','M'],['Zoom','Mouse wheel'],
  ['Dialogue choices','1 to 9 · arrows to browse · Enter to confirm'],['Close or pause','Escape: close a view, skip a cinematic, then pause'],
  ['Touch','Tap the map to walk or drag the stick · Inspect nearby · Chart · Menu'],['Gamepad','Left stick or D-pad · A interact · Y chart · Menu pause'],
];

export function createShortcutsOverlay(){
  const modal=createModal({title:'Keyboard and controller shortcuts'}),body=node('section','shortcuts-overview');
  body.setAttribute('aria-label','Keyboard and controller shortcuts');
  const list=node('dl','shortcuts-list');
  for(const [label,keys] of shortcuts)list.append(node('dt','',label),node('dd','',keys));
  body.append(list,node('p','shortcuts-note','Menus and dialogs support keyboard focus and the gamepad D-pad.'));
  modal.setContent(body);
  return {element:modal.element,open(parent,focusTarget){modal.open(parent,focusTarget);},close(reason){modal.close(reason);},dispose(){modal.dispose();}};
}
