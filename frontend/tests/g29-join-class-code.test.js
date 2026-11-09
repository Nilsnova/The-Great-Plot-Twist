// D030: the Join page with a class code, in real Chromium. The adapter is a recorded fake: the code goes
// to signIn({guest, code}) (which presents it to POST /api/demo/join), a wrong code shows the plain
// message and the player can type it again, and the code stays in sessionStorage only.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

it('checks a class code before playing, shows the message for a wrong one and lets the player retype',async()=>{
  const result=await evaluate(async()=>{
    const {fillJoinPage}=await window.g20Import('/src/shell/join.js');
    sessionStorage.clear();localStorage.clear();
    sessionStorage.setItem('plot_twist_join_v1','ZZ234'); // an old code from the projector QR
    const log=[],answers=[{accepted:false,reason:'class_code_invalid',message:'x'},{accepted:true,reason:null,message:''}];
    const adapter={read:()=>({mode:'online'}),signIn:async options=>{log.push(['signIn',options]);return answers.shift();}};
    const body=document.createElement('div'),nav=document.createElement('nav');document.body.append(body);
    fillJoinPage({body,nav,ctx:{adapter,onStart:()=>log.push(['start'])},isCurrent:()=>true,play:()=>log.push(['play']),page:name=>log.push(['page',name]),back:()=>{}});
    const input=body.querySelector('input'),form=body.querySelector('form'),status=body.querySelector('[role=status]');
    const first={value:input.value,copy:body.querySelector('.shell-copy').textContent};
    form.requestSubmit();await new Promise(resolve=>setTimeout(resolve,20));
    const refused={status:status.textContent,focused:document.activeElement===input,stored:sessionStorage.getItem('plot_twist_join_v1'),log:[...log]};
    input.value='harbor-k7q xm';form.requestSubmit();await new Promise(resolve=>setTimeout(resolve,20));
    const joined={log:[...log],stored:sessionStorage.getItem('plot_twist_join_v1'),local:Object.keys(localStorage)};
    // HARBOR alone and a crew code take their own paths, without a guest sign-in.
    input.value='HARBOR';form.requestSubmit();await new Promise(resolve=>setTimeout(resolve,10));
    const prefixOnly=status.textContent;
    input.value='K7QF2M';form.requestSubmit();await new Promise(resolve=>setTimeout(resolve,10));
    body.remove();
    return {first,refused,joined,prefixOnly,last:log.at(-1),signIns:log.filter(([name])=>name==='signIn').length};
  });
  expect(result.first).toEqual({value:'HARBOR-ZZ234',copy:'You are invited to the class harbor. Press Join to start.'});
  expect(result.refused).toEqual({status:'This class code is not valid. Ask the presenter for the current code.',focused:true,stored:null,
    log:[['signIn',{guest:true,code:'ZZ234'}]]});
  expect(result.joined.log.slice(1)).toEqual([['signIn',{guest:true,code:'K7QXM'}],['play'],['start']]);
  expect(result.joined.stored).toBe('K7QXM');expect(result.joined.local).toEqual([]);
  expect(result.prefixOnly).toBe('This class code is not valid. Ask the presenter for the current code.');
  expect(result.last).toEqual(['page','friends']);expect(result.signIns).toBe(2);
});

it('lets a rehearsal join with the practice code and never calls the server',async()=>{
  const result=await evaluate(async()=>{
    const {fillJoinPage}=await window.g20Import('/src/shell/join.js');
    sessionStorage.clear();
    const log=[],adapter={read:()=>({mode:'online'}),signIn:async options=>{log.push(['signIn',options]);return {accepted:false};}};
    const body=document.createElement('div'),nav=document.createElement('nav');document.body.append(body);
    fillJoinPage({body,nav,ctx:{adapter,demo:true,onStart:()=>log.push(['start'])},isCurrent:()=>true,play:()=>log.push(['play']),page:()=>{},back:()=>{}});
    body.querySelector('input').value='HARBOR-TESTS';body.querySelector('form').requestSubmit();
    await new Promise(resolve=>setTimeout(resolve,10));body.remove();
    return {log,stored:sessionStorage.getItem('plot_twist_join_v1')};
  });
  expect(result).toEqual({log:[['play'],['start']],stored:'TESTS'});
});
