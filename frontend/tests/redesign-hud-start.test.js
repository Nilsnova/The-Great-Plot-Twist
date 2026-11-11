// Native-DOM checks for a quiet HUD and honest title entry points.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

// The play HUD keeps three things (lane U2): 🪙, the quest strip and one Menu. Details: tests/ui/hud.test.js.
it('offers no controls panel, chart toggle or Journal on the play HUD, and Escape closes an open goal hint',async()=>{
  const result=await evaluate(async()=>{
    const {createHud}=await window.g20Import('/src/ui/hud.js');
    const hud=createHud(document.body,{focus(){},start(){},chart(){},quality(){}});
    const extras=['.controls','.controls-toggle','.chart-toggle','.settings-toggle','.journal-toggle','.case-toolbar','.tonight-chip'].filter(selector=>document.querySelector(selector));
    document.querySelector('.quest-item').click();const opened=!document.querySelector('.quest-hint').hidden;
    const closed=hud.closeQuickPanels()&&document.querySelector('.quest-hint').hidden;
    hud.dispose();return {extras,opened,closed,removed:!document.querySelector('.hud')};
  });
  expect(result).toEqual({extras:[],opened:true,closed:true,removed:true});
});

it('opens the supplied menu from the one Menu button and has no page-reloading wordmark',async()=>{
  const result=await evaluate(async()=>{
    const {createHud}=await window.g20Import('/src/ui/hud.js');const calls=[];
    const hud=createHud(document.body,{focus(){},start(){},chart(){calls.push('chart');},quality(){},menu:()=>calls.push('menu')});
    document.querySelector('.hud-menu').click();
    const links=document.querySelectorAll('.hud a,.hud [href]').length;
    const text=document.querySelector('.hud').textContent;hud.dispose();
    return {calls,links,mystery:/prologue|keeper’s last log|investigate/i.test(text)};
  });
  expect(result).toEqual({calls:['menu'],links:0,mystery:false});
});

it('keeps supplied captain data out of the HUD and shows coins literally',async()=>{
  const result=await evaluate(async()=>{
    const {createHud}=await window.g20Import('/src/ui/hud.js');const hud=createHud(document.body,{focus(){},start(){},chart(){},quality(){}});
    hud.setCaptain({account:{state:'signed_in'},captain:{name:'<img src=x onerror=alert(1)>',coins:5}});
    const result={coins:document.querySelector('.hud-coins').textContent,name:document.querySelector('.hud').textContent.includes('<img'),images:document.querySelectorAll('.hud img').length};hud.dispose();return result;
  });
  expect(result).toEqual({coins:'🪙 5',name:false,images:0});
});

it('shows no account text in the HUD for a player who is not signed in',async()=>{
  const result=await evaluate(async()=>{
    const {createHud}=await window.g20Import('/src/ui/hud.js');const hud=createHud(document.body,{focus(){},start(){},chart(){},quality(){}});
    const read=()=>/sign in|captain pending|github/i.test(document.querySelector('.hud').textContent);
    const before=read();
    hud.setCaptain({account:{state:'signed_out'},captain:{name:'Captain pending',coins:null}});const signedOut=read();
    hud.setCaptain({captain:{name:'Captain pending',coins:null}});const noAccount=read();
    const coins=document.querySelector('.hud-coins').getAttribute('aria-label');hud.dispose();return {before,signedOut,noAccount,coins};
  });
  expect(result).toEqual({before:false,signedOut:false,noAccount:false,coins:'Coins not loaded yet'});
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

it('keeps coins, Menu and the quest strip apart inside narrow phone and desktop viewports',async()=>{
  await evaluate.withPage(async page=>{
    await page.evaluate(async()=>{
      await window.g20Import('/src/ui/styles.css');await window.g20Import('/src/ui/readability.css');await window.g20Import('/src/ui/devices.css');
      const {createHud}=await window.g20Import('/src/ui/hud.js');window.testHud=createHud(document.body,{focus(){},start(){},chart(){},quality(){}});window.testHud.start();
    });
    for(const [width,height] of [[320,568],[375,667],[1280,720]]){
      await page.setViewportSize({width,height});
      const result=await page.evaluate(()=>{
        const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};};
        return {coins:rect('.hud-coins'),menu:rect('.hud-menu'),strip:rect('.quest-strip'),overflow:document.documentElement.scrollWidth>innerWidth,tools:!document.querySelector('.case-toolbar,.controls')};
      });
      expect(result.overflow).toBe(false);expect(result.coins.left).toBeGreaterThanOrEqual(0);expect(result.menu.right).toBeLessThanOrEqual(width);expect(result.strip.right).toBeLessThanOrEqual(width);
      expect(result.coins.right).toBeLessThan(result.menu.left);expect(result.menu.bottom).toBeLessThanOrEqual(result.strip.top);expect(result.tools).toBe(true);
    }
  });
});
