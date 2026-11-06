// Tiny opt-in launcher. The full screen, recordings and practice transport stay lazy.
import {api} from '../../online/api.js';
import {session} from '../../online/session.js';
import {isFestivalRehearsal} from './logic.js';
export function createFestivalEntry(ctx){
  const local=isFestivalRehearsal(typeof location==='undefined'?'':location.search);
  let enabled=local,panel=null,pending=null,disposed=false,arena=null;
  function updateMenu(){const menu=ctx.container.querySelector('.shell-screen .shell-menu'),visible=enabled&&['title','pause'].includes(ctx.shell?.()?.mode);const previous=menu?.querySelector('[data-festival-launch]');if(visible&&menu&&!previous){const button=document.createElement('button');button.type='button';button.className='kit-button kit-quiet';button.textContent='Lantern festival';button.dataset.festivalLaunch='true';button.addEventListener('click',()=>entry.open());menu.append(button);}else if(!visible)previous?.remove();}
  const shellBody=ctx.container.querySelector('.shell-screen .kit-modal-body'),observer=new MutationObserver(updateMenu);if(shellBody)observer.observe(shellBody,{childList:true});
  function availability(value){ctx.runtime?.()?.setFestivalAvailable?.(value);ctx.onAvailability?.(value);updateMenu();}
  async function openDuel(duelId){try{arena=await import('../duels/index.js');if(!disposed)await arena.openArena({container:ctx.container,getToken:session.getToken,focus:ctx.focus,resetInput:()=>ctx.runtime?.()?.resetInput?.(),duelId});}catch{ctx.caption?.('Lantern Duels could not open. Please try again.');}}
  async function check(){if(local){availability(true);return true;}try{const answer=await api.get('/api/config');enabled=answer.ok&&answer.data?.flags?.festival===true;}catch{enabled=false;}if(!disposed)availability(enabled);return enabled;}
  async function build(){const[{createFestivalPanel},adapter]=await Promise.all([import('./panel.js'),local?import('./local.js').then(module=>module.createLocalFestival()):import('./adapter.js').then(module=>module.createFestivalAdapter({api,session}))]);if(disposed){adapter.dispose();return null;}panel=createFestivalPanel({...ctx,resetInput:()=>ctx.runtime?.()?.resetInput?.(),openDuel:ctx.openDuel??openDuel},adapter);return panel;}
  const entry={get available(){return enabled;},get active(){return panel?.active===true||arena?.isArenaOpen()===true;},check,
    async open(){if(!enabled&&!(await check()))return;pending??=build().catch(()=>{pending=null;ctx.caption?.('The festival could not open. Please try again.');return null;});const screen=await pending;if(!disposed)screen?.open();},
    close(){panel?.close();},dispose(){disposed=true;observer.disconnect();arena?.disposeArena();ctx.container.querySelector('[data-festival-launch]')?.remove();panel?.dispose();},
  };
  void check();
  return entry;
}
