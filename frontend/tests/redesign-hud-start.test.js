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

it('shows friends from the title without pretending a disconnected build has online crews',async()=>{
  await evaluate.withPage(async page=>{
    await page.evaluate(async()=>{
      const {createShell}=await window.g20Import('/src/shell/controller.js');window.friendPlays=[];
      window.friendShell=createShell({container:document.body,readSave:()=>null,resetInput(){},onState(){},
        focus(){},hasOverlay:()=>false,onPlay:value=>window.friendPlays.push(value)});
    });
    expect(await page.locator('.shell-menu button').allTextContents())
      .toEqual(['New game','Play with friends','Continue','Settings']);
    await page.getByRole('button',{name:'Play with friends',exact:true}).click();
    const solo=page.getByRole('button',{name:'Play solo',exact:true});await solo.waitFor();
    expect(await page.locator('.shell-screen h2').textContent()).toBe('Play with friends');
    expect(await page.locator('.shell-copy').textContent()).toContain('not connected');
    expect(await page.evaluate(()=>window.friendPlays.length)).toBe(0);
    await solo.click();
    expect(await page.evaluate(()=>({plays:window.friendPlays,mode:window.friendShell.mode})))
      .toEqual({plays:[false],mode:'playing'});
    await page.evaluate(()=>window.friendShell.dispose());
  });
});

it('delegates to an explicit online entry without inventing a local multiplayer session',async()=>{
  const result=await evaluate(async()=>{
    const {createShell}=await window.g20Import('/src/shell/controller.js');let friends=0,plays=0;
    const shell=createShell({container:document.body,readSave:()=>null,resetInput(){},onState(){},focus(){},hasOverlay:()=>false,onPlay(){plays++;},onPlayFriends(){friends++;}});
    [...document.querySelectorAll('.shell-menu button')].find(button=>button.textContent==='Play with friends').click();
    const result={friends,plays,mode:shell.mode};shell.dispose();return result;
  });
  expect(result).toEqual({friends:1,plays:0,mode:'title'});
});

it('collapses account details while preserving continuation from a real journal',async()=>{
  const result=await evaluate(async()=>{
    const {createShell}=await window.g20Import('/src/shell/controller.js');const plays=[],summary=document.createElement('section');summary.textContent='Account details';
    const shell=createShell({container:document.body,readSave:()=>JSON.stringify({version:1,actions:['to_desk']}),readAccount:()=>({canContinue:false}),accountSummary:summary,resetInput(){},onState(){},focus(){},hasOverlay:()=>false,onPlay:value=>plays.push(value)});
    const details=document.querySelector('.shell-account'),resume=[...document.querySelectorAll('.shell-menu button')].find(button=>button.textContent==='Continue');
    const result={collapsed:!details.open,attached:details.contains(summary),canContinue:!resume.disabled};resume.click();result.plays=plays;shell.dispose();return result;
  });
  expect(result).toEqual({collapsed:true,attached:true,canContinue:true,plays:[true]});
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
