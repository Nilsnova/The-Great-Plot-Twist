// G29 C2: the quest strip's rules (three goals, hints, done state per player in local storage).
import {describe,expect,it} from 'vitest';
import {QUESTS,QUEST_KEY,completeQuest,playerKey,questView,readQuests,writeQuests} from '../src/class-demo/quests.js';

function memory(){const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key),data};}

describe('quest state',()=>{
  it('has the three demo goals with a one-line hint each',()=>{
    expect(QUESTS.map(quest=>quest.label)).toEqual(['Wave to a captain','Duel a captain',"Open the Keeper's Lock"]);
    for(const quest of QUESTS)expect(quest.hint.length).toBeGreaterThan(20);
  });
  it('ticks a goal once and ignores repeats and unknown ids',()=>{
    const first=completeQuest(readQuests(memory(),'device'),'wave');
    expect(first.changed).toBe(true);expect(first.state).toEqual({wave:true,duel:false,lock:false});
    expect(completeQuest(first.state,'wave')).toEqual({state:first.state,changed:false});
    expect(completeQuest(first.state,'treasure').changed).toBe(false);
  });
  it('keeps the done state per player across reads',()=>{
    const storage=memory();
    writeQuests(storage,'captain:Ana',{wave:true,duel:false,lock:true});
    writeQuests(storage,'captain:Ben',{wave:false,duel:true,lock:false});
    expect(readQuests(storage,'captain:Ana')).toEqual({wave:true,duel:false,lock:true});
    expect(readQuests(storage,'captain:Ben')).toEqual({wave:false,duel:true,lock:false});
    expect(readQuests(storage,'device')).toEqual({wave:false,duel:false,lock:false});
    expect(JSON.parse(storage.data.get(QUEST_KEY)).version).toBe(1);
  });
  it('survives broken or blocked storage',()=>{
    const broken={getItem:()=>'{not json',setItem(){throw new Error('quota');}};
    expect(readQuests(broken,'device')).toEqual({wave:false,duel:false,lock:false});
    expect(writeQuests(broken,'device',{wave:true})).toBe(false);
    expect(readQuests(null,'device')).toEqual({wave:false,duel:false,lock:false});
  });
  it('keys a signed-in captain by name and everyone else by device',()=>{
    expect(playerKey({account:{state:'signed_in'},captain:{name:'Brave Puffin 17'}})).toBe('captain:Brave Puffin 17');
    expect(playerKey({account:{state:'signed_out'},captain:{name:'Brave Puffin 17'}})).toBe('device');
    expect(playerKey({account:{state:'signed_in'},captain:{name:'Captain pending'}})).toBe('device');
    expect(playerKey(null)).toBe('device');
  });
  it('summarises progress and says when all three are done',()=>{
    expect(questView({wave:true,duel:false,lock:false})).toMatchObject({doneCount:1,allDone:false,summary:'1 of 3 done'});
    expect(questView({wave:true,duel:true,lock:true}).allDone).toBe(true);
  });
});
