// Native-DOM checks for a quiet HUD and honest title entry points.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

it('keeps controls and journal closed until requested and restores focus on Escape',async()=>{
  const result=await evaluate(async()=>{
    const {createHud}=await window.g20Import('/src/ui/hud.js');
    const hud=createHud(document.body,{focus(){},start(){},chart(){},quality(){}});
    const controls=document.querySelector('.controls'),tools=document.querySelector('.case-toolbar'),toggle=document.querySelector('.controls-toggle'),journal=document.querySelector('.journal-toggle');
    const initial=[controls.hidden,tools.hidden,toggle.getAttribute('aria-expanded'),journal.getAttribute('aria-expanded')];
    toggle.click();const opened=!controls.hidden&&tools.hidden&&toggle.getAttribute('aria-expanded')==='true';
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    const escaped=controls.hidden&&document.activeElement===toggle;
    journal.click();const exclusive=!tools.hidden&&controls.hidden&&journal.getAttribute('aria-expanded')==='true';
    hud.dispose();return {initial,opened,escaped,exclusive,removed:!document.querySelector('.hud')};
  });
  expect(result).toEqual({initial:[true,true,'false','false'],opened:true,escaped:true,exclusive:true,removed:true});
});

it('retains journal actions and closes controls before opening the supplied menu',async()=>{
  const result=await evaluate(async()=>{
    const {createHud}=await window.g20Import('/src/ui/hud.js');const calls=[];
    const hud=createHud(document.body,{focus(){},start(){},chart(){calls.push('chart');},quality(){},caseScreen:name=>calls.push(name),menu:()=>calls.push('menu')});
    hud.setFestivalAvailable(true);document.querySelector('.journal-toggle').click();
    const labels=[...document.querySelectorAll('.case-toolbar button')].map(button=>button.textContent);
    document.querySelector('.case-toolbar button').click();const closed=document.querySelector('.case-toolbar').hidden;
    document.querySelector('.controls-toggle').click();document.querySelector('.chart-toggle').click();document.querySelector('.hud-menu').click();
    const controlsClosed=document.querySelector('.controls').hidden;hud.dispose();return {labels,calls,closed,controlsClosed};
  });
  expect(result).toEqual({labels:['Crew','Board','Log','What next?','Festival','Harbor bulletin'],calls:['crew','chart','menu'],closed:true,controlsClosed:true});
});

it('keeps a ready Tonight caption inside Journal with readable wrapping and phone-sized targets',async()=>{
  await evaluate.withPage(async page=>{
    await page.setViewportSize({width:320,height:568});
    await page.evaluate(async()=>{
      await window.g20Import('/src/ui/styles.css');await window.g20Import('/src/ui/readability.css');await window.g20Import('/src/ui/devices.css');
      const {createHud}=await window.g20Import('/src/ui/hud.js');
      window.tonightHud=createHud(document.body,{focus(){},start(){},chart(){},quality(){}});window.tonightHud.start();
    });
    const journal=page.getByRole('button',{name:'Journal',exact:true}),tools=page.locator('.case-toolbar'),caption=page.locator('.tonight-chip');
    expect(await tools.isHidden()).toBe(true);expect(await caption.isHidden()).toBe(true);
    await page.evaluate(()=>window.tonightHud.setBulletin({bulletin:{status:'ready',weather:{tonight:{
      state:'calm',startsAt:new Date(Date.now()+7*60_000).toISOString(),isNow:false,isFogNight:true,fogNightKind:'almanac',
    }}}}));
    expect(await caption.getAttribute('hidden')).toBeNull();expect(await caption.isHidden()).toBe(true);
    expect(await journal.getAttribute('aria-expanded')).toBe('false');
    await journal.click();expect(await tools.isVisible()).toBe(true);expect(await caption.isVisible()).toBe(true);
    expect(await caption.textContent()).toContain('Tonight · calm');expect(await caption.textContent()).toContain("by the harbor's almanac");
    const layout=await page.evaluate(()=>{
      const chip=document.querySelector('.tonight-chip'),bounds=chip.getBoundingClientRect();
      return {insideJournal:chip.parentElement===document.querySelector('.case-toolbar'),position:getComputedStyle(chip).position,
        captionSizes:[chip,...chip.children].map(element=>parseFloat(getComputedStyle(element).fontSize)),
        overflow:document.documentElement.scrollWidth>innerWidth,captionOverflow:chip.scrollWidth>chip.clientWidth,
        left:bounds.left,right:bounds.right,targets:[...document.querySelectorAll('.hud-actions button,.case-toolbar button')]
          .filter(button=>button.getClientRects().length).map(button=>{const rect=button.getBoundingClientRect();return {width:rect.width,height:rect.height};})};
    });
    expect(layout.insideJournal).toBe(true);expect(layout.position).toBe('static');
    expect(layout.captionSizes.every(size=>size>=18)).toBe(true);expect(layout.overflow||layout.captionOverflow).toBe(false);
    expect(layout.left).toBeGreaterThanOrEqual(0);expect(layout.right).toBeLessThanOrEqual(320);
    expect(layout.targets.length).toBe(8);expect(layout.targets.every(target=>target.width>=44&&target.height>=44)).toBe(true);
    await page.keyboard.press('Escape');expect(await tools.isHidden()).toBe(true);expect(await caption.isHidden()).toBe(true);
    expect(await journal.evaluate(button=>document.activeElement===button)).toBe(true);
    await journal.click();
    for(const status of ['off','unavailable']){
      await page.evaluate(status=>window.tonightHud.setBulletin({bulletin:{status}}),status);
      expect(await caption.getAttribute('hidden')).not.toBeNull();expect(await caption.isHidden()).toBe(true);
      expect(await tools.isVisible()).toBe(true);
    }
    await page.evaluate(()=>window.tonightHud.dispose());
  });
});

it('keeps supplied captain data literal and its save state honest',async()=>{
  const result=await evaluate(async()=>{
    const {createHud}=await window.g20Import('/src/ui/hud.js');const hud=createHud(document.body,{focus(){},start(){},chart(){},quality(){}});
    hud.setCaptain({captain:{name:'<img src=x onerror=alert(1)>',save:{state:'saving',label:'Waiting for the server'}},rewards:{keepsakes:[]}});
    const name=document.querySelector('.captain-status strong'),save=document.querySelector('.captain-status span');
    const result={literal:name.textContent,children:name.children.length,state:save.dataset.state,status:save.textContent};hud.dispose();return result;
  });
  expect(result).toEqual({literal:'<img src=x onerror=alert(1)>',children:0,state:'saving',status:'Saving · Waiting for the server'});
});

it('offers exactly Play and Join on the title, and reaches the friends flow through a Join code',async()=>{
  await evaluate.withPage(async page=>{
    await page.evaluate(async()=>{
      const {createShell}=await window.g20Import('/src/shell/controller.js');window.friendPlays=[];window.friendAccounts=0;window.friendStarts=0;
      window.friendShell=createShell({container:document.body,readSave:()=>null,readAccount:()=>({state:'signed_out',canSignIn:false,hasKit:false}),resetInput(){},onState(){},
        focus(){},hasOverlay:()=>false,openAccount(){window.friendAccounts++;},onPlay:value=>window.friendPlays.push(value),onStart(){window.friendStarts++;}});
    });
    expect(await page.locator('.shell-menu button').allTextContents()).toEqual(['Play','Join']);
    expect(await page.locator('.shell-screen button').allTextContents()).not.toContain('Continue');
    expect(await page.locator('.shell-screen details').count()).toBe(0);
    expect(await page.locator('.shell-screen').textContent()).not.toMatch(/Build|Lantern festival|Account and saves/);
    await page.getByRole('button',{name:'Join',exact:true}).click();
    const code=page.getByRole('textbox',{name:'Code'});await code.waitFor();
    expect(await page.locator('.shell-screen h2').textContent()).toBe('Join');
    expect(await page.locator('.shell-screen').textContent()).toContain('Scan the QR on the projector');
    await code.fill('<x>');await page.locator('.join-form').getByRole('button',{name:'Join',exact:true}).click();
    expect(await page.locator('.join-form [role=status]').textContent()).toContain('letters and numbers');
    await code.fill('ab-12');await page.locator('.join-form').getByRole('button',{name:'Join',exact:true}).click();
    const solo=page.getByRole('button',{name:'Start a new story',exact:true});await solo.waitFor();
    expect(await page.locator('.shell-screen h2').textContent()).toBe('Play with friends');
    expect(await page.evaluate(()=>sessionStorage.getItem('plot_twist_crew_code_v1'))).toBe('AB12');
    expect(await page.locator('.friends-guide h3').textContent()).toBe('Explore the island');
    expect(await page.evaluate(()=>window.friendAccounts)).toBe(0);
    await solo.click();
    expect(await page.evaluate(()=>({plays:window.friendPlays,starts:window.friendStarts,mode:window.friendShell.mode})))
      .toEqual({plays:[false],starts:0,mode:'playing'});
    await page.evaluate(()=>window.friendShell.dispose());
  });
});

it('hands Play to the front door without choosing a story itself',async()=>{
  const result=await evaluate(async()=>{
    const {createShell}=await window.g20Import('/src/shell/controller.js');let starts=0,plays=0;
    const shell=createShell({container:document.body,readSave:()=>JSON.stringify({version:1,actions:['to_desk']}),resetInput(){},onState(){},focus(){},hasOverlay:()=>false,onPlay(){plays++;},onStart(){starts++;}});
    document.querySelector('#play').click();
    const result={starts,plays,mode:shell.mode};shell.dispose();return result;
  });
  expect(result).toEqual({starts:1,plays:0,mode:'playing'});
});

it('keeps account, sign-in providers, the prologue and the build stamp in Settings',async()=>{
  await evaluate.withPage(async page=>{
    await page.evaluate(async()=>{
      const {createShell}=await window.g20Import('/src/shell/controller.js');const createBuildInfo=()=>{const info=document.createElement('section');info.className='build-info';info.textContent='Build fixture';return info;};
      const view={account:{state:'signed_out',captainName:null,canSignIn:true,providers:['github','google'],save:{state:'idle',label:'No saved progress'}}};
      window.sent=[];window.prologues=0;
      window.settingsShell=createShell({container:document.body,readSave:()=>null,resetInput(){},onState(){},focus(){},hasOverlay:()=>false,
        adapter:{read:()=>view,subscribe:()=>()=>{}},send:async(...args)=>{window.sent.push(args);return {accepted:true};},openAccount(){},
        onPrologue(){window.prologues++;},onReplay(){},settingsView:async()=>{const form=document.createElement('div');form.append(createBuildInfo());return form;}});
    });
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('button',{name:'Sign in with Google',exact:true}).waitFor();
    expect(await page.locator('.shell-section h3').allTextContents()).toEqual(['Account','Story','About']);
    expect(await page.locator('.shell-section').last().locator('.build-info').count()).toBe(1);
    await page.getByRole('button',{name:'Sign in with Google',exact:true}).click();
    await page.getByRole('button',{name:'Sign in with GitHub',exact:true}).click();
    expect(await page.evaluate(()=>window.sent)).toEqual([['signIn',{provider:'google'}],['signIn']]);
    await page.getByRole('button',{name:'Lighthouse prologue',exact:true}).click();
    expect(await page.evaluate(()=>({prologues:window.prologues,mode:window.settingsShell.mode}))).toEqual({prologues:1,mode:'playing'});
    await page.evaluate(()=>window.settingsShell.dispose());
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
        return {header:rect('.masthead'),actions:rect('.hud-actions'),overflow:document.documentElement.scrollWidth>innerWidth,controls:document.querySelector('.controls').hidden,tools:document.querySelector('.case-toolbar').hidden};
      });
      expect(result.overflow).toBe(false);expect(result.header.left).toBeGreaterThanOrEqual(0);expect(result.header.right).toBeLessThanOrEqual(width);expect(result.actions.right).toBeLessThanOrEqual(width);expect(result.header.bottom).toBeLessThanOrEqual(result.actions.top);expect(result.controls&&result.tools).toBe(true);
    }
  });
});
