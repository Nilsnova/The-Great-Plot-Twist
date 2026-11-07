// Public harbor bulletin: render supplied lines and dates; never infer world outcomes.
import {node,button} from '../helpers.js';
import {createServerCallState} from '../../ui/kit/server-call-state.js';
import {lisbonDateTime,durationUntil} from './logic.js';
import {normalizeHook,patternWords} from '../../world/hook/logic.js';
import './bulletin.css';

export function createBulletinScreen({onClose=()=>{},onRetry,now=Date.now}={}){
  const element=node('section','bulletin-screen'),status=node('p','bulletin-status'),lines=node('ol','bulletin-lines');
  status.setAttribute('role','status');
  const today=node('p','bulletin-day'),next=node('p','bulletin-next');
  const retryStatus=node('p','bulletin-retry-status');retryStatus.tabIndex=-1;
  const call=createServerCallState({messageElement:retryStatus,label:'bulletin',onRetry:typeof onRetry==='function'?retry:undefined,now,onChange:syncControls});
  const retryButton=call.element.querySelector('[data-focus="retry-server-call"]');retryButton.onclick=retry;
  const hookPanel=node('section','bulletin-hook'),hookTitle=node('h3',''),hookText=node('p',''),announceStatus=node('p','bulletin-hook-status');announceStatus.setAttribute('role','status');announceStatus.setAttribute('aria-live','polite');
  const announceButton=button('Announce flash sequence',toggleAnnouncements,{focus:'hook-announcements'});hookPanel.append(hookTitle,hookText,announceButton,announceStatus);hookPanel.hidden=true;
  const resets=node('details','bulletin-resets'),summary=node('summary','','What resets when'),resetList=node('ul');resets.append(summary,resetList);
  element.setAttribute('aria-label','Harbor bulletin notices');element.append(status,call.element,today,next,lines,hookPanel,resets);
  let model=null,nextAt=null,disposed=false,active=false,epoch=0,retrying=null;
  let callKey='',localFailure=false,focusFrame=null,focusGeneration=0;
  let hookKey='',hookModel=null,announcementIndex=0,announcementTimer=null,announcementEpoch=0;
  const retryable=()=>model?.status==='unavailable'||(model?.status==='ready'&&model.stale===true);
  function syncControls(){
    retryButton.disabled=!active||retrying!==null||retryButton.hidden||!call.read().canRetry;
    announceButton.disabled=!active||hookPanel.hidden||!normalizeHook(hookModel);
  }
  const requestKey=()=>JSON.stringify(model?.request??null);
  function cancelFocus(){focusGeneration++;if(focusFrame!==null)cancelAnimationFrame(focusFrame);focusFrame=null;}
  function focusFailure(){
    cancelFocus();if(typeof requestAnimationFrame!=='function')return;
    const owner=epoch,generation=focusGeneration;focusFrame=requestAnimationFrame(()=>{
      focusFrame=null;
      if(disposed||!active||owner!==epoch||generation!==focusGeneration||element.hidden||!element.isConnected
        ||element.closest('dialog')?.open===false||document.querySelector?.('.account-modal[open]'))return;
      (!retryButton.hidden&&!retryButton.disabled?retryButton:retryStatus).focus?.({preventScroll:true});
    });
  }
  function syncCall({force=false,focus=false}={}){
    if(disposed||!active||model?.status==='off')return;
    const pending=model?.status==='loading'||(retrying&&retryable()&&requestKey()===retrying.priorRequest);
    const key=JSON.stringify([pending,model?.status,model?.stale===true,model?.request??null,localFailure]);
    if(!force&&key===callKey){syncControls();return;}callKey=key;
    if(pending){cancelFocus();call.loading({read:true});}
    else if(model?.request||retryable()||localFailure){
      const request=model?.request??{reason:'not_connected',message:'The harbor bulletin is unavailable right now. Try again.'};
      const retryUntil=request.retryUntil;
      call.fail(request,request.reason==='rate_limited'&&Number.isFinite(retryUntil)
        ?{retryAfterMs:Math.min(86400000,Math.max(0,retryUntil-now()))}:undefined);
      if(focus)focusFailure();
    }else{cancelFocus();call.succeed();}
    syncControls();
  }
  function retry(){
    if(disposed||!active||!retryable()||typeof onRetry!=='function')return Promise.resolve(false);
    if(retrying)return retrying.promise;
    if(!call.read().canRetry)return Promise.resolve(false);
    const task={epoch,promise:null,priorRequest:requestKey()};retrying=task;localFailure=false;
    syncCall({force:true});
    const current=()=>!disposed&&active&&task.epoch===epoch&&retrying===task;
    const failed=()=>{if(current()&&retryable())localFailure=true;};
    task.promise=Promise.resolve().then(()=>current()?onRetry():null).then(result=>{
      if(result?.ok===false||result?.accepted===false)failed();return current();
    },()=>{failed();return false;}).finally(()=>{
      if(retrying!==task)return;const focus=current();retrying=null;
      if(!disposed&&active){syncCall({force:true,focus});syncControls();}
    });
    return task.promise;
  }
  function stopAnnouncements(message=''){
    announcementEpoch+=1;if(announcementTimer!==null)clearTimeout(announcementTimer);announcementTimer=null;announcementIndex=0;
    announceButton.textContent='Announce flash sequence';announceStatus.textContent=message;
  }
  function clearHook(){
    stopAnnouncements();hookKey='';hookModel=null;hookPanel.hidden=true;hookTitle.textContent=hookText.textContent='';
    announceButton.removeAttribute('aria-label');
  }
  function toggleAnnouncements(){
    if(disposed||!active||hookPanel.hidden)return;
    if(announcementTimer!==null){stopAnnouncements('Flash announcements stopped.');return;}
    const safe=normalizeHook(hookModel);if(!safe)return;const owner=announcementEpoch;announcementIndex=0;announceButton.textContent='Stop flash announcements';
    const speakNext=()=>{
      if(disposed||!active||owner!==announcementEpoch)return;
      if(announcementIndex>=safe.beam.pattern.length){stopAnnouncements('Flash sequence complete.');return;}
      const index=announcementIndex++,word=safe.beam.pattern[index];announceStatus.textContent=`${word==='short'?'Short':'Long'} flash, ${index+1} of ${safe.beam.pattern.length}.`;
      const duration=word==='short'?safe.beam.flash.shortSeconds:safe.beam.flash.longSeconds;
      announcementTimer=setTimeout(()=>{if(disposed||!active||owner!==announcementEpoch)return;announcementTimer=null;speakNext();},(duration+safe.beam.flash.gapSeconds)*1000);
    };speakNext();
  }
  function updateNext(){next.textContent=nextAt?`Next bulletin: ${lisbonDateTime(nextAt)} (${durationUntil(nextAt)})`:'Next bulletin time unavailable';}
  function update(view={}){
    if(disposed)return;
    model=view.bulletin??view;const bulletin=model??{};
    const message=typeof bulletin.message==='string'?bulletin.message:'';
    status.textContent='';if(!retryable())localFailure=false;
    lines.replaceChildren();resetList.replaceChildren();
    if(bulletin.status==='off'){epoch+=1;cancelFocus();call.clear();callKey='';clearHook();nextAt=null;element.hidden=true;syncControls();return;}
    element.hidden=false;
    if(bulletin.status!=='ready'){
      clearHook();nextAt=null;status.textContent=message||(bulletin.status==='unavailable'
        ?'The harbor bulletin is unavailable right now.':'The bulletin is not posted yet');
      today.hidden=true;next.hidden=true;lines.hidden=true;resets.hidden=true;syncCall({focus:true});syncControls();return;
    }
    status.textContent=message||(bulletin.stale===true?'This is the last posted bulletin. The latest update is unavailable.':'Posted');
    today.hidden=false;next.hidden=false;lines.hidden=false;resets.hidden=false;
    today.textContent=`Lisbon day ${bulletin.day?.id??'unavailable'} · bulletin day ${bulletin.day?.bulletinDay??'unavailable'}`;
    for(const item of bulletin.lines??[]){const li=node('li','');li.dataset.kind=item.kind;li.textContent=item.text;lines.append(li);}
    hookModel=bulletin.chapterTwoHook??null;hookPanel.hidden=!hookModel;if(!hookModel)clearHook();
    const nextHookKey=hookModel?JSON.stringify([hookModel.notice?.title,hookModel.notice?.text,hookModel.beam?.pattern,hookModel.beam?.flash]):'';
    if(nextHookKey!==hookKey){hookKey=nextHookKey;stopAnnouncements();if(hookModel){hookTitle.textContent=hookModel.notice?.title??'Distant signal';hookText.textContent=hookModel.notice?.text??'';announceButton.setAttribute('aria-label',`Announce flash sequence: ${patternWords(hookModel)}`);}}
    nextAt=bulletin.day?.nextBulletinAt??null;updateNext();
    for(const item of bulletin.day?.resets??[]){resetList.append(node('li','',`${item.when} · ${item.what}`));}
    syncCall({focus:true});syncControls();
  }
  function close(){
    if(disposed)return;active=false;epoch+=1;stopAnnouncements('Flash announcements stopped.');
    cancelFocus();call.clear();callKey='';localFailure=false;syncControls();
  }
  function setActive(value){if(disposed)return;if(value!==true){close();return;}active=true;syncCall({force:true});syncControls();}
  syncControls();
  return {element,update,setActive,tick(){if(!disposed&&active&&nextAt)updateNext();},close,dispose(){
    if(disposed)return;close();disposed=true;clearHook();model=null;nextAt=null;call.dispose();try{onClose();}finally{element.remove();}
  }};
}
