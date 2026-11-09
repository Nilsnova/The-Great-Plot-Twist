// G29 C2: the projector's "Join the harbor" panel and the quest strip in real Chromium: the QR is drawn
// on a canvas (no data: image), the code and count are readable, and the host's button repeats the
// same action id after an unknown outcome.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

it('draws the QR on a canvas and shows the code, the count and the demo window',async()=>{
  const result=await evaluate(async()=>{
    const {createProjector}=await window.g20Import('/src/class-demo/projector.js');
    const calls=[];let failNext=true;
    const host={read:async()=>({ok:true,status:200,data:{flagOn:true,open:false,openUntil:null}}),
      open:async body=>{calls.push(body);if(failNext){failNext=false;return {ok:false,status:503,code:'database_unavailable'};}
        return {ok:true,status:200,data:{flagOn:true,open:true,openUntil:new Date(Date.now()+7200000).toISOString()}};}};
    const projector=createProjector({container:document.body,host,isHost:()=>true});
    projector.setCount(17);projector.show();
    await new Promise(resolve=>setTimeout(resolve,50));
    const panel=document.querySelector('.projector'),canvas=panel.querySelector('canvas');
    const before={visible:!panel.hidden,code:panel.querySelector('.projector-code').textContent,count:panel.querySelector('.projector-count').textContent,
      window:panel.querySelector('.projector-window').textContent,canvas:[canvas.width,canvas.height],label:canvas.getAttribute('aria-label'),
      images:document.querySelectorAll('img').length,focus:document.activeElement.textContent};
    const button=[...panel.querySelectorAll('button')].find(node=>node.textContent==='Open demo for 2 hours');
    button.click();await new Promise(resolve=>setTimeout(resolve,20));
    const error=panel.querySelector('.projector-error').textContent;
    button.click();await new Promise(resolve=>setTimeout(resolve,20));
    const after={window:panel.querySelector('.projector-window').textContent,button:button.textContent};
    projector.toggle();
    return {before,error,after,calls,hidden:panel.hidden};
  });
  expect(result.before).toMatchObject({visible:true,code:'HARBOR',count:'17 captains in the harbor',window:'Demo closed: guests cannot join yet.',
    label:'QR code for https://the-great-plot-twist.vercel.app/?join=harbor',images:0,focus:'Open demo for 2 hours'});
  expect(result.before.canvas[0]).toBeGreaterThan(200);
  expect(result.error).toMatch(/same request is repeated safely/);
  expect(result.calls).toHaveLength(2);expect(result.calls[0]).toEqual(result.calls[1]);expect(result.calls[0].hours).toBe(2);
  expect(result.after.window).toMatch(/^Demo open until \d\d:\d\d$/);expect(result.after.button).toBe('Keep open for 2 more hours');
  expect(result.hidden).toBe(true);
});

it('hides the host button for a rehearsal without a host and decodes as the join address',async()=>{
  const result=await evaluate(async()=>{
    const {createProjector}=await window.g20Import('/src/class-demo/projector.js');
    const {encodeQr}=await window.g20Import('/src/lib/qr/index.js');
    const projector=createProjector({container:document.body,host:null,rehearsal:true});projector.show();
    const panel=document.querySelector('.projector');
    return {button:panel.querySelector('.projector-actions .kit-button').hidden,window:panel.querySelector('.projector-window').textContent,
      size:encodeQr('https://the-great-plot-twist.vercel.app/?join=harbor',{ecc:'M'}).size};
  });
  expect(result).toMatchObject({button:true,window:'Rehearsal: the demo window is not checked.'});
  expect(result.size).toBeGreaterThanOrEqual(25);
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
