// Public, recorded DOM states: page controls never become accepted story moves.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

async function mount(page,{ended=true,wide=false}={}){
  await page.setViewportSize(wide?{width:1280,height:800}:{width:320,height:568});
  await page.evaluate(async({ended})=>{
    // Match the application's host styles; factories deliberately do not import kit.css.
    await window.g20Import('/src/ui/base.css');
    await window.g20Import('/src/ui/kit/kit.css');
    const {setPreferences}=await window.g20Import('/src/settings/preferences.js');
    const {createIntroView}=await window.g20Import('/src/story/intro-view.js');
    const {createModal}=await window.g20Import('/src/ui/kit/index.js');
    const {createServerCallState}=await window.g20Import('/src/ui/kit/server-call-state.js');
    await window.g20Import('/src/screens/screens.css');
    await window.g20Import('/src/ui/intro.css');
    setPreferences({textSpeed:0,reducedMotion:true});
    const accepted=['accepted_one'],actions=[],callbacks=[];
    const record={scene:'recorded_finish',title:'Recorded chapter',ended,
      text:'A recorded passage keeps its complete source in the journal. '.repeat(6),
      notes:['A recorded note remains available.'],inventory:[],message:'',
      choices:ended?[]:[{id:'inspect_one',label:'First action'},{id:'inspect_two',label:'Second action'},{id:'inspect_three',label:'Third action'}],
      history:[{id:'accepted_one',label:'Recorded accepted move'}]};
    const view=createIntroView({onAction:id=>actions.push(id),onRestart:()=>callbacks.push('restart'),onClose:()=>callbacks.push('close')});
    view.update(record,accepted);
    const arrival=document.createElement('section');arrival.className='case-arrival';
    const heading=document.createElement('h3');heading.textContent='Recorded arrival';arrival.append(heading);
    for(let i=0;i<6;i++){const p=document.createElement('p');p.textContent='Recorded server information remains readable inside the arrival card.';arrival.append(p);}
    const local=document.createElement('button');local.className='kit-button';local.dataset.focus='recorded-arrival-action';local.textContent='Open recorded crew';local.onclick=()=>callbacks.push('crew');arrival.append(local);
    const call=createServerCallState({label:'recorded arrival',onRetry:()=>callbacks.push('retry'),onSignIn:()=>callbacks.push('sign-in')});
    call.fail({reason:'sign_in_required',message:'Sign in to continue.'});arrival.append(call.element);
    view.setArrival(arrival);
    const modal=createModal({title:'Recorded chapter',body:view.element});modal.element.classList.add('intro-modal');modal.open();view.focus();
    window.recordedIntro={view,modal,arrival,call,local,record,accepted,actions,callbacks};
  },{ended});
}

async function lastPage(page){
  // Read every public page; the final Continue remains a separate acknowledgement.
  for(let i=0;i<30;i++){
    const state=await page.locator('.intro-page-count').textContent();
    const [,current,total]=state.match(/^(\d+) \/ (\d+)/);
    if(current===total)return Number(total);
    await page.locator('[data-choice="intro:next"]').click();
  }
  throw new Error('Recorded passage did not reach its last page.');
}

async function enterArrival(page){
  const pages=await lastPage(page);
  await page.locator('[data-choice="intro:next"]').click();
  await page.waitForFunction(()=>document.querySelector('.intro-view').dataset.stage==='arrival');
  return pages;
}

it('acknowledges the final ended page without adding a move, and keeps its complete journal',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page,{wide:true});
    expect(await lastPage(page)).toBeGreaterThan(1);
    expect(await page.locator('.intro-view').getAttribute('data-stage')).toBe('passage');
    expect(await page.locator('.intro-ending').isVisible()).toBe(false);
    expect(await page.locator('.kit-dialogue-text').isVisible()).toBe(true);
    expect(await page.locator('[data-choice="intro:next"]').isVisible()).toBe(true);
    const before=await page.evaluate(()=>({actions:window.recordedIntro.actions,accepted:window.recordedIntro.accepted,history:window.recordedIntro.record.history}));
    await page.locator('[data-choice="intro:next"]').click();
    expect(await page.locator('.intro-view').getAttribute('data-stage')).toBe('arrival');
    expect(await page.locator('.kit-dialogue').isVisible()).toBe(false);
    expect(await page.locator('[data-choice="intro:next"]').count()).toBe(0);
    expect(await page.locator('.intro-page-count').isVisible()).toBe(false);
    expect(await page.locator('.intro-ending').isVisible()).toBe(true);
    expect(await page.evaluate(()=>document.activeElement.dataset.focus)).toBe('sign-in-server-call');
    const summary=page.locator('.intro-journal>summary');await summary.click();
    await page.waitForFunction(()=>document.querySelector('.intro-journal').open);
    expect(await page.locator('.intro-original').textContent()).toBe(await page.evaluate(()=>window.recordedIntro.record.text));
    expect(await page.locator('.intro-journal-ending-notes').textContent()).toContain('A recorded note remains available.');
    expect(await page.locator('.intro-moves [data-action]').getAttribute('data-action')).toBe('accepted_one');
    await page.evaluate(()=>window.recordedIntro.view.focus());
    expect(await page.evaluate(()=>document.activeElement===document.querySelector('.intro-journal>summary'))).toBe(true);
    await summary.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('.intro-journal').open);
    // A native toggle event is asynchronous; wait for it before checking focus restoration.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    expect(await page.evaluate(()=>({open:window.recordedIntro.modal.element.open,summary:document.activeElement===document.querySelector('.intro-journal>summary')})))
      .toEqual({open:true,summary:true});
    await page.evaluate(()=>window.recordedIntro.view.focus());
    expect(await page.evaluate(()=>document.activeElement.dataset.focus)).toBe('sign-in-server-call');
    expect(await page.evaluate(()=>({actions:window.recordedIntro.actions,accepted:window.recordedIntro.accepted,history:window.recordedIntro.record.history}))).toEqual(before);
    await page.getByRole('button',{name:'Start a new intro',exact:true}).click();
    expect(await page.evaluate(()=>window.recordedIntro.callbacks)).toEqual(['restart']);
  });
});

it('keeps paging and action batches presentational while forwarding only the chosen action',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page,{ended:false,wide:true});
    expect(await lastPage(page)).toBeGreaterThan(1);
    expect(await page.locator('[data-choice="inspect_one"]').isVisible()).toBe(true);
    await page.locator('[data-choice="intro:more"]').click();
    await page.locator('[data-choice="inspect_three"]').click();
    expect(await page.evaluate(()=>({actions:window.recordedIntro.actions,accepted:window.recordedIntro.accepted,history:window.recordedIntro.record.history.map(move=>move.id)})))
      .toEqual({actions:['inspect_three'],accepted:['accepted_one'],history:['accepted_one']});
    const stale=await page.locator('[data-choice="inspect_three"]').elementHandle();
    await page.evaluate(()=>window.recordedIntro.view.dispose());
    await stale.evaluate(button=>button.click());
    const result=await page.evaluate(()=>{
      const state=window.recordedIntro;state.view.update(state.record,state.accepted);state.view.setArrival(document.createElement('section'));state.view.focus();state.view.dispose();
      return {connected:state.view.element.isConnected,actions:state.actions};
    });
    expect(result).toEqual({connected:false,actions:['inspect_three']});
  });
});

it('focuses visible arrival recovery actions and leaves a newer account dialog in control',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);await lastPage(page);
    await page.evaluate(()=>{
      const account=document.createElement('dialog');account.className='account-modal';
      const button=document.createElement('button');button.textContent='Recorded account action';account.append(button);document.body.append(account);account.showModal();button.focus();window.recordedAccount=account;
      // A previously queued acknowledgement may finish beneath a newer modal.
      document.querySelector('[data-choice="intro:next"]').click();window.recordedIntro.view.focus();window.recordedIntro.view.setArrival(window.recordedIntro.arrival);
    });
    expect(await page.evaluate(()=>({stage:window.recordedIntro.view.element.dataset.stage,account:document.activeElement===window.recordedAccount.querySelector('button')})))
      .toEqual({stage:'arrival',account:true});
    await page.evaluate(()=>{window.recordedAccount.close();window.recordedAccount.remove();window.recordedIntro.view.focus();});
    expect(await page.evaluate(()=>document.activeElement.dataset.focus)).toBe('sign-in-server-call');
    const focus=async reason=>page.evaluate(reason=>{const state=window.recordedIntro;state.call.fail({reason,message:'Recorded request result.'});state.view.focus();return document.activeElement.dataset.focus;},reason);
    expect(await focus('offline')).toBe('retry-server-call');
    expect(await focus('feature_off')).toBe('report-server-call');
    expect(await focus('rate_limited')).toBe('retry-server-call');
    expect(await page.locator('.server-call').textContent()).toContain('You can try again now.');
    expect(await page.evaluate(()=>{const state=window.recordedIntro;state.call.succeed();state.view.focus();return document.activeElement.dataset.focus;})).toBe('recorded-arrival-action');
    expect(await page.evaluate(()=>{const state=window.recordedIntro;state.local.remove();state.view.focus();return {heading:document.activeElement===state.arrival.querySelector('h3'),hidden:!!document.activeElement.closest('[hidden]')};}))
      .toEqual({heading:true,hidden:false});
    // A fresh/replayed view starts with its passage again and keeps the same accepted log.
    await page.evaluate(()=>{const state=window.recordedIntro;state.view.update({...state.record,scene:'recorded_replay'},state.accepted);state.view.focus();});
    expect(await page.locator('.intro-view').getAttribute('data-stage')).toBe('passage');
    expect(await page.locator('.kit-dialogue').isVisible()).toBe(true);
    expect(await page.locator('.intro-ending').isVisible()).toBe(false);
    expect(await page.evaluate(()=>window.recordedIntro.actions)).toEqual([]);
  });
});

it('keeps compact passage frames and gives the arrival readable space at 320 px and desktop',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    for(const [width,height,compact]of [[320,568,420],[1280,800,330]]){
      await page.setViewportSize({width,height});
      await page.evaluate(()=>{const state=window.recordedIntro;state.view.update({...state.record,scene:`recorded_${innerWidth}`},state.accepted);state.view.focus();});
      const initial=await page.locator('.intro-modal').evaluate(element=>element.getBoundingClientRect().height);
      expect(initial).toBe(compact);
      expect(await page.locator('.kit-dialogue-text').evaluate(element=>parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(19);
      await enterArrival(page);
      const layout=await page.evaluate(()=>{
        const modal=document.querySelector('.intro-modal'),ending=document.querySelector('.intro-ending'),footer=document.querySelector('.intro-footer'),active=document.activeElement;
        const m=modal.getBoundingClientRect(),e=ending.getBoundingClientRect(),f=footer.getBoundingClientRect(),a=active.getBoundingClientRect();
        return {height:m.height,left:m.left,right:m.right,top:m.top,bottom:m.bottom,pane:e.height,footer:f.height,
          scrollable:ending.scrollHeight>ending.clientHeight,overflow:document.documentElement.scrollWidth>innerWidth,
          activeHeight:a.height,activeFont:parseFloat(getComputedStyle(active).fontSize),activeInside:a.top>=e.top&&a.bottom<=e.bottom,
          captionFont:parseFloat(getComputedStyle(document.querySelector('.case-arrival>p')).fontSize),
          controls:[...footer.querySelectorAll('button,summary')].map(control=>control.getBoundingClientRect().height)};
      });
      expect(layout.height).toBe(Math.min(560,height-(width<=600?16:36)));
      expect(layout.top).toBeGreaterThanOrEqual(0);expect(layout.bottom).toBeLessThanOrEqual(height);
      expect(layout.left).toBeGreaterThanOrEqual(0);expect(layout.right).toBeLessThanOrEqual(width);
      expect(layout.pane).toBeGreaterThan(300);expect(layout.footer).toBeGreaterThanOrEqual(44);
      expect(layout.scrollable).toBe(true);expect(layout.overflow).toBe(false);
      expect(layout.activeHeight).toBeGreaterThanOrEqual(44);expect(layout.activeFont).toBeGreaterThanOrEqual(16);expect(layout.activeInside).toBe(true);
      expect(layout.captionFont).toBeGreaterThanOrEqual(18);expect(layout.controls.every(size=>size>=44)).toBe(true);
    }
    expect(await page.evaluate(()=>window.recordedIntro.actions)).toEqual([]);
  });
});
