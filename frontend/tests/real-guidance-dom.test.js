// Actual hint cards and native controls with base/kit CSS, without a game scene or network.
import {expect, it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate = browserHarness();

it('places each live action beside its step and leaves only unmatched safe navigation below', async () => {
  const result = await evaluate(async () => {
    await window.g20Import('/src/ui/base.css');await window.g20Import('/src/ui/kit/kit.css');
    const {createHints}=await window.g20Import('/src/shell/hints/index.js');
    const actions=[],writes=[],ui=createHints({navigate:(...args)=>actions.push(args),onPreferences:value=>writes.push(value)});
    document.body.append(ui.element);
    const items=[{id:'next-pin-card',title:'1. Share a clue',body:'Pin an earned card.'},
      {id:'next-search-route',title:'2. Follow a lead',body:'Check the route before starting.'},
      {id:'next-order-partner',title:'3. Ask a partner',body:'Choose an available order.'}];
    ui.update({mode:'online',account:{state:'signed_in',hasKit:true},crew:{status:'active',mySeat:1},
      board:{cards:[{canPin:true,pinnedBy:[]}]},hints:{items,actions:[
        ...items.map((item,index)=>({id:item.id,label:item.title.slice(3),screen:['board','search','partners'][index],
          params:index===1?{spot:'saltreach_harbor.ferry_pier'}:{},available:true})),
        {id:'open-log',label:'Open log',screen:'log',params:{},available:true},
        {id:'bad-screen',label:'Unsafe destination',screen:'javascript:bad',params:{},available:true},
      ]}});
    const before={actions:[...actions],writes:[...writes]};
    const cards=[...ui.element.querySelectorAll('.case-hint')].map(card=>({title:card.querySelector('h4').textContent,
      action:card.querySelector('[data-focus^="action-"]')?.dataset.focus}));
    const remaining=[...ui.element.querySelectorAll('.case-hint-actions button')].map(button=>button.textContent);
    ui.element.querySelector('[data-focus="action-next-search-route"]').click();
    const result={before,cards,remaining,actions,writes,unsafe:ui.element.textContent.includes('Unsafe destination')};ui.dispose();return result;
  });
  expect(result.before).toEqual({actions:[],writes:[]});
  expect(result.cards).toEqual([{title:'1. Share a clue',action:'action-next-pin-card'},
    {title:'2. Follow a lead',action:'action-next-search-route'},{title:'3. Ask a partner',action:'action-next-order-partner'}]);
  expect(result.remaining).toEqual(['Open log']);expect(result.unsafe).toBe(false);
  expect(result.actions).toEqual([['search',{spot:'saltreach_harbor.ferry_pier'}]]);expect(result.writes).toEqual([]);
});

for(const kind of ['crew','board','station'])for(const activation of ['action','dismiss'])
  it(`${activation} of a matching ${kind} guide also retires its first-time tip`, async () => {
    const result = await evaluate(async ({kind,activation}) => {
      await window.g20Import('/src/ui/base.css');await window.g20Import('/src/ui/kit/kit.css');
      const {createHints}=await window.g20Import('/src/shell/hints/index.js');
      const {createOnboardingState}=await window.g20Import('/src/shell/hints/onboarding-state.js');
      const screen=kind==='station'?'finale':kind,id=kind==='station'?'next-build-station':`next-${kind}`;
      const fixed=kind==='station'?'onboarding-station':kind==='board'?'onboarding-pin':'onboarding-crew';
      const view={mode:'online',account:{state:'signed_in',hasKit:true},crew:{status:kind==='crew'?'none':'active',mySeat:1},
        permissions:kind==='crew'?{createCrew:true}:{},board:{cards:kind==='board'?[{canPin:true,pinnedBy:[]}]:[]},
        finale:{islet:kind==='station'?{id:'islet_signal_station',built:false,canBuild:true}:null},
        hints:{items:[{id,title:'1. Your next step',body:'Only the supplied action.'}],
          actions:[{id,label:'Open this step',screen,params:{},available:true}]}};
      let preferences={};const navigation=[],onboarding=[],writes=[];
      const ui=createHints({onboardingAction:action=>onboarding.push(action),navigate:(...args)=>navigation.push(args),
        onPreferences:value=>{preferences=value;writes.push(value);}});document.body.append(ui.element);ui.update(view);
      const before={cards:ui.element.querySelectorAll('.case-hint').length,writes:writes.length,navigation:navigation.length};
      const control=ui.element.querySelector(`[data-focus="${activation==='action'?'action-':'dismiss-'}${id}"]`);
      control.focus();control.click();
      const tip=createOnboardingState({preferences,delaySeconds:0});tip.update(view);
      const focus=ui.element.contains(document.activeElement)&&!document.activeElement.disabled;
      const result={before,preferences,navigation,onboarding,worldTip:tip.read(),focus,
        card:!!ui.element.querySelector(`[data-focus="dismiss-${id}"]`),fixed};ui.dispose();return result;
    },{kind,activation});
    expect(result.before).toEqual({cards:1,writes:0,navigation:0});
    expect(result.preferences.dismissedHints).toContain(result.fixed);expect(result.worldTip).toBeNull();
    expect(result.onboarding).toEqual([]);expect(result.focus).toBe(true);
    expect(result.card).toBe(activation==='action');
    expect(result.navigation).toEqual(activation==='action'?[[kind==='station'?'finale':kind,{}]]:[]);
  });

it('keeps account and arrival onboarding callbacks explicit and unchanged', async () => {
  const result=await evaluate(async()=>{
    await window.g20Import('/src/ui/base.css');await window.g20Import('/src/ui/kit/kit.css');
    const {createHints}=await window.g20Import('/src/shell/hints/index.js');
    const callbacks=[],navigation=[],writes=[],ui=createHints({readIntroComplete:()=>true,
      onboardingAction:value=>callbacks.push(value),navigate:value=>navigation.push(value),onPreferences:value=>writes.push(value)});
    document.body.append(ui.element);
    ui.update({mode:'online',account:{state:'signed_out',canSignIn:true},hints:{items:[],actions:[]}});
    const before=callbacks.length;ui.element.querySelector('[data-focus="onboarding-account"]').click();
    ui.update({mode:'online',account:{state:'signed_in',hasKit:false},arrival:{status:'pending'},hints:{items:[],actions:[]}});
    ui.element.querySelector('[data-focus="onboarding-arrival"]').click();
    const result={before,callbacks,navigation,dismissed:writes.at(-1).dismissedHints};ui.dispose();return result;
  });
  expect(result).toEqual({before:0,callbacks:['account','arrival'],navigation:[],dismissed:['onboarding-sign-in','onboarding-kit']});
});

it('retains navigation with hints off and after card dismissal, with bounded detached device preferences', async () => {
  const result=await evaluate(async()=>{
    await window.g20Import('/src/ui/base.css');await window.g20Import('/src/ui/kit/kit.css');
    const {createHints}=await window.g20Import('/src/shell/hints/index.js');
    const navigation=[],writes=[],preferences={dismissedHints:Array.from({length:100},(_,index)=>`old-${index}`)};
    const ui=createHints({preferences,navigate:(...args)=>navigation.push(args),onPreferences:value=>{writes.push(structuredClone(value));value.dismissedHints.push('caller-only');}});
    document.body.append(ui.element);ui.update({mode:'online',account:{state:'signed_in',hasKit:true},crew:{status:'none'},permissions:{createCrew:true},
      hints:{items:[{id:'next-crew',title:'1. Crew',body:'Set out.'}],actions:[{id:'next-crew',label:'Open crew',screen:'crew',params:{},available:true}]}});
    const dismiss=ui.element.querySelector('[data-focus="dismiss-next-crew"]');dismiss.focus();dismiss.click();
    const afterDismiss={card:!!ui.element.querySelector('.case-hint'),nav:!!ui.element.querySelector('.case-hint-actions [data-focus="action-next-crew"]'),
      focus:ui.element.contains(document.activeElement)};
    ui.element.querySelector('[data-focus="hints-toggle"]').click();
    ui.element.querySelector('[data-focus="action-next-crew"]').click();
    const result={afterDismiss,offCards:ui.element.querySelectorAll('.case-hint').length,navigation,writes};ui.dispose();return result;
  });
  expect(result.afterDismiss).toEqual({card:false,nav:true,focus:true});expect(result.offCards).toBe(0);
  expect(result.navigation).toEqual([['crew',{}]]);
  for(const value of result.writes){expect(value.dismissedHints.length).toBeLessThanOrEqual(100);expect(value.dismissedHints).not.toContain('caller-only');}
  expect(result.writes.at(-1)).toMatchObject({hintsEnabled:false,dismissedHints:expect.arrayContaining(['next-crew','onboarding-crew'])});
});

it('keeps inline controls readable and native-sized at 320 and 375 pixels with reduced motion', async () => {
  await evaluate.withPage(async page=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(async()=>{
      await window.g20Import('/src/ui/base.css');await window.g20Import('/src/ui/kit/kit.css');
      const {createHints}=await window.g20Import('/src/shell/hints/index.js');
      window.hintProof=createHints();document.body.style.overflow='auto';document.body.append(window.hintProof.element);
      window.hintProof.update({items:[{id:'next-search',title:'1. Follow a lead',body:'Check the available search and its coin cost before starting.'}],
        actions:[{id:'next-search',label:'Follow a lead',screen:'search',params:{spot:'recorded_pier'},available:true}]});
    });
    for(const width of [320,375]){
      await page.setViewportSize({width,height:720});
      const proof=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,
        native:[...document.querySelectorAll('.case-hints button')].every(button=>button.tagName==='BUTTON'&&button.type==='button'),
        targets:[...document.querySelectorAll('.case-hint button')].map(button=>{const box=button.getBoundingClientRect();return {width:box.width,height:box.height};}),
        animations:document.querySelector('.case-hints').getAnimations({subtree:true}).length}));
      expect(proof.overflow).toBe(false);expect(proof.native).toBe(true);expect(proof.animations).toBe(0);
      expect(proof.targets).toHaveLength(2);
      for(const target of proof.targets){expect(target.width).toBeGreaterThanOrEqual(44);expect(target.height).toBeGreaterThanOrEqual(44);}
    }
    await page.evaluate(()=>window.hintProof.dispose());
  });
});
