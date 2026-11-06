// Lazy keyboard help owns cancellation while loading, as well as the opened native modal.
export function createShortcutsHost(container){
  let overlay=null,disposed=false,pending=null,requested=false,request=0,notice=null;
  function close(){request++;requested=false;overlay?.close();notice?.remove();notice=null;}
  async function open(){
    const token=++request;requested=true;
    try{
      pending??=import('./hints/shortcuts.js').then(module=>{if(!disposed)overlay=module.createShortcutsOverlay();});
      await pending;if(!disposed&&requested&&token===request){requested=false;overlay?.open(container);}
    }catch{
      pending=null;if(disposed||token!==request)return;requested=false;
      notice=document.createElement('p');notice.className='case-loading';notice.setAttribute('role','status');
      notice.textContent='Shortcuts could not load. Press ? to try again.';container.append(notice);
    }
  }
  const key=event=>{
    if(event.key!=='?'||event.repeat||event.target?.matches?.('input,textarea,select,[contenteditable]'))return;
    event.preventDefault();notice?.remove();notice=null;void open();
  };
  window.addEventListener('keydown',key);
  return {open,get active(){return requested||!!overlay?.element.open;},close,
    dispose(){disposed=true;close();window.removeEventListener('keydown',key);overlay?.dispose();},
  };
}
