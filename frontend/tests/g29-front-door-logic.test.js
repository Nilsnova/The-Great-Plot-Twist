// G29 C1: what Play starts, the Join code rules and the remembered projector invitation.
import {describe,expect,it} from 'vitest';
import {playChoice,joinTarget,readFlag,writeFlag,rememberJoin,goalCopy,HARBOR_START,JOIN_KEY} from '../src/front-door/logic.js';
import {shellTransition} from '../src/shell/logic.js';

function memory(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}

describe('front door rules',()=>{
  it('continues a saved story and otherwise opens the front door',()=>{
    expect(playChoice({})).toBe('front_door');
    expect(playChoice({localIntro:true})).toBe('continue');
    expect(playChoice({account:{canContinue:true}})).toBe('continue');
    expect(playChoice({account:{canContinue:false},localIntro:false})).toBe('front_door');
  });
  it('starts outside in Saltreach Harbor through the world continuation',()=>{
    expect(HARBOR_START).toEqual({kind:'world',place:'saltreach_harbor',demo:true});
    expect(Object.isFrozen(HARBOR_START)).toBe(true);
  });
  it('reads Join codes and the class harbor code',()=>{
    expect(joinTarget(' harbor ')).toEqual({kind:'harbor',code:'HARBOR'});
    expect(joinTarget('ab-12 cd')).toEqual({kind:'crew',code:'AB12CD'});
    for(const value of ['',' - ','<img>','x'.repeat(21),null,7])expect(joinTarget(value)).toBeNull();
  });
  it('remembers ?join=harbor for the next stage and ignores anything else',()=>{
    const storage=memory();
    expect(rememberJoin('?join=Harbor',storage)).toBe('harbor');expect(storage.values.get(JOIN_KEY)).toBe('harbor');
    const other=memory();
    for(const search of ['','?join=','?join=<x>','?join='+'a'.repeat(21)])expect(rememberJoin(search,other)).toBeNull();
    expect(other.values.size).toBe(0);
    expect(rememberJoin('?join=harbor',{setItem(){throw new Error('blocked');}})).toBeNull();
  });
  it('stores the seen flag safely, even when storage is blocked',()=>{
    const storage=memory();
    expect(readFlag(storage,'k')).toBe(false);expect(writeFlag(storage,'k')).toBe(true);expect(readFlag(storage,'k')).toBe(true);
    const blocked={getItem(){throw new Error('no');},setItem(){throw new Error('no');}};
    expect(readFlag(blocked,'k')).toBe(false);expect(writeFlag(blocked,'k')).toBe(false);expect(readFlag(null,'k')).toBe(false);
  });
  it('explains the goal in one sentence and both control schemes',()=>{
    const copy=goalCopy();
    expect(copy.goal.split(/[.!?](\s|$)/).filter(Boolean).length).toBe(1);
    expect(copy.controls.map(([name])=>name)).toEqual(['Move','Interact']);
    expect(copy.controls[0][1]).toMatch(/WASD/);expect(copy.controls[0][1]).toMatch(/arrow/);expect(copy.controls[0][1]).toMatch(/tap/);
    expect(copy.controls[1][1]).toMatch(/\bE\b/);expect(copy.controls[1][1]).toMatch(/tap/);
    expect(copy.button).toBe('Got it');
  });
  it('lets the title open the Join page',()=>{
    expect(shellTransition('title','join')).toBe('join');expect(shellTransition('join','title')).toBe('title');
  });
});
