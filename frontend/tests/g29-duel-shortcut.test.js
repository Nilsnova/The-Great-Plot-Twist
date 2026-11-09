// G29 C2: the duel shortcut's state machine and the nearest captain.
import {describe,expect,it} from 'vitest';
import {NEAR_DISTANCE,duelMessage,duelStep,friendlyChallenge,initialDuel,inviteCopy,isUnknownOutcome,menuCopy,nearestCaptain} from '../src/class-demo/duel-shortcut.js';

const run=(events,state=initialDuel())=>events.reduce(duelStep,state);
describe('duel shortcut',()=>{
  it('finds the nearest named captain within reach',()=>{
    const others=[{id:'a',name:'Ana',x:1,y:1},{id:'b',name:'Ben',x:.5,y:0},{id:'c',name:'Far',x:9,y:9},{id:'d',x:0,y:0}];
    expect(nearestCaptain(others,{x:0,y:0})?.name).toBe('Ben');
    expect(nearestCaptain([{id:'c',name:'Far',x:NEAR_DISTANCE+.1,y:0}],{x:0,y:0})).toBeNull();
    expect(nearestCaptain(null,{x:0,y:0})).toBeNull();
  });
  it('builds a friendly three-round named challenge',()=>{
    expect(friendlyChallenge({opponentName:'Ana',signals:['flash','shade','mirror'],actionUid:'uid-12345678'}))
      .toEqual({opponentName:'Ana',rounds:3,stake:0,signals:['flash','shade','mirror'],actionUid:'uid-12345678'});
  });
  it('walks the challenger from the menu to the reveal',()=>{
    let state=run([{type:'open',target:{id:'x',name:'Ana'}}]);
    expect(state.screen).toBe('menu');expect(menuCopy(state.target)).toMatchObject({wave:'Wave',duel:'Friendly duel (3 rounds)'});
    state=run([{type:'choose_duel'},{type:'seal',uid:'uid-1'}],state);expect(state).toMatchObject({screen:'sending',uid:'uid-1'});
    state=run([{type:'sent',duel:{id:'d1'},now:5}],state);expect(state).toMatchObject({screen:'waiting',startedAt:5});
    expect(duelStep(state,{type:'finished',duel:{id:'d1'}})).toBe(state);
    state=duelStep(state,{type:'finished',duel:{id:'d1',reveal:[]}});expect(state.screen).toBe('reveal');
    expect(duelStep(state,{type:'done'})).toEqual(initialDuel());
  });
  it('closes the menu on Wave and ignores events for other screens',()=>{
    const menu=run([{type:'open',target:{name:'Ana'}}]);
    expect(duelStep(menu,{type:'wave'}).screen).toBe('idle');
    expect(duelStep(initialDuel(),{type:'seal',uid:'u'}).screen).toBe('idle');
    expect(duelStep(initialDuel(),{type:'open',target:{}}).screen).toBe('idle');
    expect(duelStep(menu,{type:'nonsense'})).toBe(menu);
  });
  it('keeps the action id after an unknown outcome and drops it after a refusal',()=>{
    const sending=run([{type:'open',target:{name:'Ana'}},{type:'choose_duel'},{type:'seal',uid:'uid-1'}]);
    const lost=duelStep(sending,{type:'failed',failure:{status:0},signals:['flash','shade','shade']});
    expect(lost).toMatchObject({screen:'error',uid:'uid-1',retry:'seal'});
    expect(duelStep(lost,{type:'seal',uid:'uid-2'}).uid).toBe('uid-1');
    const refused=duelStep(sending,{type:'failed',failure:{status:404,code:'no_such_captain'}});
    expect(refused).toMatchObject({screen:'error',uid:null,message:'That captain has left the harbor.'});
    expect(isUnknownOutcome({status:503})).toBe(true);expect(isUnknownOutcome({status:409})).toBe(false);
  });
  it('lets the invited captain accept or say not now, and cannot be interrupted while sending',()=>{
    const invited=duelStep(initialDuel(),{type:'invited',duel:{id:'d2',challengerName:'Ben'}});
    expect(invited).toMatchObject({screen:'invited',target:{name:'Ben'}});
    expect(inviteCopy('Ben')).toMatchObject({accept:'Accept',decline:'Not now'});
    expect(duelStep(invited,{type:'decline'}).screen).toBe('idle');
    const answering=run([{type:'accept'},{type:'answer',uid:'uid-9'}],invited);
    expect(answering.screen).toBe('answering');expect(duelStep(answering,{type:'close'})).toBe(answering);
    expect(duelStep(answering,{type:'finished',duel:{reveal:[{round:1}]}}).screen).toBe('reveal');
    expect(duelStep(run([{type:'open',target:{name:'Ana'}}]),{type:'invited',duel:{id:'d3'}}).screen).toBe('menu');
  });
  it('tells the challenger about a decline or a long wait',()=>{
    const waiting=run([{type:'open',target:{name:'Ana'}},{type:'choose_duel'},{type:'seal',uid:'u'},{type:'sent',duel:{id:'d'}}]);
    expect(duelStep(waiting,{type:'declined'}).message).toBe('Ana said not now.');
    expect(duelStep(waiting,{type:'timeout'}).message).toMatch(/can still answer from the ring/);
  });
  it('words server refusals plainly',()=>{
    expect(duelMessage({status:403,code:'demo_closed'})).toMatch(/needs the class code\. Ask the presenter for the current code/);
    expect(duelMessage({status:404,code:'feature_off'})).toMatch(/switched off/);
    expect(duelMessage({status:429,message:'Too many tries. Wait 3 seconds, then try again.'})).toMatch(/Wait 3 seconds/);
    expect(duelMessage({status:0})).toMatch(/No connection/);
    expect(duelMessage({status:502})).toMatch(/Something went wrong/);
  });
});
