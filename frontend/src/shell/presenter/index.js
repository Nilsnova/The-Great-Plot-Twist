// Presenter controls, beat list and speaking notes for the local class tour.
import './presenter.css';
import { createButton } from '../../ui/kit/button.js';
import { node } from '../../ui/kit/dom.js';

export function createPresenter({steps,notes,onAction}) {
  const element=node('section','presenter-controls'),toolbar=node('div','presenter-toolbar'),beatPanel=node('section','presenter-beat-list'),notesPanel=node('section','presenter-speaker-notes');
  const listButton=createButton({label:'Beat list · H',variant:'quiet',onClick:()=>toggle(beatPanel)});
  const notesButton=createButton({label:'Speaker notes · N',variant:'quiet',onClick:()=>toggle(notesPanel)});
  const backButton=createButton({label:'Previous · ←',variant:'quiet',onClick:()=>onAction('back')});
  const nextButton=createButton({label:'Next · Space',onClick:()=>onAction('next')});
  const pauseButton=createButton({label:'Pause · P',variant:'quiet',onClick:()=>onAction('pause')});
  const restartButton=createButton({label:'Restart · R',variant:'quiet',onClick:()=>onAction('restart')});
  const blankButton=createButton({label:'Blank · B',variant:'quiet',onClick:()=>setBlank(!blank)});
  const status=node('p','presenter-control-status');status.setAttribute('role','status');
  const listHeading=node('h3','','Tour beats'),notesHeading=node('h3','','Speaker notes');
  const list=node('ol'),noteList=node('ul'),blankScreen=node('dialog','presenter-blank');blankScreen.setAttribute('aria-label','Presentation blanked. Press B or Escape to restore the presentation.');blankScreen.tabIndex=-1;
  beatPanel.hidden=true;notesPanel.hidden=true;element.hidden=true;
  let active=false,paused=false,index=-1,blank=false,disposed=false,lastStatus='',notesFor='',lastIndex=-2,lastActive=null,lastPaused=null,lastBackDisabled=null,lastNextDisabled=null,lastRestartDisabled=null;
  function toggle(panel){panel.hidden=!panel.hidden;if(!panel.hidden)requestAnimationFrame(()=>panel.scrollIntoView({block:'nearest',inline:'nearest'}));}
  function setButton(button,key,value){if(button.element.dataset[key]===String(value))return;button.element.dataset[key]=String(value);button.update({[key==='label'?'label':'disabled']:value});}
  let blankOpener=null;
  function setBlank(value){
    const next=!!value;if(next===blank)return;blank=next;
    if(blank){blankOpener=document.activeElement;document.body.classList.add('presenter-blanking');if(!blankScreen.open)blankScreen.showModal();blankScreen.focus({preventScroll:true});}
    else {document.body.classList.remove('presenter-blanking');if(blankScreen.open)blankScreen.close();const opener=blankOpener;blankOpener=null;if(opener?.isConnected)opener.focus({preventScroll:true});}
    blankButton.update({label:blank?'Restore screen · B':'Blank · B'});
  }
  blankScreen.addEventListener('cancel',event=>{event.preventDefault();setBlank(false);});
  blankScreen.addEventListener('close',()=>{
    // A previous close event can arrive after the screen has been blanked again.
    if(blankScreen.open)return;
    document.body.classList.remove('presenter-blanking');
    if(blank){blank=false;blankButton.update({label:'Blank · B'});}
    const opener=blankOpener;blankOpener=null;
    if(opener?.isConnected)opener.focus({preventScroll:true});
  });
  function jump(next){if(next===index)return;onAction('jump',next);}
  function onKey(event){
    if(blank&&event.code==='Escape'){
      event.preventDefault();event.stopImmediatePropagation();setBlank(false);return;
    }
    if(!active||disposed||event.altKey||event.ctrlKey||event.metaKey||event.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    let action=null;
    if(event.code==='Space'||event.code==='ArrowRight')action='next';
    else if(event.code==='ArrowLeft')action='back';
    else if(event.code==='KeyP')action='pause';
    else if(event.code==='KeyB')action='blank';
    else if(event.code==='KeyR')action='restart';
    else if(event.code==='KeyH')action='list';
    else if(event.code==='KeyN')action='notes';
    else if(/^Digit[1-9]$/.test(event.code))action='jump';
    if(!action)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    if(event.repeat)return;
    if(action==='list')toggle(beatPanel);
    else if(action==='notes')toggle(notesPanel);
    else if(action==='blank')setBlank(!blank);
    else if(action==='jump')jump(Number(event.code.slice(-1))-1);
    else onAction(action);
  }
  steps.forEach((step,stepIndex)=>{
    const item=node('li'),button=createButton({label:`${stepIndex+1}. ${step.title}`,variant:'quiet',onClick:()=>jump(stepIndex)});
    item.append(button.element);list.append(item);
  });
  element.setAttribute('aria-label','Presenter controls');beatPanel.setAttribute('aria-label','Tour beat list');notesPanel.setAttribute('aria-label','Speaker notes');
  beatPanel.append(listHeading,list);notesPanel.append(notesHeading,noteList);
  toolbar.append(backButton.element,nextButton.element,pauseButton.element,blankButton.element,restartButton.element,listButton.element,notesButton.element);
  element.append(toolbar,status,beatPanel,notesPanel);document.body.append(blankScreen);
  window.addEventListener('keydown',onKey,true);
  function update(data={}){
    active=!!data.active;paused=!!data.paused;index=Number.isInteger(data.index)?data.index:-1;
    element.hidden=!active;
    if(lastActive!==active){element.hidden=!active;lastActive=active;if(!active){beatPanel.hidden=true;notesPanel.hidden=true;}}
    if(!active&&blank)setBlank(false);
    const current=data.step,label=current?`Beat ${index+1} of ${steps.length} · ${paused?'Paused':current.title}`:'Presenter controls are ready.';
    if(label!==lastStatus){status.textContent=label;lastStatus=label;}
    if(lastPaused!==paused){setButton(pauseButton,'label',paused?'Resume · P':'Pause · P');lastPaused=paused;}
    const backDisabled=index<=0,nextDisabled=!active||!!data.changing,restartDisabled=!active||!!data.changing;
    if(lastBackDisabled!==backDisabled){setButton(backButton,'disabled',backDisabled);lastBackDisabled=backDisabled;}
    if(lastNextDisabled!==nextDisabled){setButton(nextButton,'disabled',nextDisabled);lastNextDisabled=nextDisabled;}
    if(lastRestartDisabled!==restartDisabled){setButton(restartButton,'disabled',restartDisabled);lastRestartDisabled=restartDisabled;}
    if(current&&notesFor!==current.id){noteList.replaceChildren(...(notes[current.id]??[]).map(text=>node('li','',text)));notesFor=current.id;}
    if(index!==lastIndex){list.querySelectorAll('button').forEach((button,buttonIndex)=>button.setAttribute('aria-current',String(buttonIndex===index)));lastIndex=index;}
  }
  return {element,update,setBlank,dispose(){if(disposed)return;disposed=true;window.removeEventListener('keydown',onKey,true);setBlank(false);for(const button of [backButton,nextButton,pauseButton,blankButton,restartButton,listButton,notesButton])button.dispose();blankScreen.remove();element.remove();}};
}
