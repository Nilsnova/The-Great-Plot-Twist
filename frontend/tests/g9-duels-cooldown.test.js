// Actual adapter and common status DOM, injected route answers and a controlled client clock only.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

async function mount(page,{detailOnly=false,readbackWait=null}={}){
  // Freeze before creating adapter/status timers without a browser-RPC startup deadline.
  const installedAt=Date.parse('2026-11-07T00:00:00Z');
  await page.clock.install({time:installedAt});
  await page.clock.pauseAt(installedAt+60000);
  await page.evaluate(async options=>{
    const {createHttpAdapter}=await window.g20Import('/src/screens/duels/http-adapter.js');
    const {createStatus}=await window.g20Import('/src/screens/duels/panel-status.js');
    const now=()=>Date.now()+0.25,previousId=crypto.randomUUID();
    const proof=window.duelCooldown={posts:[],events:[],reads:0,details:0,identity:1,enabled:true,wait:options.readbackWait};
    const listeners=new Set(),good=data=>({ok:true,status:200,data});
    const rate=seconds=>({ok:false,status:429,code:'too_many_requests',retryAfterSeconds:seconds});
    const old={id:previousId,status:'open',you:'challenger'};
    const list=()=>({coins:120,heldCoins:0,incoming:[],openChallenges:[],
      yours:proof.posts.length?[]:[old],recent:proof.posts.length?[{...old,status:'finished'}]:[],
      rules:{},serverTime:new Date(now()).toISOString()});
    const request={
      publicGet:async path=>{proof.events.push(['GET',path]);return good({flags:{arena:proof.enabled}});},
      get:async path=>{
        proof.events.push(['GET',path]);
        if(path==='/api/duels'){
          proof.reads++;
          if(proof.posts.length&&proof.wait!==null){const seconds=proof.wait;proof.wait=null;return rate(seconds);}
          return good(list());
        }
        proof.details++;
        if(options.detailOnly&&proof.details===1)return rate(20);
        return good({duel:{id:previousId,status:'finished',yourSignals:['shade','shade','shade'],reveal:[]},coins:120});
      },
      post:async(path,body)=>{
        proof.events.push(['POST',path]);proof.posts.push(structuredClone(body));
        if(proof.posts.length===1)return rate(20);
        return good({duel:{id:crypto.randomUUID(),status:'open',yourSignals:[...body.signals]},coins:120});
      },
    };
    const adapter=proof.adapter=createHttpAdapter({request,now,getToken:()=>proof.identity===null?null:'generated-'+crypto.randomUUID(),
      getIdentity:()=>proof.identity,getFlags:()=>({arena:proof.enabled}),
      onIdentityChange:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}});
    const dialog=proof.dialog=document.createElement('dialog'),controls=document.createElement('fieldset');
    const submit=document.createElement('button');submit.textContent='Recorded challenge';submit.id='recorded-duel-submit';
    proof.ask={rounds:3,stake:0,signals:['shade','shade','shade']};
    submit.onclick=()=>{proof.pending=adapter.challenge(proof.ask);};controls.append(submit);
    const status=proof.status=createStatus({now,onRefresh:()=>adapter.refresh(),onRetry:()=>adapter.retry(),
      onWatch(){},onCooldown:value=>{controls.disabled=value;}});
    dialog.append(...status.elements,controls);document.body.append(dialog);
    const render=view=>{status.update(view,new Set());controls.disabled=status.blocked();};
    const stop=adapter.subscribe(render);render(adapter.read());dialog.showModal();await adapter.setVisible(true);
    proof.read=()=>({view:adapter.read(),blocked:status.blocked(),now:now(),posts:proof.posts.length,
      reads:proof.reads,details:proof.details,events:proof.events.map(([method,path])=>[method,path])});
    proof.close=async()=>{dialog.close();await adapter.setVisible(false);};
    proof.open=async()=>{dialog.showModal();await adapter.setVisible(true);};
    proof.changeIdentity=value=>{proof.identity=value;for(const fn of listeners)fn();};
    proof.dispose=()=>{stop();status.dispose();adapter.dispose();dialog.remove();};
  },{detailOnly,readbackWait});
}
const read=page=>page.evaluate(()=>window.duelCooldown.read());
const call=page=>page.locator('.server-call');
const retry=page=>page.getByRole('button',{name:'Retry duel request',exact:true});
async function send(page){await page.evaluate(async()=>{await window.duelCooldown.adapter.challenge(window.duelCooldown.ask);});}
async function dispose(page){await page.evaluate(()=>window.duelCooldown.dispose());}

it('keeps POST429 through successful list/detail readback and close/reopen until the original exact deadline',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    try{
      await send(page);let state=await read(page);const until=state.view.notice.retryUntil;
      expect(state.events.slice(2)).toEqual([['POST','/api/duels'],['GET','/api/duels'],
        ['GET',state.events.at(-1)[1]]]);
      expect(state.details).toBe(1);expect(state.reads).toBe(2);expect(state.posts).toBe(1);
      expect(until).toBe(state.now+20000);expect(until%1).toBe(0.25);
      expect(state.view).toMatchObject({coins:120,heldCoins:0,canRetry:false,notice:{status:429}});
      expect(state.blocked).toBe(true);expect(await retry(page).isDisabled()).toBe(true);
      expect(await call(page).getAttribute('data-state')).toBe('rate_limited');
      await page.clock.runFor(1500);await page.evaluate(()=>window.duelCooldown.close());
      expect((await read(page)).view).toMatchObject({mode:'loading',coins:null,selected:null,sealed:{}});
      await page.evaluate(()=>window.duelCooldown.open());state=await read(page);
      expect(state.view.notice.retryUntil).toBe(until);expect(state.blocked).toBe(true);
      await page.clock.runFor(18499);state=await read(page);
      expect(state.now).toBe(until-1);expect(state.view.notice.retryUntil).toBe(until);expect(state.posts).toBe(1);
      const before={reads:state.reads,details:state.details};
      await page.evaluate(async()=>{
        const proof=window.duelCooldown;
        document.querySelector('.server-call button[data-focus="retry-server-call"]').dispatchEvent(new MouseEvent('click'));
        await proof.adapter.retry();await proof.adapter.refresh();await proof.adapter.select('recorded-placeholder');
        await proof.adapter.challenge(proof.ask);
      });
      state=await read(page);expect(state.posts).toBe(1);expect({reads:state.reads,details:state.details}).toEqual(before);
      expect(state.blocked).toBe(true);expect(await retry(page).isDisabled()).toBe(true);
      expect(await page.locator('#recorded-duel-submit').isDisabled()).toBe(true);
      await page.clock.runFor(1);state=await read(page);expect(state.now).toBe(until);expect(state.blocked).toBe(false);
      expect(await retry(page).isEnabled()).toBe(true);expect(await page.locator('#recorded-duel-submit').isEnabled()).toBe(true);
      expect(state.posts).toBe(1);await page.locator('#recorded-duel-submit').click();
      await page.evaluate(()=>window.duelCooldown.pending);expect((await read(page)).posts).toBe(2);
    }finally{await dispose(page);}
  });
});

it.each([3,30])('retains the stronger original/new deadline when the mandatory readback also returns429(%ss)',async seconds=>{
  await evaluate.withPage(async page=>{
    await mount(page,{readbackWait:seconds});
    try{
      const start=(await read(page)).now;await send(page);const state=await read(page);
      expect(state.posts).toBe(1);expect(state.reads).toBe(2);
      expect(state.view.notice.retryUntil).toBe(start+Math.max(20,seconds)*1000);
      expect(state.blocked).toBe(true);expect(await retry(page).isDisabled()).toBe(true);
      await send(page);expect((await read(page)).posts).toBe(1);
    }finally{await dispose(page);}
  });
});

it('keeps detail-read429 metadata and blocks forced work until its same original deadline',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page,{detailOnly:true});
    try{
      await page.evaluate(()=>window.duelCooldown.adapter.select('recorded-placeholder'));
      const start=await read(page),until=start.view.notice.retryUntil;
      expect(start.view.notice).toMatchObject({code:'too_many_requests',status:429,retryAfterSeconds:20});
      expect(start.blocked).toBe(true);expect(await retry(page).isDisabled()).toBe(true);
      await page.clock.runFor(19999);await page.evaluate(()=>window.duelCooldown.adapter.select('recorded-placeholder'));
      expect((await read(page)).details).toBe(1);expect((await read(page)).view.notice.retryUntil).toBe(until);
      await page.clock.runFor(1);await page.evaluate(()=>window.duelCooldown.adapter.select('recorded-placeholder'));
      const ended=await read(page);expect(ended.details).toBe(2);expect(ended.blocked).toBe(false);expect(ended.posts).toBe(0);
    }finally{await dispose(page);}
  });
});

it.each(['identity','flag','dispose'])('clears the safe429 owner at a full %s boundary',async boundary=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    try{
      await send(page);expect((await read(page)).blocked).toBe(true);
      await page.evaluate(async boundary=>{
        const proof=window.duelCooldown;
        if(boundary==='identity'){proof.changeIdentity(null);proof.changeIdentity(2);await proof.adapter.setVisible(false);await proof.adapter.setVisible(true);}
        if(boundary==='flag'){
          proof.enabled=false;await proof.adapter.refresh();await proof.adapter.retry();await proof.adapter.challenge(proof.ask);
        }
        if(boundary==='dispose')proof.adapter.dispose();
      },boundary);
      expect((await read(page)).view.notice?.retryUntil).toBeUndefined();
      expect((await read(page)).posts).toBe(1);
    }finally{await dispose(page);}
  });
});
