// G29 C1: what Play starts, the Join code rules and the remembered projector invitation.
import {describe,expect,it} from 'vitest';
import {playChoice,joinTarget,readFlag,writeFlag,rememberJoin,readJoinCode,forgetJoinCode,joinedHarbor,classCode,displayCode,goalCopy,HARBOR_START,JOIN_KEY} from '../src/front-door/logic.js';
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
  it('reads the class code with or without HARBOR-, any case, spaces and dashes ignored',()=>{
    for(const typed of ['HARBOR-K7QXM','harbor-k7qxm',' Harbor K7QXM ','K7QXM','k7q-xm','HARBORK7QXM'])
      expect(joinTarget(typed)).toEqual({kind:'class',code:'K7QXM'});
    // HARBOR alone, or HARBOR with a broken code, is a class code that cannot be right.
    for(const typed of ['harbor','HARBOR-K7QX','HARBOR-K7QXO'])expect(joinTarget(typed)).toEqual({kind:'class',code:null});
    expect(joinTarget('ab-12 cd')).toEqual({kind:'crew',code:'AB12CD'});
    expect(joinTarget('K7QF2M')).toEqual({kind:'crew',code:'K7QF2M'}); // a crew code has 6 symbols
    for(const value of ['',' - ','<img>','x'.repeat(21),null,7])expect(joinTarget(value)).toBeNull();
    for(const bad of ['K7QX0','K7QXO','K7QX1','K7QXI','K7QXL','K7QX','',null,'K'.repeat(40)])expect(classCode(bad)).toBeNull();
    expect(displayCode('k7qxm')).toBe('HARBOR-K7QXM');expect(displayCode('nope')).toBe('');
  });
  it('remembers ?join=<code> in session storage for the Join page and ignores anything else',()=>{
    const storage=memory();
    expect(rememberJoin('?join=k7qxm',storage)).toBe('K7QXM');expect(storage.values.get(JOIN_KEY)).toBe('K7QXM');
    expect(readJoinCode(storage)).toBe('K7QXM');expect(joinedHarbor(storage)).toBe(true);
    expect(forgetJoinCode(storage)).toBe(true);expect(readJoinCode(storage)).toBeNull();expect(storage.values.size).toBe(0);
    const other=memory();
    for(const search of ['','?join=','?join=<x>','?join=harbor','?join=K7QX0','?join='+'a'.repeat(21)])expect(rememberJoin(search,other)).toBeNull();
    expect(other.values.size).toBe(0);
    expect(rememberJoin('?join=K7QXM',{setItem(){throw new Error('blocked');}})).toBeNull();
    // The in-game button's mark is "in the class harbor" but carries no code, and forget leaves it.
    const marked=memory();marked.setItem(JOIN_KEY,'harbor');
    expect(readJoinCode(marked)).toBeNull();expect(joinedHarbor(marked)).toBe(true);forgetJoinCode(marked);expect(marked.values.get(JOIN_KEY)).toBe('harbor');
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
