// Public harbor bulletin: render supplied lines and dates; never infer world outcomes.
import {node} from '../helpers.js';
import {lisbonDateTime,durationUntil} from './logic.js';
import './bulletin.css';

const weatherLink='https://open-meteo.com/';
const licenceLink='https://creativecommons.org/licenses/by/4.0/';
function credit(weather){
  const row=node('p','bulletin-credit');
  if(!weather?.attribution)return row;
  const source=node('a','',weather.attribution);source.href=weatherLink;source.target='_blank';source.rel='noopener noreferrer';
  const licence=node('a','','CC BY 4.0');licence.href=licenceLink;licence.target='_blank';licence.rel='noopener noreferrer';
  row.append(source,node('span','',' · '),licence);return row;
}
export function createBulletinScreen({onClose=()=>{}}={}){
  const element=node('section','bulletin-screen'),status=node('p','bulletin-status'),lines=node('ol','bulletin-lines');
  status.setAttribute('role','status');
  const today=node('p','bulletin-day'),next=node('p','bulletin-next'),weatherCredit=node('div','bulletin-weather-credit');
  const resets=node('details','bulletin-resets'),summary=node('summary','','What resets when'),resetList=node('ul');resets.append(summary,resetList);
  element.setAttribute('aria-label','Harbor bulletin notices');element.append(status,today,next,weatherCredit,lines,resets);
  let model=null,nextAt=null,disposed=false;
  function updateNext(){next.textContent=nextAt?`Next bulletin: ${lisbonDateTime(nextAt)} (${durationUntil(nextAt)})`:'Next bulletin time unavailable';}
  function update(view={}){
    model=view.bulletin??view;const bulletin=model??{};
    status.textContent='';lines.replaceChildren();resetList.replaceChildren();weatherCredit.replaceChildren();
    if(bulletin.status==='off'){nextAt=null;element.hidden=true;return;}
    element.hidden=false;
    if(bulletin.status==='loading'){nextAt=null;status.textContent='The bulletin is not posted yet';today.hidden=true;next.hidden=true;weatherCredit.hidden=true;lines.hidden=true;resets.hidden=true;return;}
    if(bulletin.status==='unavailable'){nextAt=null;status.textContent='The harbor bulletin is unavailable right now.';today.hidden=true;next.hidden=true;weatherCredit.hidden=true;lines.hidden=true;resets.hidden=true;return;}
    if(bulletin.status!=='ready'){nextAt=null;status.textContent='The bulletin is not posted yet';today.hidden=true;next.hidden=true;weatherCredit.hidden=true;lines.hidden=true;resets.hidden=true;return;}
    status.textContent='Posted';today.hidden=false;next.hidden=false;weatherCredit.hidden=false;lines.hidden=false;resets.hidden=false;
    today.textContent=`Lisbon day ${bulletin.day?.id??'unavailable'} · bulletin day ${bulletin.day?.bulletinDay??'unavailable'}`;
    for(const item of bulletin.lines??[]){const li=node('li','');li.dataset.kind=item.kind;li.textContent=item.text;lines.append(li);}
    nextAt=bulletin.day?.nextBulletinAt??null;updateNext();
    weatherCredit.append(credit(bulletin.weather));
    for(const item of bulletin.day?.resets??[]){resetList.append(node('li','',`${item.when} · ${item.what}`));}
  }
  return {element,update,tick(){if(!disposed&&nextAt)updateNext();},dispose(){if(disposed)return;disposed=true;onClose();element.remove();}};
}
