// G29 C2 and D030: the projector's "Join the harbor" panel and the quest strip in real Chromium: the QR
// for the current class code is drawn on a canvas (no data: image), the code and count are readable,
// "New class code" asks first and repeats the same action id after an unknown outcome.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

it('draws the QR for the current code, shows the code and count, and makes a new code only after a confirm',async()=>{
  const result=await evaluate(async()=>{
    const {createProjector}=await window.g20Import('/src/class-demo/projector.js');
    const calls=[];let failNext=true;
    const host={read:async()=>({ok:true,status:200,data:{flagOn:true,code:'K7QXM',codeSetAt:'2026-11-09T14:00:00Z',guests:4}}),
      renew:async body=>{calls.push(body);if(failNext){failNext=false;return {ok:false,status:503,code:'database_unavailable'};}
        return {ok:true,status:200,data:{flagOn:true,code:'ZZ234',codeSetAt:'2026-11-09T15:00:00Z',guests:4,repeat:false}};}};
    const projector=createProjector({container:document.body,host,isHost:()=>true});
    projector.setCount(17);projector.show();
    await new Promise(resolve=>setTimeout(resolve,50));
    const panel=document.querySelector('.projector'),canvas=panel.querySelector('canvas');
    const text=()=>({code:panel.querySelector('.projector-code').textContent,status:panel.querySelector('.projector-window').textContent,
      label:canvas.getAttribute('aria-label'),url:panel.querySelector('.projector-url').textContent,error:panel.querySelector('.projector-error').textContent});
    const pixels=()=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.join(',');
    const before={visible:!panel.hidden,...text(),count:panel.querySelector('.projector-count').textContent,canvas:[canvas.width,canvas.height],
      images:document.querySelectorAll('img').length,focus:document.activeElement.textContent};
    const firstPixels=pixels();
    const button=[...panel.querySelectorAll('.projector-actions button')].find(node=>node.textContent==='New class code');
    const confirm=panel.querySelector('.projector-confirm');
    button.click();
    const asked={confirmShown:!confirm.hidden,calls:calls.length,focus:document.activeElement.textContent,question:confirm.textContent};
    [...confirm.querySelectorAll('button')].find(node=>node.textContent==='Keep this code').click();
    const kept={confirmHidden:confirm.hidden,calls:calls.length};
    button.click();[...confirm.querySelectorAll('button')].find(node=>node.textContent==='Yes, make a new code').click();
    await new Promise(resolve=>setTimeout(resolve,20));
    const failed=text();
    button.click();[...confirm.querySelectorAll('button')].find(node=>node.textContent==='Yes, make a new code').click();
    await new Promise(resolve=>setTimeout(resolve,20));
    const after={...text(),redrawn:pixels()!==firstPixels};
    projector.toggle();
    return {before,asked,kept,failed,after,calls,hidden:panel.hidden};
  });
  expect(result.before).toMatchObject({visible:true,code:'HARBOR-K7QXM',count:'17 captains in the harbor',status:'4 guests joined with a code',
    label:'QR code for https://the-great-plot-twist.vercel.app/?join=K7QXM',url:'https://the-great-plot-twist.vercel.app/?join=K7QXM',images:0,focus:'New class code'});
  expect(result.before.canvas[0]).toBeGreaterThan(200);
  expect(result.asked).toMatchObject({confirmShown:true,calls:0,focus:'Keep this code'});
  expect(result.asked.question).toMatch(/old code stops working for new joins/);
  expect(result.kept).toEqual({confirmHidden:true,calls:0});
  expect(result.failed.error).toMatch(/same request is repeated safely/);expect(result.failed.code).toBe('HARBOR-K7QXM');
  expect(result.calls).toHaveLength(2);expect(result.calls[0]).toEqual(result.calls[1]);expect(Object.keys(result.calls[0])).toEqual(['actionUid']);
  expect(result.after).toMatchObject({code:'HARBOR-ZZ234',label:'QR code for https://the-great-plot-twist.vercel.app/?join=ZZ234',error:'',redrawn:true});
  expect(result.hidden).toBe(true);
});

it('shows a practice code without a host button in a rehearsal, and no QR while there is no code',async()=>{
  const result=await evaluate(async()=>{
    const {createProjector}=await window.g20Import('/src/class-demo/projector.js');
    const {encodeQr}=await window.g20Import('/src/lib/qr/index.js');
    const projector=createProjector({container:document.body,host:null,rehearsal:true});projector.show();
    const panel=document.querySelector('.projector:not([hidden])');
    const rehearsal={button:panel.querySelector('.projector-actions .kit-button').hidden,status:panel.querySelector('.projector-window').textContent,
      code:panel.querySelector('.projector-code').textContent,label:panel.querySelector('canvas').getAttribute('aria-label'),
      size:encodeQr('https://the-great-plot-twist.vercel.app/?join=K7QXM',{ecc:'M'}).size};
    projector.dispose();
    const empty=createProjector({container:document.body,isHost:()=>true,
      host:{read:async()=>({ok:true,status:200,data:{flagOn:true,code:null,codeSetAt:null,guests:0}}),renew:async()=>({ok:false,status:500})}});
    empty.show();await new Promise(resolve=>setTimeout(resolve,30));
    const box=document.querySelector('.projector:not([hidden])');
    return {rehearsal,none:{canvasHidden:box.querySelector('canvas').hidden,code:box.querySelector('.projector-code').textContent,
      status:box.querySelector('.projector-window').textContent,button:box.querySelector('.projector-actions .kit-button').disabled}};
  });
  expect(result.rehearsal).toMatchObject({button:true,status:'Rehearsal: a practice code, not checked by the server.',code:'HARBOR-TESTS',
    label:'QR code for https://the-great-plot-twist.vercel.app/?join=TESTS'});
  expect(result.rehearsal.size).toBeGreaterThanOrEqual(25);
  expect(result.none).toEqual({canvasHidden:true,code:'No code yet',status:'No class code yet. Make one to let guests in.',button:false});
});

it('draws the quest strip with ticks and one-line hints',async()=>{
  const result=await evaluate(async()=>{
    const {createQuestStrip}=await window.g20Import('/src/class-demo/quest-strip.js');
    const strip=createQuestStrip({parent:document.body});strip.update({wave:true,duel:false,lock:false});
    const buttons=[...document.querySelectorAll('.quest-item')];
    buttons[2].click();
    const hint=document.querySelector('.quest-hint');
    const first={done:buttons.map(button=>button.dataset.done),labels:buttons.map(button=>button.getAttribute('aria-label')),hint:hint.textContent,hidden:hint.hidden,expanded:buttons[2].getAttribute('aria-expanded')};
    strip.update({wave:true,duel:true,lock:true});
    return {first,next:!document.querySelector('.quest-next').hidden,closed:strip.closeHint()};
  });
  expect(result.first.done).toEqual(['true','false','false']);
  expect(result.first.labels[0]).toBe('Wave to a captain: done. Show a hint.');
  expect(result.first).toMatchObject({hidden:false,expanded:'true'});expect(result.first.hint).toMatch(/lighthouse path/);
  expect(result.next).toBe(true);expect(result.closed).toBe(true);
});
