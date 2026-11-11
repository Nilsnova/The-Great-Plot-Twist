// Keep synthesis out of the cold title. One trusted gesture loads and unlocks the audio owner.
export function createLazyAudio(ctx){
  let instance=null,pending=null,disposed=false,screen='title';
  const events=['pointerdown','keydown','click'];
  function stopListening(){for(const name of events)window.removeEventListener(name,unlock,true);}
  function unlock(event){
    if(disposed||!event.isTrusted)return;
    if(instance){instance.unlock(event);return;}
    if(pending)return;
    pending=import('./controller.js').then(module=>{
      if(disposed)return;
      instance=module.createAudio(ctx);instance.setScreen(screen);
      instance.unlock(event);stopListening();
    }).catch(()=>{pending=null;ctx.caption('Sound unavailable. All cues remain visible.');});
  }
  for(const name of events)window.addEventListener(name,unlock,true);
  return {
    get state(){return instance?.state??'locked';},
    cue(name){instance?.cue(name);},
    playVoice(url,options){return instance?.playVoice?.(url,options)??null;},
    setScreen(mode){screen=mode;instance?.setScreen(mode);},
    update(dt,state){instance?.update(dt,state);},
    dispose(){if(disposed)return;disposed=true;stopListening();instance?.dispose();},
  };
}
