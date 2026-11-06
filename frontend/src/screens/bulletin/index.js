// Public harbor bulletin: render supplied lines and dates; never infer world outcomes.
import {node,button} from '../helpers.js';
import {lisbonDateTime,durationUntil} from './logic.js';
import {normalizeHook,patternWords} from '../../world/hook/logic.js';
import './bulletin.css';

export function createBulletinScreen({onClose=()=>{}}={}){
  const element=node('section','bulletin-screen'),status=node('p','bulletin-status'),lines=node('ol','bulletin-lines');
  status.setAttribute('role','status');
  const today=node('p','bulletin-day'),next=node('p','bulletin-next');
  const hookPanel=node('section','bulletin-hook'),hookTitle=node('h3',''),hookText=node('p',''),announceStatus=node('p','bulletin-hook-status');announceStatus.setAttribute('role','status');announceStatus.setAttribute('aria-live','polite');
  const announceButton=button('Announce flash sequence',toggleAnnouncements,{focus:'hook-announcements'});hookPanel.append(hookTitle,hookText,announceButton,announceStatus);hookPanel.hidden=true;
  const resets=node('details','bulletin-resets'),summary=node('summary','','What resets when'),resetList=node('ul');resets.append(summary,resetList);
  element.setAttribute('aria-label','Harbor bulletin notices');element.append(status,today,next,lines,hookPanel,resets);
  let model=null,nextAt=null,disposed=false,hookKey='',hookModel=null,announcementIndex=0,announcementTimer=null;
  function stopAnnouncements(message=''){
    if(announcementTimer!==null)clearTimeout(announcementTimer);announcementTimer=null;announcementIndex=0;
    announceButton.textContent='Announce flash sequence';announceStatus.textContent=message;
  }
  function toggleAnnouncements(){
    if(announcementTimer!==null){stopAnnouncements('Flash announcements stopped.');return;}
    const safe=normalizeHook(hookModel);if(!safe)return;announcementIndex=0;announceButton.textContent='Stop flash announcements';
    const speakNext=()=>{
      if(disposed)return;
      if(announcementIndex>=safe.beam.pattern.length){stopAnnouncements('Flash sequence complete.');return;}
      const index=announcementIndex++,word=safe.beam.pattern[index];announceStatus.textContent=`${word==='short'?'Short':'Long'} flash, ${index+1} of ${safe.beam.pattern.length}.`;
      const duration=word==='short'?safe.beam.flash.shortSeconds:safe.beam.flash.longSeconds;
      announcementTimer=setTimeout(()=>{announcementTimer=null;speakNext();},(duration+safe.beam.flash.gapSeconds)*1000);
    };speakNext();
  }
  function updateNext(){next.textContent=nextAt?`Next bulletin: ${lisbonDateTime(nextAt)} (${durationUntil(nextAt)})`:'Next bulletin time unavailable';}
  function update(view={}){
    model=view.bulletin??view;const bulletin=model??{};
    status.textContent='';lines.replaceChildren();resetList.replaceChildren();
    if(bulletin.status==='off'){stopAnnouncements();hookKey='';hookModel=null;hookPanel.hidden=true;nextAt=null;element.hidden=true;return;}
    element.hidden=false;
    if(bulletin.status==='loading'){stopAnnouncements();nextAt=null;hookPanel.hidden=true;status.textContent='The bulletin is not posted yet';today.hidden=true;next.hidden=true;lines.hidden=true;resets.hidden=true;return;}
    if(bulletin.status==='unavailable'){stopAnnouncements();nextAt=null;hookPanel.hidden=true;status.textContent='The harbor bulletin is unavailable right now.';today.hidden=true;next.hidden=true;lines.hidden=true;resets.hidden=true;return;}
    if(bulletin.status!=='ready'){stopAnnouncements();nextAt=null;hookPanel.hidden=true;status.textContent='The bulletin is not posted yet';today.hidden=true;next.hidden=true;lines.hidden=true;resets.hidden=true;return;}
    status.textContent='Posted';today.hidden=false;next.hidden=false;lines.hidden=false;resets.hidden=false;
    today.textContent=`Lisbon day ${bulletin.day?.id??'unavailable'} · bulletin day ${bulletin.day?.bulletinDay??'unavailable'}`;
    for(const item of bulletin.lines??[]){const li=node('li','');li.dataset.kind=item.kind;li.textContent=item.text;lines.append(li);}
    hookModel=bulletin.chapterTwoHook??null;hookPanel.hidden=!hookModel;
    const nextHookKey=hookModel?JSON.stringify([hookModel.notice?.title,hookModel.notice?.text,hookModel.beam?.pattern,hookModel.beam?.flash]):'';
    if(nextHookKey!==hookKey){hookKey=nextHookKey;stopAnnouncements();if(hookModel){hookTitle.textContent=hookModel.notice?.title??'Distant signal';hookText.textContent=hookModel.notice?.text??'';announceButton.setAttribute('aria-label',`Announce flash sequence: ${patternWords(hookModel)}`);}}
    nextAt=bulletin.day?.nextBulletinAt??null;updateNext();
    for(const item of bulletin.day?.resets??[]){resetList.append(node('li','',`${item.when} · ${item.what}`));}
  }
  return {element,update,tick(){if(!disposed&&nextAt)updateNext();},close(){stopAnnouncements('Flash announcements stopped.');},dispose(){if(disposed)return;disposed=true;stopAnnouncements();onClose();element.remove();}};
}
