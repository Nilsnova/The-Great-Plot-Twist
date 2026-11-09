// Load pause-only actions on demand, including the privacy-safe issue-draft link.
import {menuButton} from './screens.js';
import {createProblemLink,createProblemDescription} from '../diagnostics/report-link.js';
export function fillPauseMenu(nav,{play,page,show,openAccount,prologue}){
  nav.append(menuButton('Resume',play),menuButton('Settings',()=>page('settings'),true),
    menuButton('Return to title',()=>show('title'),true));
  if(openAccount)nav.append(menuButton('Account and saves',openAccount,true));
  if(prologue)nav.append(menuButton('Lighthouse prologue',()=>{play();prologue();},true));
  const report=createProblemLink('pause');nav.append(report,createProblemDescription(report));
}
