// Real DOM: a failed read-only retry is recoverable and cannot overwrite newer views.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();
const failureMessage = 'Connection retry did not work. Check your internet and try again.';

it('catches a failed retry, explains recovery and permits a successful second attempt', async () => {
  const result = await browser(async () => {
    const {createConnectionBanner} = await window.g20Import('/src/ui/connection-banner.js');
    let calls = 0;
    const view = (state,message) => ({account:{connection:{state,message}}});
    const banner = createConnectionBanner({send: async intent => {
      if (intent !== 'continueGame') throw Error('wrong intent');
      if (++calls === 1) throw Error('private failure detail');
      banner.update(view('online','Connection restored.'));
    }});
    document.body.append(banner.element); banner.update(view('offline','No connection.'));
    const retry = banner.element.querySelector('button'); let rejected = false;
    try {await retry.onclick();} catch {rejected = true;}
    const failed = {message: banner.element.querySelector('p').textContent, disabled: retry.getAttribute('aria-disabled')};
    banner.update(view('offline','No connection.')); // identical frame must not erase the useful error
    const retained = banner.element.querySelector('p').textContent;
    await retry.onclick();
    const restored = banner.element.querySelector('p').textContent;
    banner.dispose(); return {rejected, failed, retained, restored, calls};
  });
  expect(result).toEqual({rejected:false, failed:{message:failureMessage,disabled:'false'}, retained:failureMessage, restored:'Connection restored.',calls:2});
});

it('ignores duplicate clicks until a pending retry settles', async () => {
  const result = await browser(async () => {
    const {createConnectionBanner} = await window.g20Import('/src/ui/connection-banner.js');
    let resolve, calls=0;
    const banner=createConnectionBanner({send:()=>{calls++;return new Promise(done=>{resolve=done;});}});
    document.body.append(banner.element);banner.update({account:{connection:{state:'offline',message:'Offline'}}});
    const retry=banner.element.querySelector('button'), pending=retry.onclick();await retry.onclick();
    const during=retry.getAttribute('aria-disabled'), label=retry.textContent;resolve();await pending;
    const after=retry.getAttribute('aria-disabled');banner.dispose();return {calls,during,label,after,afterLabel:retry.textContent};
  });
  expect(result).toEqual({calls:1,during:'true',label:'Retrying…',after:'false',afterLabel:'Retry connection'});
});

it.each(['online','idle','cycle'])('ignores a late failure after a newer %s view', async mode => {
  const result = await browser(async mode => {
    const {createConnectionBanner} = await window.g20Import('/src/ui/connection-banner.js');
    let reject;
    const banner=createConnectionBanner({send:()=>new Promise((_,no)=>{reject=no;})});
    const update=(state,message)=>banner.update({account:{connection:{state,message}}});
    document.body.append(banner.element);update('offline','Offline');
    const pending=banner.element.querySelector('button').onclick();
    update(mode==='cycle'?'online':mode,mode==='idle'?'':'New status');
    if(mode==='cycle')update('offline','Offline');
    let rejected=false;reject(Error('old failure'));try{await pending;}catch{rejected=true;}
    const answer={rejected,message:banner.element.querySelector('p').textContent,hidden:banner.element.hidden};
    banner.dispose();return answer;
  },mode);
  expect(result).toEqual({rejected:false,message:mode==='cycle'?'Offline':mode==='idle'?'':'New status',hidden:mode==='idle'});
});

it('ignores rejection after disposal', async () => {
  const result=await browser(async()=>{
    const {createConnectionBanner}=await window.g20Import('/src/ui/connection-banner.js');let reject;
    const banner=createConnectionBanner({send:()=>new Promise((_,no)=>{reject=no;})});
    document.body.append(banner.element);banner.update({account:{connection:{state:'error',message:'Offline'}}});
    const pending=banner.element.querySelector('button').onclick();banner.dispose();reject(Error('late'));
    let rejected=false;try{await pending;}catch{rejected=true;}
    return {rejected,connected:banner.element.isConnected,text:banner.element.querySelector('p').textContent};
  });
  expect(result).toEqual({rejected:false,connected:false,text:'Offline'});
});
