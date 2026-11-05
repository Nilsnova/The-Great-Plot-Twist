// Lighthouse intro controller. Its only API request reads the unchanged public S1 story.
import {createModal,createButton} from '../ui/kit/index.js';
import {node} from '../ui/kit/dom.js';
import {createIntroAdapter,introHotspots} from './intro-adapter.js';
import {introJournal} from './intro-journal.js';
import {createIntroView} from './intro-view.js';
export function createIntro(ctx) {
  let adapter=null,active=false,disposed=false,request=0,abort=null,hotspot='cottage';
  const loading=node('div','intro-loading'),copy=node('p','','The story is coming ashore…'),retry=createButton({label:'Try again',onClick:()=>load()});loading.append(copy,retry.element);
  const view=createIntroView({onAction:perform,onRestart(){adapter.reset();show();},onClose:close});
  const modal=createModal({title:'The Keeper’s Last Log',body:loading,onCancel:close,onClose(){active=false;ctx.resetInput?.();}});modal.element.classList.add('intro-modal');
  function close(){active=false;request++;abort?.abort();modal.close();ctx.resetInput?.();}
  function show(notice){modal.setContent(view.element);view.update(adapter.view,adapter.actions,notice);view.focus();}
  function visit() {const result=adapter.state.ended?null:adapter.visit(hotspot);show(result&&!result.accepted?result.message:undefined);}
  async function load() {
    const token=++request;abort?.abort();abort=new AbortController();const controller=abort;modal.setContent(loading);retry.element.hidden=true;copy.textContent='The story is coming ashore…';
    const timer=setTimeout(()=>controller.abort(),5000);
    try {
      const response=await fetch('/api/content/intro-story',{signal:controller.signal,headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error('Story unavailable');const story=await response.json();
      if(!story?.scenes?.[story.start]||!story.items)throw new Error('Story unavailable');
      if(disposed||token!==request)return;adapter=createIntroAdapter(story,introJournal());visit();
    }catch(error){if(!disposed&&token===request&&active){copy.textContent='The story could not reach the island. Please try again.';retry.element.hidden=false;retry.element.focus();}}
    finally{clearTimeout(timer);}
  }
  function open(id) {
    if(disposed||ctx.world.busy)return false;hotspot=id;active=true;ctx.resetInput?.();modal.open(ctx.container);
    if(adapter)visit();else load();return true;
  }
  function perform(id) {
    const wasEnded=adapter.state.ended,result=adapter.perform(id);show(result.message);
    if(result.accepted&&!wasEnded&&adapter.state.ended)ctx.emit({type:'intro_ended',ending:adapter.state.scene});
  }
  const stop=ctx.on('interact',event=>{if(event.place==='lighthouse_isle'&&introHotspots.includes(event.id))open(event.id);});
  return {get active(){return active;},get actions(){return adapter?.actions??[];},get state(){return adapter?.state??null;},
    open,close,dispose(){if(disposed)return;disposed=true;stop();close();view.dispose();retry.dispose();modal.dispose();}};
}
