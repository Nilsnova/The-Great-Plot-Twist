import {expect,it,vi} from 'vitest';
import {createActions} from '../../src/island/island-actions.js';

it.each(['takeRole','respecCaptain'])('a delayed %s refusal cannot clear a newer authenticated action',async action=>{
 let generation=1,releaseRead,releaseNew,calls=0;
 const refused={ok:false,code:'captain_revision_mismatch',message:'Read the current Captain.'};
 const post=()=>++calls===1?Promise.resolve(refused):new Promise(resolve=>{releaseNew=resolve;});
 const isl={emit:vi.fn(),authGeneration:()=>generation,getActorId:()=> 'actor',disposed:false,
  busyRole:false,busyRespec:false,respecAsk:true,ui:{toast:vi.fn()},refreshCard:vi.fn(),
  reloadOwn:()=>new Promise(resolve=>{releaseRead=resolve;}),api:{pickRole:post,respec:post}};
 const actions=createActions(isl);actions.link();
 const invoke=()=>action==='takeRole'?actions.takeRole('engineer'):actions.respecCaptain();
 const previous=invoke();await vi.waitFor(()=>expect(releaseRead).toBeTypeOf('function'));
 generation++;isl.busyRole=false;isl.busyRespec=false;isl.respecAsk=true;
 const current=invoke();await vi.waitFor(()=>expect(releaseNew).toBeTypeOf('function'));
 releaseRead();await previous;
 expect(isl[action==='takeRole'?'busyRole':'busyRespec']).toBe(true);
 await invoke();expect(calls).toBe(2);
 releaseNew({ok:false,code:'unavailable',message:'Unavailable'});await current;
});
