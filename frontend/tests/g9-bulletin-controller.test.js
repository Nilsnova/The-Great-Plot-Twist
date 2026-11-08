// Actual native controller/drawer boundaries with recorded public models and injected read callbacks.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();
async function styles(page){await page.evaluate(async()=>{
  await window.g20Import('/src/ui/base.css');await window.g20Import('/src/ui/kit/kit.css');
  await window.g20Import('/src/screens/screens.css');
});}
async function mount(page,scenario='hook'){
  await styles(page);await page.evaluate(async scenario=>{
    const {createCaseScreens}=await window.g20Import('/src/screens/controller.js');
    const {createFakeCaseAdapter}=await window.g20Import('/src/adapter/fake/index.js');
    const {caseMethods}=await window.g20Import('/src/adapter/contract.js');
    const {introJournal}=await window.g20Import('/src/story/intro-journal.js');
    const {on}=await window.g20Import('/src/core/events.js');
    const fake=createFakeCaseAdapter(),proof={events:[],intents:[],retries:0,writes:0,retryDone:false};
    fake.dev.setBulletin(scenario);const journal=introJournal();journal.write(JSON.stringify({version:1,actions:['to_desk']}));
    proof.journalBefore=journal.read();const setItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(...args){proof.writes++;return setItem.apply(this,args);};
    const adapter={...fake,...Object.fromEntries(caseMethods.map(name=>[name,(...args)=>{
      proof.intents.push(name);return fake[name](...args);
    }]))};
    proof.stopEvent=on('bulletin_opened',event=>proof.events.push({...event}));
    const screens=createCaseScreens({container:document.body,adapter,retryBulletin:()=>{
      proof.retries++;return new Promise(resolve=>{proof.resolveRetry=resolve;}).finally(()=>{proof.retryDone=true;});
    }});
    Object.assign(proof,{fake,screens,journal,restoreStorage(){Storage.prototype.setItem=setItem;}});window.bulletinProof=proof;
  },scenario);
}

it('rejects off and disposed bridge opens before requesting controller or drawer modules',async()=>{
  await evaluate.withPage(async page=>{
    const imports=[];page.on('request',request=>{
      const path=new URL(request.url()).pathname;
      if(['/src/screens/controller.js','/src/screens/bulletin/index.js'].includes(path))imports.push(path);
    });
    const result=await page.evaluate(async()=>{
      const {createCaseBridge}=await window.g20Import('/src/adapter/bridge.js');
      const {createFakeCaseAdapter}=await window.g20Import('/src/adapter/fake/index.js');
      const fake=createFakeCaseAdapter(),bridge=createCaseBridge({container:document.body,adapter:fake});
      await bridge.open('bulletin');const off={active:bridge.active,dialogs:document.querySelectorAll('.case-modal').length};
      bridge.dispose();fake.dev.setBulletin('hook');await bridge.open('bulletin');
      const disposed={active:bridge.active,dialogs:document.querySelectorAll('.case-modal').length};fake.dispose();return {off,disposed};
    });
    expect(result).toEqual({off:{active:false,dialogs:0},disposed:{active:false,dialogs:0}});expect(imports).toEqual([]);
  });
});

it('opens the actual drawer once per visit, reads directly and stops work on navigation, close and off',async()=>{
  await evaluate.withPage(async page=>{
    await page.clock.install({time:new Date('2026-11-16T12:00:00Z')});await mount(page);
    await page.evaluate(()=>window.bulletinProof.screens.open('bulletin'));
    const screen=page.locator('.case-modal[open] .bulletin-screen'),announce=screen.getByRole('button',{name:/^Announce flash sequence/});
    expect(await announce.isEnabled()).toBe(true);await announce.click();
    expect(await screen.locator('.bulletin-hook-status').textContent()).toBe('Short flash, 1 of 3.');
    await page.evaluate(()=>{const p=window.bulletinProof;p.oldScreen=document.querySelector('.bulletin-screen');p.oldAnnounce=p.oldScreen.querySelector('[data-focus="hook-announcements"]');});
    await page.locator('.case-modal[open] .case-nav').getByRole('button',{name:'Crew',exact:true}).click();
    await page.locator('.case-modal[open] .case-crew').waitFor();
    await page.evaluate(()=>window.bulletinProof.oldAnnounce.dispatchEvent(new MouseEvent('click',{bubbles:true})));
    await page.clock.fastForward(60000);
    expect(await page.evaluate(()=>({connected:window.bulletinProof.oldScreen.isConnected,
      disabled:window.bulletinProof.oldAnnounce.disabled,status:window.bulletinProof.oldScreen.querySelector('.bulletin-hook-status').textContent})))
      .toEqual({connected:false,disabled:true,status:'Flash announcements stopped.'});
    await page.evaluate(()=>window.bulletinProof.screens.open('bulletin'));
    expect(await screen.locator('.bulletin-hook-status').textContent()).toBe('Flash announcements stopped.');
    expect(await announce.isEnabled()).toBe(true);
    await page.evaluate(()=>window.bulletinProof.fake.dev.setBulletin('unavailable'));
    const retry=screen.getByRole('button',{name:'Retry bulletin',exact:true});expect(await retry.isEnabled()).toBe(true);
    await retry.evaluate(button=>{button.click();button.click();});
    await page.waitForFunction(()=>window.bulletinProof.retries===1);
    expect(await screen.locator('[data-focus="retry-server-call"]').isDisabled()).toBe(true);
    await page.evaluate(()=>{const p=window.bulletinProof;p.retainedRetry=document.querySelector('.bulletin-screen [data-focus="retry-server-call"]');p.screens.close();p.retainedRetry.dispatchEvent(new MouseEvent('click',{bubbles:true}));p.resolveRetry({ok:false});});
    await page.waitForFunction(()=>window.bulletinProof.retryDone);
    await page.clock.fastForward(60000);
    expect(await page.evaluate(()=>({active:window.bulletinProof.screens.active,disabled:window.bulletinProof.retainedRetry.disabled,
      feedback:window.bulletinProof.oldScreen.querySelector('.bulletin-retry-status').hidden,retries:window.bulletinProof.retries})))
      .toEqual({active:false,disabled:true,feedback:true,retries:1});
    await page.evaluate(async()=>{const p=window.bulletinProof;p.fake.dev.setBulletin('off');await p.screens.open('bulletin');});
    const result=await page.evaluate(()=>{const p=window.bulletinProof,result={events:p.events,intents:p.intents,writes:p.writes,
      unchanged:p.journal.read()===p.journalBefore,active:p.screens.active,open:!!document.querySelector('.case-modal[open]')};
      p.screens.dispose();p.fake.dispose();p.stopEvent();p.restoreStorage();return result;});
    expect(result).toEqual({events:[{type:'bulletin_opened'},{type:'bulletin_opened'}],intents:[],writes:0,unchanged:true,active:false,open:false});
  });
});

it('does not activate or emit when off arrives while the genuine drawer import is pending',async()=>{
  await evaluate.withPage(async page=>{
    let release,started;const held=new Promise(resolve=>{release=resolve;}),requested=new Promise(resolve=>{started=resolve;});
    await page.route('**/src/screens/bulletin/index.js*',async route=>{started();await held;await route.continue();});
    await mount(page);await page.evaluate(()=>{window.bulletinProof.pendingOpen=window.bulletinProof.screens.open('bulletin');});
    await requested;await page.evaluate(()=>window.bulletinProof.fake.dev.setBulletin('off'));release();
    const result=await page.evaluate(async()=>{const p=window.bulletinProof;await p.pendingOpen;
      const result={active:p.screens.active,events:p.events,intents:p.intents,retries:p.retries,writes:p.writes,
        unchanged:p.journal.read()===p.journalBefore,open:!!document.querySelector('.case-modal[open]')};
      p.screens.dispose();p.fake.dispose();p.stopEvent();p.restoreStorage();return result;});
    expect(result).toEqual({active:false,events:[],intents:[],retries:0,writes:0,unchanged:true,open:false});
  });
});


// Full fake view supplies the established DTO; only public bulletin publications are controlled here.
async function mountPublishedBulletin(page){
  await styles(page);await page.evaluate(async()=>{
    const {createCaseScreens}=await window.g20Import('/src/screens/controller.js');
    const {createFakeCaseAdapter}=await window.g20Import('/src/adapter/fake/index.js');
    const {caseMethods}=await window.g20Import('/src/adapter/contract.js');
    const {introJournal}=await window.g20Import('/src/story/intro-journal.js');
    const {on}=await window.g20Import('/src/core/events.js');
    const fake=createFakeCaseAdapter();fake.dev.setBulletin('hook');let view=fake.read();
    const ready=structuredClone(view.bulletin),listeners=new Set();
    const proof={events:[],intents:[],retries:0,writes:0,retryDone:false,escaped:0,closed:false};
    const journal=introJournal();journal.write(JSON.stringify({version:1,actions:['to_desk']}));
    proof.journalBefore=journal.read();const setItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(...args){proof.writes++;return setItem.apply(this,args);};
    const canvas=document.createElement('canvas');canvas.tabIndex=0;canvas.width=320;canvas.height=160;
    document.body.append(canvas);canvas.focus();
    const escaped=event=>{if(event.key==='Escape')proof.escaped++;};document.addEventListener('keydown',escaped);
    let started;proof.retryStarted=new Promise(resolve=>{started=resolve;});
    const adapter={...fake,read:()=>structuredClone(view),subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
      ...Object.fromEntries(caseMethods.map(name=>[name,(...args)=>{proof.intents.push(name);return fake[name](...args);}]))};
    proof.stopEvent=on('bulletin_opened',event=>proof.events.push({...event}));
    const screens=createCaseScreens({container:document.body,adapter,focus:()=>canvas.focus(),retryBulletin:()=>{
      proof.retries++;const pending=new Promise(resolve=>{proof.resolveRetry=resolve;});
      started();proof.retryFinished=pending.finally(()=>{proof.retryDone=true;});return proof.retryFinished;
    }});
    Object.assign(proof,{screens,fake,canvas,journal,ready,
      publish(bulletin){view={...view,revision:view.revision+1,bulletin:structuredClone(bulletin)};
        for(const listener of [...listeners])if(listeners.has(listener))listener({view:structuredClone(view)});},
      cleanup(){if(proof.closed)return;proof.closed=true;proof.resolveRetry?.({ok:false});
        screens.dispose();fake.dispose();proof.stopEvent();document.removeEventListener('keydown',escaped);
        Storage.prototype.setItem=setItem;canvas.remove();}});
    window.bulletin404Proof=proof;
  });
}

it.each([false,true])('keeps a reportable server404 frame and removes old public drawer work, pending retry %s',async pending=>{
  await evaluate.withPage(async page=>{
    await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+20));
    await mountPublishedBulletin(page);
    try{
      await page.evaluate(()=>window.bulletin404Proof.screens.open('bulletin'));
      const frame=page.locator('.case-modal[open]'),drawer=frame.locator('.bulletin-screen');
      const retry=drawer.getByRole('button',{name:'Retry bulletin',exact:true});
      const announce=drawer.getByRole('button',{name:/^Announce flash sequence/});
      expect(await announce.isEnabled()).toBe(true);await announce.dispatchEvent('click');
      expect(await drawer.locator('.bulletin-hook-status').textContent()).toBe('Short flash, 1 of 3.');
      await page.evaluate(()=>{
        const proof=window.bulletin404Proof;
        proof.oldDrawer=document.querySelector('.bulletin-screen');proof.oldAnnounce=proof.oldDrawer.querySelector('[data-focus="hook-announcements"]');
        proof.oldLive=proof.oldDrawer.querySelector('.bulletin-hook-status');
        proof.publish({...proof.ready,stale:true,message:'Recorded last public posting.',
          request:{reason:'offline',status:0,message:'Recorded public connection is offline.'}});
      });
      await page.clock.runFor(32);
      expect(await retry.isEnabled()).toBe(true);expect(await retry.evaluate(element=>document.activeElement===element)).toBe(true);
      expect(await drawer.locator('.server-call').getAttribute('data-state')).toBe('offline');
      await page.evaluate(()=>{const proof=window.bulletin404Proof;
        proof.oldRetry=proof.oldDrawer.querySelector('[data-focus="retry-server-call"]');proof.oldRetryHandler=proof.oldRetry.onclick;});
      if(pending){
        await retry.dispatchEvent('click');await page.evaluate(()=>window.bulletin404Proof.retryStarted);
        expect(await page.evaluate(()=>window.bulletin404Proof.retries)).toBe(1);
        // Keep focus genuinely inside the soon-removed leaf while its public read remains held.
        await announce.focus();
      }
      await page.evaluate(()=>window.bulletin404Proof.publish({status:'off',day:null,lines:[],weather:null,
        exchange:null,chapterTwoHook:null,request:{reason:'feature_off',status:404,message:'The harbor bulletin opens later.'}}));
      await page.clock.runFor(32);
      const call=frame.locator('.case-screen-body > .server-call'),report=call.getByRole('link',{name:'Report a problem',exact:true});
      expect(await frame.count()).toBe(1);expect(await call.count()).toBe(1);
      expect(await call.getAttribute('data-state')).toBe('error');
      expect(await call.locator('.case-notice').textContent()).toBe('The harbor bulletin opens later.');
      expect(await report.isVisible()).toBe(true);expect(await report.evaluate(element=>document.activeElement===element)).toBe(true);
      expect(await call.locator('[data-focus="retry-server-call"]').isVisible()).toBe(false);
      expect(await call.locator('[data-focus="sign-in-server-call"]').isVisible()).toBe(false);
      expect(await page.locator('.bulletin-screen,.bulletin-hook').count()).toBe(0);
      expect(await page.evaluate(()=>({active:window.bulletin404Proof.screens.active,events:window.bulletin404Proof.events,
        intents:window.bulletin404Proof.intents,writes:window.bulletin404Proof.writes,
        unchanged:window.bulletin404Proof.journal.read()===window.bulletin404Proof.journalBefore})))
        .toEqual({active:true,events:[{type:'bulletin_opened'}],intents:[],writes:0,unchanged:true});
      await page.evaluate(async pending=>{
        const proof=window.bulletin404Proof;proof.oldLiveAfterRemoval=proof.oldLive.textContent;
        await proof.oldRetryHandler?.();proof.oldAnnounce.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        if(pending){proof.resolveRetry({ok:false,bulletin:{status:'ready',lines:[{kind:'notice',text:'Ignored late public reply.'}]}});await proof.retryFinished;}
      },pending);
      await page.clock.runFor(60000);
      expect(await report.evaluate(element=>document.activeElement===element)).toBe(true);
      expect(await call.getAttribute('data-state')).toBe('error');
      expect(await call.locator('.case-notice').textContent()).toBe('The harbor bulletin opens later.');
      expect(await page.locator('body').textContent()).not.toContain('Ignored late public reply.');
      expect(await page.evaluate(()=>({connected:window.bulletin404Proof.oldDrawer.isConnected,
        live:window.bulletin404Proof.oldLive.textContent===window.bulletin404Proof.oldLiveAfterRemoval,
        retries:window.bulletin404Proof.retries,events:window.bulletin404Proof.events.length,intents:window.bulletin404Proof.intents})))
        .toEqual({connected:false,live:true,retries:pending?1:0,events:1,intents:[]});
      await page.keyboard.press('Escape');await page.clock.runFor(32);
      expect(await page.locator('.case-modal[open]').count()).toBe(0);
      expect(await page.evaluate(()=>({active:window.bulletin404Proof.screens.active,
        canvas:document.activeElement===window.bulletin404Proof.canvas,escaped:window.bulletin404Proof.escaped})))
        .toEqual({active:false,canvas:true,escaped:0});
      await page.evaluate(async()=>{const proof=window.bulletin404Proof;proof.publish({...proof.ready,request:null});await proof.screens.open('bulletin');});
      const fresh=page.locator('.case-modal[open] .bulletin-screen');
      expect(await fresh.evaluate(element=>element!==window.bulletin404Proof.oldDrawer)).toBe(true);
      expect(await fresh.getByRole('button',{name:/^Announce flash sequence/}).isEnabled()).toBe(true);
      expect(await fresh.locator('.bulletin-hook-status').textContent()).toBe('');
      expect(await fresh.locator('.server-call').isVisible()).toBe(false);
      expect(await page.locator('.case-modal[open] .case-screen-body > .server-call').isVisible()).toBe(false);
      await page.evaluate(async()=>{const proof=window.bulletin404Proof;await proof.oldRetryHandler?.();
        proof.oldAnnounce.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
      expect(await fresh.locator('.bulletin-hook-status').textContent()).toBe('');
      expect(await page.evaluate(()=>window.bulletin404Proof.events)).toEqual([{type:'bulletin_opened'},{type:'bulletin_opened'}]);
      // Explicit config-off has no server failure packet and retains the established close-to-world behavior.
      await page.evaluate(()=>window.bulletin404Proof.publish({status:'off',day:null,lines:[],weather:null,
        exchange:null,chapterTwoHook:null,request:null}));await page.clock.runFor(32);
      expect(await page.locator('.case-modal[open]').count()).toBe(0);
      expect(await page.evaluate(()=>({active:window.bulletin404Proof.screens.active,
        canvas:document.activeElement===window.bulletin404Proof.canvas,intents:window.bulletin404Proof.intents,
        retries:window.bulletin404Proof.retries,writes:window.bulletin404Proof.writes,
        unchanged:window.bulletin404Proof.journal.read()===window.bulletin404Proof.journalBefore})))
        .toEqual({active:false,canvas:true,intents:[],retries:pending?1:0,writes:0,unchanged:true});
    }finally{await page.evaluate(()=>window.bulletin404Proof?.cleanup());}
  });
});


async function holdNativeFocusedBulletinRetry(page){
  await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+20));
  await mountPublishedBulletin(page);await page.evaluate(()=>window.bulletin404Proof.screens.open('bulletin'));
  await page.evaluate(()=>{const proof=window.bulletin404Proof;
    proof.publish({...proof.ready,stale:true,message:'Recorded last public posting.',
      request:{reason:'offline',status:0,message:'Recorded public connection is offline.'}});});
  await page.clock.runFor(32);
  const retry=page.locator('.case-modal[open] .bulletin-screen').getByRole('button',{name:'Retry bulletin',exact:true});
  expect(await retry.isEnabled()).toBe(true);expect(await retry.evaluate(element=>document.activeElement===element)).toBe(true);
  await page.evaluate(()=>{const proof=window.bulletin404Proof;
    proof.oldDrawer=document.querySelector('.bulletin-screen');proof.oldRetry=proof.oldDrawer.querySelector('[data-focus="retry-server-call"]');
    proof.oldRetryHandler=proof.oldRetry.onclick;proof.oldMessage=proof.oldDrawer.querySelector('.bulletin-retry-status');});
  await retry.dispatchEvent('click');await page.evaluate(()=>window.bulletin404Proof.retryStarted);
  // Hiding the genuine focused Retry may move focus implicitly to body. Do not repair it in this test.
  expect(await retry.isVisible()).toBe(false);
  expect(await page.evaluate(()=>window.bulletin404Proof.retries)).toBe(1);
}
async function publishTerminalBulletinOff(page){
  await page.evaluate(()=>window.bulletin404Proof.publish({status:'off',day:null,lines:[],weather:null,
    exchange:null,chapterTwoHook:null,request:{reason:'feature_off',status:404,message:'The harbor bulletin opens later.'}}));
  await page.clock.runFor(32);
}

it('restores Report after the actual focused Retry hides during a held read, without moving focus artificially',async()=>{
  await evaluate.withPage(async page=>{
    await holdNativeFocusedBulletinRetry(page);
    try{
      // No focus call or replacement control is introduced between Retry activation and this response.
      await publishTerminalBulletinOff(page);
      const frame=page.locator('.case-modal[open]'),call=frame.locator('.case-screen-body > .server-call');
      const report=call.getByRole('link',{name:'Report a problem',exact:true});
      expect(await frame.count()).toBe(1);expect(await call.getAttribute('data-state')).toBe('error');
      expect(await report.isVisible()).toBe(true);expect(await report.evaluate(element=>document.activeElement===element)).toBe(true);
      expect(await call.locator('[data-focus="retry-server-call"]').isVisible()).toBe(false);
      expect(await call.locator('[data-focus="sign-in-server-call"]').isVisible()).toBe(false);
      expect(await page.locator('.bulletin-screen,.bulletin-hook').count()).toBe(0);
      await page.evaluate(async()=>{const proof=window.bulletin404Proof;await proof.oldRetryHandler?.();
        proof.resolveRetry({ok:false,bulletin:{status:'ready',lines:[{kind:'notice',text:'Ignored late held retry.'}]}});await proof.retryFinished;});
      await page.clock.runFor(60000);
      expect(await report.evaluate(element=>document.activeElement===element)).toBe(true);
      expect(await call.locator('.case-notice').textContent()).toBe('The harbor bulletin opens later.');
      expect(await page.locator('body').textContent()).not.toContain('Ignored late held retry.');
      expect(await page.evaluate(()=>{const p=window.bulletin404Proof;return {retries:p.retries,events:p.events,
        intents:p.intents,writes:p.writes,unchanged:p.journal.read()===p.journalBefore,connected:p.oldDrawer.isConnected};}))
        .toEqual({retries:1,events:[{type:'bulletin_opened'}],intents:[],writes:0,unchanged:true,connected:false});
      await page.keyboard.press('Escape');await page.clock.runFor(32);
      expect(await page.evaluate(()=>({active:window.bulletin404Proof.screens.active,
        canvas:document.activeElement===window.bulletin404Proof.canvas,escaped:window.bulletin404Proof.escaped})))
        .toEqual({active:false,canvas:true,escaped:0});
    }finally{await page.evaluate(()=>window.bulletin404Proof?.cleanup());}
  });
});

it.each(['navigation','dialog'])('does not steal genuine outside %s focus for a later server404 frame',async outside=>{
  await evaluate.withPage(async page=>{
    await holdNativeFocusedBulletinRetry(page);
    try{
      if(outside==='dialog')await page.evaluate(()=>{
        const dialog=document.createElement('dialog'),heading=document.createElement('h2'),button=document.createElement('button');
        heading.id='recorded-other-heading';heading.textContent='Recorded other panel';button.textContent='Keep this panel focused';
        dialog.setAttribute('aria-labelledby',heading.id);dialog.append(heading,button);document.body.append(dialog);dialog.showModal();button.focus();
        Object.assign(window.bulletin404Proof,{outsideDialog:dialog,outsideControl:button});
      });
      else await page.locator('.case-modal[open] .case-nav').getByRole('button',{name:'Crew',exact:true}).evaluate(element=>{
        window.bulletin404Proof.outsideControl=element;element.focus();
      });
      expect(await page.evaluate(()=>document.activeElement===window.bulletin404Proof.outsideControl)).toBe(true);
      await publishTerminalBulletinOff(page);
      const call=page.locator('.case-modal[open] .case-screen-body > .server-call');
      expect(await call.getAttribute('data-state')).toBe('error');
      expect(await page.locator('.bulletin-screen,.bulletin-hook').count()).toBe(0);
      expect(await page.evaluate(()=>document.activeElement===window.bulletin404Proof.outsideControl)).toBe(true);
      expect(await call.getByRole('link',{name:'Report a problem',exact:true}).evaluate(element=>document.activeElement===element)).toBe(false);
      await page.evaluate(async()=>{const proof=window.bulletin404Proof;await proof.oldRetryHandler?.();
        proof.resolveRetry({ok:false});await proof.retryFinished;});await page.clock.runFor(60000);
      expect(await page.evaluate(()=>document.activeElement===window.bulletin404Proof.outsideControl)).toBe(true);
      expect(await page.evaluate(()=>{const p=window.bulletin404Proof;return {retries:p.retries,events:p.events,
        intents:p.intents,writes:p.writes,unchanged:p.journal.read()===p.journalBefore};}))
        .toEqual({retries:1,events:[{type:'bulletin_opened'}],intents:[],writes:0,unchanged:true});
    }finally{await page.evaluate(()=>{const proof=window.bulletin404Proof;
      proof?.outsideDialog?.close();proof?.outsideDialog?.remove();proof?.cleanup();});}
  });
});
