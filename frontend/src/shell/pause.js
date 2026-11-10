// Load pause-only actions on demand, including the privacy-safe issue-draft link.
import {menuButton} from './screens.js';
import {createProblemLink,createProblemDescription} from '../diagnostics/report-link.js';
import {menuExtras} from './menu-extras.js';
export function fillPauseMenu(nav,{play,page,show,openAccount}){
  nav.append(menuButton('Resume',play),menuButton('Settings',()=>page('settings'),true),
    menuButton('Return to title',()=>show('title'),true));
  if(openAccount)nav.append(menuButton('Account',openAccount,true));
  for(const extra of menuExtras())nav.append(menuButton(extra.label,()=>{play();extra.onSelect();},true));
  const report=createProblemLink('pause');nav.append(report,createProblemDescription(report));
}
