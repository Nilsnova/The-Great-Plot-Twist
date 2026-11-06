// A prepared external link preserves the user's click gesture; it never submits an issue.
import {node} from '../ui/kit/dom.js';
import {createProblemUrl} from './report-url.js';
import {noteUiAction,readDiagnostics} from './runtime.js';
export function createProblemLink(openedFrom){
  const link=node('a','kit-button kit-quiet problem-report','Report a problem');
  requestAnimationFrame(()=>{if(link.isConnected)noteUiAction(openedFrom);});
  link.target='_blank';link.rel='noopener noreferrer';
  const refresh=()=>{link.href=createProblemUrl(readDiagnostics());};
  link.addEventListener('focus',refresh);link.addEventListener('click',refresh);refresh();return link;
}
