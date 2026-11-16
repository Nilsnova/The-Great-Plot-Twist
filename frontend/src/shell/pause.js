// The pause menu: where the HUD's extras live now (status line, sea chart, controls, joining).
import {node} from '../ui/kit/dom.js';
import {menuButton} from './screens.js';
import {menuExtras,menuStatus} from './menu-extras.js';
import {withIcon} from './menu-icons.js';
export function fillPauseMenu(nav,{play,page,show}){
  const button=(label,onClick,quiet)=>withIcon(menuButton(label,onClick,quiet),label);
  nav.append(button('Resume',play));
  for(const extra of menuExtras())nav.append(button(extra.label,()=>{play();extra.onSelect();},true));
  nav.append(button('Settings',()=>page('settings'),true),button('Return to title',()=>show('title'),true));
  const status=menuStatus(),nodes=[nav];
  if(status){const line=node('p','shell-status',status);nodes.unshift(line);}
  return nodes;
}
