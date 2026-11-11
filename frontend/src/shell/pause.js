// The pause menu: where the HUD's extras live now (status line, sea chart, controls, joining).
import {node} from '../ui/kit/dom.js';
import {menuButton} from './screens.js';
import {menuExtras,menuStatus} from './menu-extras.js';
export function fillPauseMenu(nav,{play,page,show}){
  nav.append(menuButton('Resume',play));
  for(const extra of menuExtras())nav.append(menuButton(extra.label,()=>{play();extra.onSelect();},true));
  nav.append(menuButton('Settings',()=>page('settings'),true),menuButton('Return to title',()=>show('title'),true));
  const status=menuStatus(),nodes=[nav];
  if(status){const line=node('p','shell-status',status);nodes.unshift(line);}
  return nodes;
}
