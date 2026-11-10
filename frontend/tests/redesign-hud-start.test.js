// Native-DOM checks for a quiet HUD and honest title entry points.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

it('keeps controls closed until requested, restores focus on Escape and offers no Journal',async()=>{
  const result=await evaluate(async()=>{
    const {createHud}=await window.g20Import('/src/ui/hud.js');
    const hud=createHud(document.body,{focus(){},start(){},chart(){},quality(){}});
    const controls=document.querySelector('.controls'),toggle=document.querySelector('.controls-toggle');
    const initial=[controls.hidden,toggle.getAttribute('aria-expanded')];
    toggle.click();const opened=!controls.hidden&&toggle.getAttribute('aria-expanded')==='true';
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    const escaped=controls.hidden&&document.activeElement===toggle;
    const journal=!!document.querySelector('.journal-toggle,.case-toolbar,.tonight-chip');
    hud.dispose();return {initial,opened,escaped,journal,removed:!document.querySelector('.hud')};
  });
  expect(result).toEqual({initial:[true,'false'],opened:true,escaped:true,journal:false,removed:true});
});

it('closes controls before opening the supplied menu and keeps the wordmark inert',async()=>{
  const result=await evaluate(async()=>{
    const {createHud}=await window.g20Import('/src/ui/hud.js');const calls=[];
    const hud=createHud(document.body,{focus(){},start(){},chart(){calls.push('chart');},quality(){},menu:()=>calls.push('menu')});
    document.querySelector('.controls-toggle').click();document.querySelector('.chart-toggle').click();document.querySelector('.hud-menu').click();
    const wordmark=document.querySelector('.wordmark');
    const inert={link:wordmark.tagName==='A'||!!wordmark.closest('a')||wordmark.hasAttribute('href'),focusable:wordmark.tabIndex>=0};
    const controlsClosed=document.querySelector('.controls').hidden;
    const text=document.querySelector('.hud').textContent;hud.dispose();
    return {calls,controlsClosed,inert,mystery:/prologue|keeper’s last log|investigate/i.test(text)};
  });
  expect(result).toEqual({calls:['chart','menu'],controlsClosed:true,inert:{link:false,focusable:false},mystery:false});
});

it('keeps supplied captain data literal and shows no save state',async()=>{
  const result=await evaluate(async()=>{
    const {createHud}=await window.g20Import('/src/ui/hud.js');const hud=createHud(document.body,{focus(){},start(){},chart(){},quality(){}});
    hud.setCaptain({account:{state:'signed_in'},captain:{name:'<img src=x onerror=alert(1)>',coins:5}});
    const name=document.querySelector('.captain-status strong'),save=document.querySelector('.captain-status span');
    const result={literal:name.textContent,children:name.children.length,state:save.dataset.state,status:save.textContent,shown:!!name.getClientRects().length,statusHidden:save.hidden};hud.dispose();return result;
  });
  expect(result).toEqual({literal:'<img src=x onerror=alert(1)>',children:0,state:'signed_in',status:'',shown:true,statusHidden:true});
});

it('shows no captain text in the top bar for a player who is not signed in',async()=>{
  const result=await evaluate(async()=>{
    const {createHud}=await window.g20Import('/src/ui/hud.js');const hud=createHud(document.body,{focus(){},start(){},chart(){},quality(){}});
    const read=()=>{const box=document.querySelector('.captain-status');return {text:box.textContent,shown:!!box.getClientRects().length,...(box.dataset.account?{account:box.dataset.account}:{})};};
    const before=read();
    hud.setCaptain({account:{state:'signed_out'},captain:{name:'Captain pending',coins:null}});
    const signedOut=read();
    hud.setCaptain({captain:{name:'Captain pending',coins:null}});
    const noAccount=read();
    hud.setCaptain({account:{state:'expired'},captain:{name:'Captain Fern',coins:null}});
    const expired=read();hud.dispose();return {before,signedOut,noAccount,expired};
  });
  expect(result.before).toEqual({text:'',shown:false});
  expect(result.signedOut).toEqual({text:'',shown:false,account:'signed_out'});
  expect(result.noAccount).toEqual({text:'',shown:false,account:'none'});
  expect(result.expired.account).toBe('expired');
  expect(result.expired.shown).toBe(true);expect(result.expired.text).toContain('Captain Fern');expect(result.expired.text).toContain('Sign in again');
});

it('offers exactly Play and Join on the title, and refuses a code that is not a class code',async()=>{
  await evaluate.withPage(async page=>{
    await page.evaluate(async()=>{
      const {createShell}=await window.g20Import('/src/shell/controller.js');window.friendStarts=0;
      window.friendShell=createShell({container:document.body,readAccount:()=>({state:'signed_out',canSignIn:false}),resetInput(){},onState(){},
        focus(){},hasOverlay:()=>false,openAccount(){},onPlay(){},onStart(){window.friendStarts++;}});
    });
    expect(await page.locator('.shell-menu button').allTextContents()).toEqual(['Play','Join']);
    expect(await page.locator('.shell-screen button').allTextContents()).not.toContain('Continue');
    expect(await page.locator('.shell-screen details').count()).toBe(0);
    expect(await page.locator('.shell-screen').textContent()).not.toMatch(/mystery|keeper|Lantern festival|Account and saves/i);
    await page.getByRole('button',{name:'Join',exact:true}).click();
    const code=page.getByRole('textbox',{name:'Code'});await code.waitFor();
    expect(await page.locator('.shell-screen h2').textContent()).toBe('Join');
    expect(await page.locator('.shell-screen').textContent()).toContain('Scan the QR on the projector');
    await code.fill('<x>');await page.locator('.join-form').getByRole('button',{name:'Join',exact:true}).click();
    expect(await page.locator('.join-form [role=status]').textContent()).toContain('letters and numbers');
    await code.fill('ab-12');await page.locator('.join-form').getByRole('button',{name:'Join',exact:true}).click();
    expect(await page.locator('.join-form [role=status]').textContent()).toContain('class code is not valid');
    expect(await page.evaluate(()=>({starts:window.friendStarts,mode:window.friendShell.mode,crew:sessionStorage.getItem('plot_twist_crew_code_v1')})))
      .toEqual({starts:0,mode:'join',crew:null});
    await page.evaluate(()=>window.friendShell.dispose());
  });
});

it('hands Play to the front door without choosing a story itself',async()=>{
  const result=await evaluate(async()=>{
    const {createShell}=await window.g20Import('/src/shell/controller.js');let starts=0,plays=0;
    const shell=createShell({container:document.body,resetInput(){},onState(){},focus(){},hasOverlay:()=>false,onPlay(){plays++;},onStart(){starts++;}});
    document.querySelector('#play').click();
    const result={starts,plays,mode:shell.mode};shell.dispose();return result;
  });
  expect(result).toEqual({starts:1,plays:0,mode:'playing'});
});

it('keeps account, sign-in providers, the intro replay and the build stamp in Settings',async()=>{
  await evaluate.withPage(async page=>{
    await page.evaluate(async()=>{
      const {createShell}=await window.g20Import('/src/shell/controller.js');const createBuildInfo=()=>{const info=document.createElement('section');info.className='build-info';info.textContent='Build fixture';return info;};
      const view={account:{state:'signed_out',captainName:null,canSignIn:true,providers:['github','email']}};
      window.sent=[];window.replays=0;
      window.settingsShell=createShell({container:document.body,resetInput(){},onState(){},focus(){},hasOverlay:()=>false,
        adapter:{read:()=>view,subscribe:()=>()=>{}},send:async(...args)=>{window.sent.push(args);return {accepted:true};},openAccount(){},
        onReplay(){window.replays++;},settingsView:async()=>{const form=document.createElement('div');form.append(createBuildInfo());return form;}});
    });
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('textbox',{name:'Email address',exact:true}).waitFor();
    expect(await page.locator('.shell-section h3').allTextContents()).toEqual(['Account','Intro','About']);
    expect(await page.getByRole('button',{name:'Lighthouse prologue',exact:true}).count()).toBe(0);
    expect(await page.locator('.shell-section').last().locator('.build-info').count()).toBe(1);
    expect(await page.getByRole('button',{name:/Google/}).count()).toBe(0);
    await page.getByRole('textbox',{name:'Email address',exact:true}).fill('captain@example.org');
    await page.getByRole('button',{name:'Send code',exact:true}).click();
    await page.getByRole('textbox',{name:'6-digit code',exact:true}).waitFor();
    await page.getByRole('button',{name:'Sign in with GitHub',exact:true}).click();
    expect(await page.evaluate(()=>window.sent)).toEqual([['signIn',{provider:'email',email:'captain@example.org'}],['signIn']]);
    await page.getByRole('button',{name:'Replay the intro',exact:true}).click();
    expect(await page.evaluate(()=>({replays:window.replays,mode:window.settingsShell.mode}))).toEqual({replays:1,mode:'playing'});
    await page.evaluate(()=>window.settingsShell.dispose());
  });
});

it('keeps the focused Settings account control in place while only the revision changes',async()=>{
  await evaluate.withPage(async page=>{
    await page.evaluate(async()=>{
      const {createShell}=await window.g20Import('/src/shell/controller.js');
      const account={state:'signed_out',captainName:null,canSignIn:true,providers:['github']};
      window.accountView={account,revision:0};window.accountListeners=new Set();
      window.tickShell=createShell({container:document.body,resetInput(){},onState(){},focus(){},hasOverlay:()=>false,
        adapter:{read:()=>window.accountView,subscribe:listener=>{window.accountListeners.add(listener);return ()=>window.accountListeners.delete(listener);}},
        send:async()=>({accepted:true}),openAccount(){},settingsView:async()=>document.createElement('div')});
      window.emitAccount=view=>{window.accountView=view;for(const listener of [...window.accountListeners])listener({type:'view_updated',view});};
    });
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    const signIn=page.getByRole('button',{name:'Sign in with GitHub',exact:true});await signIn.waitFor();await signIn.focus();
    const same=await page.evaluate(()=>{const before=document.activeElement;for(let tick=1;tick<=3;tick++)window.emitAccount({...window.accountView,revision:tick});return document.activeElement===before&&before.isConnected;});
    expect(same).toBe(true);
    await page.evaluate(()=>window.emitAccount({...window.accountView,account:{...window.accountView.account,state:'signed_in',captainName:'Captain Fern'}}));
    await page.locator('.account-summary').getByText('Captain Fern',{exact:true}).waitFor();
    await page.evaluate(()=>window.tickShell.dispose());
  });
});

it('separates status/actions inside narrow phone and desktop viewports',async()=>{
  await evaluate.withPage(async page=>{
    await page.evaluate(async()=>{
      await window.g20Import('/src/ui/styles.css');await window.g20Import('/src/ui/readability.css');await window.g20Import('/src/ui/devices.css');
      const {createHud}=await window.g20Import('/src/ui/hud.js');window.testHud=createHud(document.body,{focus(){},start(){},chart(){},quality(){}});window.testHud.start();
    });
    for(const [width,height] of [[320,568],[375,667],[1280,720]]){
      await page.setViewportSize({width,height});
      const result=await page.evaluate(()=>{
        const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};};
        return {header:rect('.masthead'),actions:rect('.hud-actions'),overflow:document.documentElement.scrollWidth>innerWidth,controls:document.querySelector('.controls').hidden,tools:!document.querySelector('.case-toolbar')};
      });
      expect(result.overflow).toBe(false);expect(result.header.left).toBeGreaterThanOrEqual(0);expect(result.header.right).toBeLessThanOrEqual(width);expect(result.actions.right).toBeLessThanOrEqual(width);expect(result.header.bottom).toBeLessThanOrEqual(result.actions.top);expect(result.controls&&result.tools).toBe(true);
    }
  });
});
