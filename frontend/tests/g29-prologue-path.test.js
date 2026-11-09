// G29: the Lighthouse prologue is the full mystery, so starting it leaves the class demo path.
import {afterEach,describe,expect,it,vi} from 'vitest';
import {notePrologue,onPrologue} from '../src/shell/menu-extras.js';
import {PATH_KEY,readPath} from '../src/class-demo/harbor.js';

function memory(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
afterEach(()=>{vi.unstubAllGlobals();});

describe('Lighthouse prologue and the demo path',()=>{
  it('tells every running listener once and survives a broken one',()=>{
    const heard=[];const stopBroken=onPrologue(()=>{throw new Error('broken');});const stop=onPrologue(()=>heard.push('demo'));
    notePrologue();expect(heard).toEqual(['demo']);
    stop();stopBroken();notePrologue();expect(heard).toEqual(['demo']);
  });
  it('saves the full path before the game starts the prologue',async()=>{
    const storage=memory();vi.stubGlobal('localStorage',storage);vi.stubGlobal('window',{localStorage:storage});
    const {prologue}=await import('../src/shell/routes.js');
    const heard=[];const stop=onPrologue(()=>heard.push(readPath(storage)));
    const begins=[];
    await prologue({claim:()=>()=>true,loadGame:async()=>({begin:resume=>{begins.push(resume);}})});
    stop();
    expect(storage.getItem(PATH_KEY)).toBe('full');expect(heard).toEqual(['full']);expect(begins).toEqual([false]);
  });
});
