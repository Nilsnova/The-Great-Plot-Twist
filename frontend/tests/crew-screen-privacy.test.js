// Native component DOM, fake send/clipboard promises and public account boundaries only.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

async function mount(page,mode='online'){
  await page.evaluate(async mode=>{
    const {createCrewScreen}=await window.g20Import('/src/screens/crew.js');
    window.crewCalls=[];window.crewSendEnds=[];window.crewClipboard=[];
    window.crewSend=(...args)=>{window.crewCalls.push(args);return Promise.resolve({accepted:true});};
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise((resolve,reject)=>{
      window.crewClipboard.push({resolve,reject});
    })}});
    window.crewView={mode,account:{state:'signed_in',hasKit:true},permissions:{createCrew:true,joinCrew:true,muster:false},
      crew:{code:null,status:'forming',joinPreview:null,seats:[{seat:1,kind:'player',name:'Placeholder captain',
        kit:{id:'stranger',name:'Placeholder kit'},isYou:true},
        ...[2,3,4].map(seat=>({seat,kind:'open',name:'Open seat',kit:null,isYou:false}))]}};
    window.crewScreen=createCrewScreen({send:(...args)=>window.crewSend(...args),navigate(){}});
    document.body.append(window.crewScreen.element);window.crewScreen.update(window.crewView);
  },mode);
}
async function update(page,{state='signed_in',hasKit=true,code=null,preview=null,tick=false}={}){
  await page.evaluate(({state,hasKit,code,preview,tick})=>{
    window.crewView={...window.crewView,account:{state,hasKit},crew:{...window.crewView.crew,code,joinPreview:preview}};
    window.crewScreen[tick?'tick':'update'](window.crewView);
  },{state,hasKit,code,preview,tick});
}
const input=page=>page.getByRole('textbox',{name:'Crew code',exact:true});
const check=page=>page.getByRole('button',{name:'Check crew code',exact:true});
const status=page=>page.locator('.case-crew [role="status"]');

it('clears typed codes and copy status at signed-out, expired and cleared-kit boundaries before a new ready account',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    for(const boundary of [{state:'signed_out',hasKit:false},{state:'expired',hasKit:false},{state:'signed_in',hasKit:false,tick:true}]){
      await input(page).fill(' old-code42 ');await update(page,{code:'RECORDED'});
      await page.getByRole('button',{name:'Copy code',exact:true}).click();
      await page.evaluate(()=>window.crewClipboard.at(-1).resolve());
      await page.waitForFunction(()=>document.querySelector('.case-crew [role="status"]').textContent==='Crew code copied.');
      await update(page,boundary);
      expect(await input(page).inputValue()).toBe('');expect(await status(page).textContent()).toBe('');
      expect(await input(page).isDisabled()).toBe(true);
      await update(page);
      expect(await input(page).inputValue()).toBe('');expect(await input(page).isEnabled()).toBe(true);
      expect(await status(page).textContent()).toBe('');
    }
  });
});

it('invalidates old forms and keeps a new identity request locked when the old send finally settles',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    await page.evaluate(()=>{window.crewSend=(...args)=>{window.crewCalls.push(args);return new Promise(resolve=>window.crewSendEnds.push(resolve));};
      window.oldCrewForm=document.querySelector('.crew-join');});
    await input(page).fill('FIRST1');await check(page).click();expect(await input(page).isDisabled()).toBe(true);
    await update(page,{hasKit:false});await update(page);
    expect(await input(page).inputValue()).toBe('');expect(await input(page).isEnabled()).toBe(true);
    await input(page).fill('SECOND2');
    await page.evaluate(()=>window.oldCrewForm.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(await page.evaluate(()=>window.crewCalls.length)).toBe(1);
    await check(page).click();expect(await input(page).isDisabled()).toBe(true);
    await page.evaluate(async()=>{window.crewSendEnds[0]({accepted:true});await Promise.resolve();await Promise.resolve();});
    expect(await input(page).isDisabled()).toBe(true);expect(await check(page).isDisabled()).toBe(true);
    await check(page).dispatchEvent('click');expect(await page.evaluate(()=>window.crewCalls.length)).toBe(2);
    await page.evaluate(()=>window.crewSendEnds[1]({accepted:true}));
    await page.waitForFunction(()=>!document.querySelector('[data-focus="join-code"]').disabled);
    expect(await input(page).inputValue()).toBe('SECOND2');
    expect(await page.evaluate(()=>window.crewCalls.map(call=>call[1]))).toEqual(['FIRST1','SECOND2']);
  });
});

it('ignores late clipboard success/failure and detached copy controls after an identity boundary',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);await update(page,{code:'RECORDED'});
    await page.evaluate(()=>{window.oldCrewCopy=document.querySelector('[data-focus="copy-crew-code"]');});
    await page.getByRole('button',{name:'Copy code',exact:true}).click();
    await update(page,{state:'expired',hasKit:false});await update(page,{code:'RECORDED'});
    await page.evaluate(()=>window.oldCrewCopy.click());
    expect(await page.evaluate(()=>window.crewClipboard.length)).toBe(1);
    await page.evaluate(async()=>{window.crewClipboard[0].resolve();await Promise.resolve();await Promise.resolve();});
    expect(await status(page).textContent()).toBe('');
    await page.getByRole('button',{name:'Copy code',exact:true}).click();
    await update(page,{hasKit:false});await update(page,{code:'RECORDED'});
    await page.evaluate(async()=>{window.crewClipboard[1].reject(new Error('Recorded clipboard failure'));await Promise.resolve();await Promise.resolve();});
    expect(await status(page).textContent()).toBe('');
    await page.getByRole('button',{name:'Copy code',exact:true}).click();
    await page.evaluate(()=>window.crewClipboard[2].resolve());
    await page.waitForFunction(()=>document.querySelector('.case-crew [role="status"]').textContent==='Crew code copied.');
  });
});

it.each(['removed','replaced'])('ignores a deferred clipboard rejection after membership is %s while the account remains ready',async membership=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    const former=`CREW${crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase()}`;
    const current=`NEXT${crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase()}`;
    await update(page,{code:former});
    await page.evaluate(()=>{window.formerCrewCopy=document.querySelector('[data-focus="copy-crew-code"]');});
    await page.getByRole('button',{name:'Copy code',exact:true}).click();
    await update(page,{code:membership==='replaced'?current:null});
    expect(await input(page).isEnabled()).toBe(true);
    await page.evaluate(()=>window.formerCrewCopy.click());
    expect(await page.evaluate(()=>window.crewClipboard.length)).toBe(1);
    if(membership==='replaced'){
      await page.getByRole('button',{name:'Copy code',exact:true}).click();
      await page.evaluate(()=>window.crewClipboard[1].resolve());
      await page.waitForFunction(()=>document.querySelector('.case-crew [role="status"]').textContent==='Crew code copied.');
    }
    await page.evaluate(async()=>{window.crewClipboard[0].reject(new Error('Recorded clipboard rejection'));
      await Promise.resolve();await Promise.resolve();});
    expect(await status(page).textContent()).toBe(membership==='replaced'?'Crew code copied.':'');
    if(membership==='removed')expect(await page.locator('.crew-code').count()).toBe(0);
    else expect(await page.locator('.crew-code').textContent()).toBe(current);

    // A failure for the currently displayed, ready membership still offers the same device-copy fallback.
    await update(page,{code:current});
    await page.getByRole('button',{name:'Copy code',exact:true}).click();
    await page.evaluate(async()=>{window.crewClipboard.at(-1).reject(new Error('Recorded current clipboard rejection'));
      await Promise.resolve();await Promise.resolve();});
    expect(await status(page).textContent()).toBe('Select the crew code and copy it with your device’s copy command.');
    expect(await page.evaluate(()=>window.crewCalls.length)).toBe(0);
  });
});

it('preserves local rehearsal input, caret, normalized boundaries, preview matching and pending guards',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page,'local');await input(page).fill(' a-b c2 ');
    await input(page).evaluate(field=>{field.focus();field.setSelectionRange(2,5,'backward');});
    await update(page,{state:'expired',hasKit:false});
    expect(await input(page).evaluate(field=>({value:field.value,start:field.selectionStart,end:field.selectionEnd,
      direction:field.selectionDirection,focused:document.activeElement===field})))
      .toEqual({value:' a-b c2 ',start:2,end:5,direction:'backward',focused:true});
    expect(await input(page).getAttribute('maxlength')).toBe('64');expect(await input(page).getAttribute('autocapitalize')).toBe('characters');
    expect(await input(page).getAttribute('inputmode')).toBe('text');
    for(const [raw,enabled] of [['a',true],[' abcd-efgh ijklmnopqrst ',true],['ABCDEFGHIJKLMNOPQRSTU',false],['',false]]){
      await input(page).fill(raw);expect(await check(page).isEnabled()).toBe(enabled);
    }
    await input(page).fill(' abcd-efgh ijklmnopqrst ');
    await update(page,{state:'signed_out',hasKit:false,preview:{code:'ABCDEFGHIJKLMNOPQRST',message:'Placeholder local preview.'}});
    const confirm=page.getByRole('button',{name:'Confirm join',exact:true});expect(await confirm.isEnabled()).toBe(true);
    await input(page).fill('DIFFERENT2');expect(await confirm.isDisabled()).toBe(true);
    await confirm.dispatchEvent('click');expect(await page.evaluate(()=>window.crewCalls.length)).toBe(0);
    await page.evaluate(()=>{window.crewSend=(...args)=>{window.crewCalls.push(args);return new Promise(resolve=>window.crewSendEnds.push(resolve));};});
    await check(page).click();await check(page).dispatchEvent('click');expect(await page.evaluate(()=>window.crewCalls.length)).toBe(1);
    await update(page,{state:'expired',hasKit:false});expect(await input(page).isDisabled()).toBe(true);
    await page.evaluate(()=>window.crewSendEnds[0]({accepted:true}));
    await page.waitForFunction(()=>!document.querySelector('[data-focus="join-code"]').disabled);
    expect(await input(page).inputValue()).toBe('DIFFERENT2');
    expect(await page.locator('.case-crew').textContent()).toContain('Local rehearsal code to join: LANTERN.');
  });
});

it('clears held DOM data and ignores late sends, clipboard results and updates after disposal',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);await update(page,{code:'RECORDED'});await input(page).fill('PRIVATE42');
    await page.evaluate(()=>{window.crewSend=(...args)=>{window.crewCalls.push(args);return new Promise(resolve=>window.crewSendEnds.push(resolve));};
      window.oldCrewInput=document.querySelector('[data-focus="join-code"]');window.oldCrewForm=document.querySelector('.crew-join');
      window.oldCrewCopy=document.querySelector('[data-focus="copy-crew-code"]');window.oldCrewStatus=document.querySelector('.case-crew [role="status"]');});
    await page.getByRole('button',{name:'Copy code',exact:true}).click();await check(page).click();
    await page.evaluate(()=>{window.crewScreen.dispose();window.crewScreen.dispose();});
    expect(await page.evaluate(()=>({input:window.oldCrewInput.value,children:window.crewScreen.element.childElementCount,
      attached:window.crewScreen.element.isConnected,status:window.oldCrewStatus.textContent})))
      .toEqual({input:'',children:0,attached:false,status:''});
    await page.evaluate(async()=>{
      window.oldCrewCopy.click();window.oldCrewForm.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
      window.crewClipboard[0].resolve();window.crewSendEnds[0]({accepted:true});
      window.crewScreen.update(window.crewView);window.crewScreen.tick(window.crewView);await Promise.resolve();await Promise.resolve();
    });
    expect(await page.evaluate(()=>({sends:window.crewCalls.length,copies:window.crewClipboard.length,
      children:window.crewScreen.element.childElementCount,status:window.oldCrewStatus.textContent})))
      .toEqual({sends:1,copies:1,children:0,status:''});
  });
});
