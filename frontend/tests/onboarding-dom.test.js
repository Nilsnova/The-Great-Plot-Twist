// Real component DOM: delayed help stays quiet, restores dismissal focus and never changes gameplay.
import {it,expect} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

it('shows each first-time hint once, with device preference dismissal and safe fixed actions',async()=>{
  const result=await evaluate(async()=>{
    const {createOnboarding}=await window.g20Import('/src/shell/hints/onboarding.js');
    const opener=document.createElement('button');opener.textContent='Explore';document.body.append(opener);opener.focus();
    const actions=[],dismissals=[],visible=[];let preferences={};
    const ui=createOnboarding({container:document.body,preferences,onPreferences:value=>{preferences=value;dismissals.push(value);},onAction:value=>actions.push(value),focus:()=>opener.focus()});
    const out={mode:'online',account:{state:'signed_out',canSignIn:true,hasKit:false},crew:{status:'none'},permissions:{},hints:{items:[],actions:[]}};
    const kit={...out,account:{state:'signed_in',canSignIn:true,hasKit:false},arrival:{status:'pending'}};
    const crew={...kit,account:{...kit.account,hasKit:true},permissions:{createCrew:true}};
    const board={...crew,crew:{status:'active',mySeat:1},permissions:{},finale:{islet:{id:'islet_signal_station',built:false,canBuild:true}},board:{cards:[{canPin:true,pinnedBy:[]}]}};
    let focused=true;
    for(const view of [out,kit,crew,board,board]){
      ui.update(view,{introComplete:view===kit});ui.tick(60,{blocked:true});
      if(ui.active)throw Error('Hint appeared under overlay');
      for(let i=0;i<21;i++)ui.tick(.1);focused&&=document.activeElement===opener;
      visible.push(ui.element.querySelector('h3').textContent);ui.element.querySelector('.onboarding-open').click();
      ui.update(view,{introComplete:view===kit});for(let i=0;i<21;i++)ui.tick(.1);
    }
    const hidden=!ui.active,stored=JSON.stringify(preferences);ui.dispose();
    const reloaded=createOnboarding({container:document.body,preferences});reloaded.update(out);for(let i=0;i<21;i++)reloaded.tick(.1);
    const dismissedAfterReload=!reloaded.active;reloaded.dispose();
    return {actions,visible,dismissals:dismissals.length,focused,hidden,dismissedAfterReload,stored};
  });
  expect(result.actions).toEqual(['account','arrival','crew','islet','board']);
  expect(result.visible).toHaveLength(5);expect(result.dismissals).toBe(5);
  expect(result).toMatchObject({focused:true,hidden:true,dismissedAfterReload:true});
  expect(JSON.parse(result.stored).dismissedHints).toHaveLength(5);
});

it('returns focus after an explicit dismissal and keeps the same guidance in What next',async()=>{
  const result=await evaluate(async()=>{
    const {createOnboarding}=await window.g20Import('/src/shell/hints/onboarding.js');
    const {createHints}=await window.g20Import('/src/shell/hints/index.js');
    const opener=document.createElement('button');opener.textContent='Explore';document.body.append(opener);opener.focus();
    let preferences={};const actions=[];
    const view={mode:'online',account:{state:'signed_out',canSignIn:true},hints:{items:[],actions:[]}};
    const save=next=>{preferences=next;};
    const ui=createOnboarding({container:document.body,delaySeconds:0,onPreferences:save,focus:()=>opener.focus()});
    ui.update(view);const dismiss=ui.element.querySelector('.onboarding-dismiss');dismiss.focus();dismiss.click();
    const restored=document.activeElement===opener,hidden=!ui.active;
    const manual=createHints({onboardingAction:action=>actions.push(action),onPreferences:save});document.body.append(manual.element);manual.update(view);
    manual.element.querySelector('[data-focus="onboarding-account"]').click();manual.setPreferences(preferences);
    const cardRemoved=!manual.element.querySelector('[data-focus="onboarding-account"]');
    ui.dispose();manual.dispose();return {restored,hidden,actions,cardRemoved};
  });
  expect(result).toEqual({restored:true,hidden:true,actions:['account'],cardRemoved:true});
});

it('fits narrow screens, keeps full-size targets and stays still with reduced motion',async()=>{
  await evaluate.withPage(async page=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(async()=>{
      const {createOnboarding}=await window.g20Import('/src/shell/hints/onboarding.js');
      window.onboardingProof=createOnboarding({container:document.body,delaySeconds:0,onAction:()=>{}});
      window.onboardingProof.update({mode:'online',account:{state:'signed_in',hasKit:false},arrival:{status:'pending'}},{introComplete:true});
    });
    for(const width of [320,375,1280]){
      await page.setViewportSize({width,height:720});
      const proof=await page.evaluate(()=>{
        const tip=document.querySelector('.onboarding-tip'),rect=tip.getBoundingClientRect();
        return {left:rect.left,right:rect.right,viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,
          targets:[...tip.querySelectorAll('button')].map(button=>({width:button.getBoundingClientRect().width,height:button.getBoundingClientRect().height})),
          animations:tip.getAnimations({subtree:true}).length};
      });
      expect(proof.left).toBeGreaterThanOrEqual(0);expect(proof.right).toBeLessThanOrEqual(proof.viewport);
      expect(proof.overflow).toBe(false);expect(proof.animations).toBe(0);
      for(const target of proof.targets){expect(target.width).toBeGreaterThanOrEqual(44);expect(target.height).toBeGreaterThanOrEqual(44);}
    }
    await page.evaluate(()=>window.onboardingProof.dispose());
  });
});
