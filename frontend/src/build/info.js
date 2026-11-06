// Readable build details shared by Settings and Credits.
const buildStamp=__BUILD_STAMP__;
import {node} from '../ui/kit/dom.js';
export function createBuildInfo(){
  const element=node('section','build-info');element.setAttribute('aria-label','Build information');
  const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',dateStyle:'medium',timeStyle:'short'}).format(new Date(buildStamp.builtAt));
  element.append(node('strong','',`Build ${buildStamp.sha}`),node('p','',`Built ${time} · Lisbon time`));
  element.dataset.sha=buildStamp.sha;element.dataset.builtAt=buildStamp.builtAt;return element;
}
