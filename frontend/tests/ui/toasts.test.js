// Lane U5: one toast style. Pure stacking and error wording, then the real DOM queue in Chromium.
import {describe,expect,it} from 'vitest';
import {TOAST_LIMIT,stackToasts,nextStep,errorToast} from '../../src/ui/toasts.js';
import {browserHarness} from '../g20-browser.js';
const evaluate=browserHarness();

describe('stacking rule',()=>{
  it('keeps one at a time, the newest, and never lets a note push out an error',()=>{
    expect(TOAST_LIMIT).toBe(1);
    let stack=[];for(const text of ['a','b','c'])stack=stackToasts(stack,{text});
    expect(stack.map(item=>item.text)).toEqual(['c']);
    // With room for two (a caller's own limit) the oldest goes and a repeated text moves to the end.
    let two=[];for(const text of ['a','b','c'])two=stackToasts(two,{text},2);
    expect(two.map(item=>item.text)).toEqual(['b','c']);
    expect(stackToasts(two,{text:'b'},2).map(item=>item.text)).toEqual(['c','b']);
    const error=[{text:'Closed now.',tone:'error'}];
    expect(stackToasts(error,{text:'Cannon built.',tone:'success'})).toBe(error);
    expect(stackToasts(error,{text:'Other error.',tone:'error'}).map(item=>item.text)).toEqual(['Other error.']);
  });
});

describe('errors say what happened and what to do next',()=>{
  it('keeps the server message and adds a next step by status or code',()=>{
    expect(errorToast({ok:false,status:503,code:'unavailable',message:'The Harbor stalls are closed right now.'}))
      .toEqual({text:'The Harbor stalls are closed right now.',next:'Check your connection, then try again.',tone:'error'});
    expect(errorToast({status:401,code:'unauthorized',message:'Your session ended.'}).next).toMatch(/Sign in again/);
    expect(errorToast({status:429,code:'too_many_requests',message:'Slow down.'}).next).toMatch(/Wait a few seconds/);
    expect(errorToast({status:409,code:'no_coins',message:'Not enough coins.'}).next).toMatch(/Earn 🪙/);
    expect(errorToast({status:500,code:'server_error',message:'The server broke.'}).next).toBe('Try again in a moment.');
  });
  it('does not repeat a next step the server already gave, and falls back to plain words',()=>{
    expect(errorToast({status:429,message:'Too many tries. Wait 3 seconds, then try again.'}).next).toBeNull();
    expect(errorToast({ok:false,status:0,code:'network_error'})).toEqual({text:'That did not work.',next:'Check your connection, then try again.',tone:'error'});
    expect(errorToast('Plain words.').text).toBe('Plain words.');
    expect(nextStep({},'Tap the stall again.')).toBeNull();
  });
});

it('shows one toast top-center at a time, keeps an error over a later note, and hides them by itself',async()=>{
  const result=await evaluate(async()=>{
    await window.g20Import('/src/ui/kit/kit.css');
    const {createToasts}=await window.g20Import('/src/ui/toasts.js');
    const queue=createToasts({parent:document.body});
    queue.show('First');queue.show({text:'Second',tone:'success'});queue.error({status:503,code:'unavailable',message:'Closed now.'});
    const dropped=queue.show({text:'A note while the error shows'});
    const boxes=[...document.querySelectorAll('.u-toast')];
    const rect=document.querySelector('.u-toasts').getBoundingClientRect(),box=boxes[0].getBoundingClientRect();
    const shown={count:boxes.length,texts:boxes.map(node=>node.textContent),tones:boxes.map(node=>node.dataset.tone),
      centered:Math.abs((box.left+box.right)/2-innerWidth/2)<2,top:rect.top,live:document.querySelector('.u-toasts').getAttribute('aria-live'),
      fontSize:parseFloat(getComputedStyle(document.querySelector('.u-toast-text')).fontSize)};
    const id=queue.show({text:'Quick',ms:60});await new Promise(resolve=>setTimeout(resolve,200));
    const after=queue.shown.map(item=>item.text);queue.hide(id);queue.clear();
    const cleared=document.querySelectorAll('.u-toast').length;queue.dispose();
    return {shown,after,cleared,dropped,removed:!document.querySelector('.u-toasts')};
  });
  expect(result.shown).toMatchObject({count:1,tones:['error'],centered:true,live:'polite'});
  expect(result.shown.texts[0]).toBe('!Closed now.Check your connection, then try again.');
  expect(result.dropped).toBeNull();
  expect(result.shown.top).toBeLessThan(40);expect(result.shown.fontSize).toBeGreaterThanOrEqual(16);
  expect(result.after).toEqual(['Closed now.']);expect(result.cleared).toBe(0);expect(result.removed).toBe(true);
});
