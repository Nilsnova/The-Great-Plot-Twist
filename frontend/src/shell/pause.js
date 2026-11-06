// Load pause-only actions on demand, including the privacy-safe issue-draft link.
import {menuButton} from './screens.js';
import {createProblemLink} from '../diagnostics/report-link.js';
export function fillPauseMenu(nav,{play,page,show,openAccount}){
  nav.append(menuButton('Resume',play),menuButton('Settings',()=>page('settings'),true),
    menuButton('Return to title',()=>show('title'),true));
  if(openAccount)nav.append(menuButton('Account and saves',openAccount,true));
  nav.append(createProblemLink('pause'));
}
