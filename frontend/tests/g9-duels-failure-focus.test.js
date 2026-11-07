// Real native Panel/ViewStore; only the adapter answer is held. No API, rule or outcome is simulated.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const native=browserHarness(),dialog='.duel-modal[open]';

async function mount(page){
  await page.evaluate(async()=>{
    await window.g20Import('/src/ui/base.css');await window.g20Import('/src/ui/kit/kit.css');
    await window.g20Import('/src/screens/duels/duels.css');
    const {createPanel}=await window.g20Import('/src/screens/duels/panel.js');
    const {createViewStore}=await window.g20Import('/src/screens/duels/view-store.js');
    const {createModal}=await window.g20Import('/src/ui/kit/modal.js');
    const canvas=document.createElement('canvas');canvas.tabIndex=0;document.body.append(canvas);canvas.focus();
    const store=createViewStore({mode:'ready',coins:120}),writes=[];let pending=null;
    const proof={store,canvas,writes,attention:null};
    const adapter={read:store.read,subscribe:store.subscribe,setVisible:async()=>{},refresh:async()=>({ok:true,view:store.read()}),
      retry:async()=>({ok:false,view:store.read()}),select:async()=>({ok:false,view:store.read()}),
      challenge(args){writes.push(structuredClone(args));return new Promise(resolve=>{pending=resolve;});},
      answer:async()=>({ok:false,view:store.read()}),cancel:async()=>({ok:false,view:store.read()}),dispose:store.dispose};
    const panel=createPanel({container:document.body,resetInput(){},focus:()=>canvas.focus()},adapter,()=>{});
    Object.assign(proof,{panel,
      release(){store.set({canRetry:true});store.notify('database_unavailable',{status:0});
        const finish=pending;pending=null;finish?.({ok:false,code:'database_unavailable',view:store.read()});},
      openAttention(){const button=document.createElement('button');button.textContent='Recorded attention action';
        proof.attention=createModal({title:'Recorded attention',body:button});proof.attention.open(document.body,button);},
      cleanup(){proof.attention?.dispose();panel.dispose();canvas.remove();}});
    window.arenaFocusProof=proof;await panel.open();
  });
  const root=page.locator(dialog);
  await root.getByRole('tab',{name:'New challenge',exact:true}).click();
  const rounds=root.locator('.duel-form .duel-round');expect(await rounds.count()).toBe(3);
  for(let index=0;index<3;index++)await rounds.nth(index).locator('input[type=radio][value=shade]').check();
}
async function send(page){
  const button=page.locator(dialog).getByRole('button',{name:'Seal and send',exact:true});
  await button.focus();await button.click();
  await page.waitForFunction(()=>window.arenaFocusProof.writes.length===1);
}
const retry=page=>page.locator(dialog).getByRole('button',{name:'Retry duel request',exact:true});
const cleanup=page=>page.evaluate(()=>window.arenaFocusProof?.cleanup());

it('repairs genuine disabled-send focus loss to the available failure action without resending',async()=>{
  await native.withPage(async page=>{
    await mount(page);
    try{
      await send(page);await page.evaluate(()=>window.arenaFocusProof.release());
      await retry(page).waitFor({state:'visible'});
      await page.waitForFunction(()=>document.activeElement===document.querySelector('.duel-modal[open] .server-call [data-focus="retry-server-call"]'),null,{timeout:3000});
      expect(await retry(page).evaluate(button=>document.activeElement===button)).toBe(true);
      expect(await page.evaluate(()=>({writes:window.arenaFocusProof.writes.length,
        open:window.arenaFocusProof.panel.element.open}))).toEqual({writes:1,open:true});
    }finally{await cleanup(page);}
  });
});

it.each(['valid-focus','attention','closed','reopened'])
('does not steal %s ownership when the held failure returns',async boundary=>{
  await native.withPage(async page=>{
    await mount(page);
    try{
      await send(page);
      if(boundary==='valid-focus')await page.locator(dialog).getByRole('tab',{name:'Rules',exact:true}).focus();
      if(boundary==='attention')await page.evaluate(()=>window.arenaFocusProof.openAttention());
      if(boundary==='closed')await page.evaluate(()=>window.arenaFocusProof.panel.close());
      if(boundary==='reopened'){
        await page.evaluate(async()=>{const p=window.arenaFocusProof;p.panel.close();await p.panel.open();});
        await page.locator(dialog).getByRole('tab',{name:'Rules',exact:true}).focus();
      }
      await page.evaluate(()=>window.arenaFocusProof.release());
      if(boundary==='closed'){
        await page.locator(dialog).waitFor({state:'hidden'});
        await page.waitForFunction(()=>document.activeElement===window.arenaFocusProof.canvas,null,{timeout:3000});
        expect(await page.evaluate(()=>document.activeElement===window.arenaFocusProof.canvas)).toBe(true);
      }else if(boundary==='attention'){
        expect(await page.getByRole('button',{name:'Recorded attention action',exact:true})
          .evaluate(button=>document.activeElement===button)).toBe(true);
      }else{
        expect(await page.locator(dialog).getByRole('tab',{name:'Rules',exact:true})
          .evaluate(button=>document.activeElement===button)).toBe(true);
      }
      expect(await page.evaluate(()=>window.arenaFocusProof.writes.length)).toBe(1);
    }finally{await cleanup(page);}
  });
});
