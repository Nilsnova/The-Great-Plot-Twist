// Lane U3: the first-3-minutes quest sequence, its storage, the 3-goal window and the idle hint.
import {describe,expect,it} from 'vitest';
import {QUEST_EVENTS,ISLAND_BUILT,WAVE_FINISHED,PLACE_ARRIVED,HARBOR_STAKE_PLACED,ISLAND_INVITE_OPENED} from '../../src/ui/quest-events.js';
import {FIRST_QUESTS,FIRST_QUEST_KEY,IDLE_HINT_MS,applyQuestEvent,createIdleHint,firstQuestView,readFirstQuests,writeFirstQuests} from '../../src/ui/first-quests.js';

const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),map};};
const run=(events,state={done:0})=>events.reduce((current,event)=>applyQuestEvent(current,event).state,state);

describe('quest event names',()=>{
  it('exports the five names other lanes emit, frozen',()=>{
    expect(QUEST_EVENTS).toEqual({ISLAND_BUILT:'island_built',WAVE_FINISHED:'wave_finished',PLACE_ARRIVED:'place_arrived',
      HARBOR_STAKE_PLACED:'harbor_stake_placed',ISLAND_INVITE_OPENED:'island_invite_opened'});
    expect(Object.isFrozen(QUEST_EVENTS)).toBe(true);
    expect([ISLAND_BUILT,WAVE_FINISHED,PLACE_ARRIVED,HARBOR_STAKE_PLACED,ISLAND_INVITE_OPENED]).toEqual(Object.values(QUEST_EVENTS));
  });
});

describe('the first-3-minutes sequence',()=>{
  it('has the five goals of the pitch in order',()=>{
    expect(FIRST_QUESTS.map(quest=>quest.label)).toEqual(['Build a cannon','Ring the bell and win a wave','Sail to the Harbor','Place a 🪙 stake','Invite a friend']);
    expect(FIRST_QUESTS.every(quest=>quest.hint.length>20)).toBe(true);
  });
  it('completes each goal only from its own event and payload, in order',()=>{
    const full=[{type:ISLAND_BUILT,kind:'cannon'},{type:WAVE_FINISHED,survived:true},{type:PLACE_ARRIVED,id:'saltreach_harbor'},{type:HARBOR_STAKE_PLACED},{type:ISLAND_INVITE_OPENED}];
    let state={done:0};const completed=[];
    for(const event of full){const result=applyQuestEvent(state,event);expect(result.changed).toBe(true);completed.push(result.completed.id);state=result.state;}
    expect(completed).toEqual(['cannon','wave','harbor','stake','invite']);expect(state).toEqual({done:5});
    expect(applyQuestEvent(state,{type:ISLAND_INVITE_OPENED})).toMatchObject({changed:false,completed:null});
  });
  it('ignores a wall, a lost wave, another place and an event for a later goal',()=>{
    expect(run([{type:ISLAND_BUILT,kind:'wall'},{type:ISLAND_BUILT},{type:'interact',kind:'cannon'}])).toEqual({done:0});
    // Standing in the Harbor at the start (or staking early) does not skip the cannon.
    expect(run([{type:PLACE_ARRIVED,id:'saltreach_harbor'},{type:HARBOR_STAKE_PLACED},{type:ISLAND_INVITE_OPENED}])).toEqual({done:0});
    const afterCannon=run([{type:ISLAND_BUILT,kind:'cannon'},{type:WAVE_FINISHED,survived:false},{type:WAVE_FINISHED}]);
    expect(afterCannon).toEqual({done:1});
    expect(run([{type:WAVE_FINISHED,survived:true},{type:PLACE_ARRIVED,id:'home_islet'}],afterCannon)).toEqual({done:2});
  });
  it('survives hostile input without throwing',()=>{
    for(const event of [null,undefined,{},{type:ISLAND_BUILT,kind:{toString(){throw new Error('x');}}},{type:ISLAND_BUILT,get kind(){throw new Error('x');}}])
      expect(applyQuestEvent({done:0},event).changed).toBe(false);
    expect(applyQuestEvent(undefined,{type:ISLAND_BUILT,kind:'cannon'}).state).toEqual({done:1});
  });
});

describe('the strip shows three goals at a time',()=>{
  it('starts at the current goal and keeps three visible near the end',()=>{
    const ids=done=>firstQuestView({done}).items.map(item=>`${item.step}${item.done?'✓':item.current?'*':''}`);
    expect(ids(0)).toEqual(['1*','2','3']);expect(ids(1)).toEqual(['2*','3','4']);expect(ids(2)).toEqual(['3*','4','5']);
    expect(ids(3)).toEqual(['3✓','4*','5']);expect(ids(4)).toEqual(['3✓','4✓','5*']);expect(ids(5)).toEqual(['3✓','4✓','5✓']);
    expect(firstQuestView({done:0})).toMatchObject({title:'Goals',progress:'0 of 5',allDone:false,finale:''});
    expect(firstQuestView({done:5})).toMatchObject({progress:'5 of 5',allDone:true,current:null});
    expect(firstQuestView({done:5}).finale).toMatch(/All goals done/);
    for(let done=0;done<=5;done++)expect(firstQuestView({done}).items).toHaveLength(3);
  });
});

describe('progress is kept per device',()=>{
  it('round-trips and clamps stored progress',()=>{
    const storage=memory();
    expect(readFirstQuests(storage)).toEqual({done:0});
    expect(writeFirstQuests(storage,{done:3})).toBe(true);expect(readFirstQuests(storage)).toEqual({done:3});
    for(const raw of ['{bad','{"version":2,"done":3}','{"version":1,"done":"x"}','{"version":1,"done":1.5}'])
      {storage.setItem(FIRST_QUEST_KEY,raw);expect(readFirstQuests(storage)).toEqual({done:0});}
    storage.setItem(FIRST_QUEST_KEY,'{"version":1,"done":99}');expect(readFirstQuests(storage)).toEqual({done:5});
    const blocked={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
    expect(readFirstQuests(blocked)).toEqual({done:0});expect(writeFirstQuests(blocked,{done:1})).toBe(false);expect(readFirstQuests(null)).toEqual({done:0});
  });
});

describe('the idle hint',()=>{
  it('fires once after 20 s standing still, and again only after the player moves',()=>{
    expect(IDLE_HINT_MS).toBe(20000);
    const hint=createIdleHint(),fired=[];
    for(let second=1;second<=45;second++)if(hint.step(1000))fired.push(second);
    expect(fired).toEqual([20]);
    expect(hint.step(1000,{moving:true})).toBe(false);
    for(let second=1;second<=20;second++)if(hint.step(1000))fired.push(`again ${second}`);
    expect(fired).toEqual([20,'again 20']);
  });
  it('does not count time behind a panel and restarts after progress',()=>{
    const hint=createIdleHint({after:3000});
    expect([hint.step(2000),hint.step(5000,{blocked:true}),hint.step(500)]).toEqual([false,false,false]);
    hint.progress();expect(hint.stillFor).toBe(0);
    expect([hint.step(2000),hint.step(1000)]).toEqual([false,true]);
  });
});
