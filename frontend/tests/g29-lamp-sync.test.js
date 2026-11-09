// G29 C3: "Light the three lamps": the 20 s window, ages instead of clocks, idempotent merges, late
// joiners, duplicates, suppressed ticks and the host's NPC fill.
import {describe,expect,it} from 'vitest';
import {HOLD_MS,LAMP_WINDOW_MS,NPC_FILL_AFTER_MS,RELIT_KEEP_MS,TICK_MS,canNpcFill,createLamps,encodeLamps,expire,hasNews,holdProgress,
  isLampLit,isRelit,lampStatusText,lightLamp,litCount,mergeLamps,npcFill,readLamps,shouldTick} from '../src/class-demo/lamp-sync.js';

describe('lamp rules',()=>{
  it('lights a lamp for 20 s and relights the lighthouse when all three burn at once',()=>{
    let result=lightLamp(createLamps(),0,'Ana',1000);
    expect(result).toMatchObject({changed:true,relitNow:false});expect(isLampLit(result.state.lamps[0],1000+LAMP_WINDOW_MS-1)).toBe(true);
    expect(isLampLit(result.state.lamps[0],1000+LAMP_WINDOW_MS)).toBe(false);
    result=lightLamp(result.state,1,'Ben',8000);result=lightLamp(result.state,2,'Chiara',20500);
    expect(result.relitNow).toBe(true);expect(isRelit(result.state,20500)).toBe(true);expect(result.state.round).toBe(1);
  });
  it('does not relight when the first lamp went out before the third was lit',()=>{
    let state=lightLamp(createLamps(),0,'Ana',0).state;state=lightLamp(state,1,'Ben',5000).state;
    const late=lightLamp(state,2,'Chiara',LAMP_WINDOW_MS+10);
    expect(late.relitNow).toBe(false);expect(litCount(late.state,LAMP_WINDOW_MS+10)).toBe(2);
  });
  it('ignores a second light of a burning lamp, bad indexes and lights after the relight',()=>{
    const state=lightLamp(createLamps(),1,'Ana',0).state;
    expect(lightLamp(state,1,'Ben',500).changed).toBe(false);
    expect(lightLamp(state,3,'Ben',500).changed).toBe(false);
    expect(lightLamp(state,-1,'Ben',500).changed).toBe(false);
  });
  it('turns a message into ages, never clock times, and reads only valid messages',()=>{
    const state=lightLamp(createLamps(),2,'Ana',10000).state;
    expect(encodeLamps(state,12500)).toEqual({v:1,lamps:[null,null,2500],relit:null,started:2500});
    expect(readLamps(encodeLamps(state,12500))).not.toBeNull();
    for(const bad of [null,{v:2},{v:1,lamps:[1,2],relit:null},{v:1,lamps:[null,null,-5],relit:null},
      {v:1,lamps:[null,null,LAMP_WINDOW_MS],relit:null},{v:1,lamps:[null,null,null],relit:1.5},{v:1,lamps:[null,null,null],relit:null,started:-1}])expect(readLamps(bad)).toBeNull();
    expect(JSON.stringify(encodeLamps(state,12500))).not.toContain('Ana');
  });
  it('merges another phone’s state on our own clock and is idempotent for duplicates',()=>{
    const theirs=lightLamp(createLamps(),0,'Ana',500000).state,message=encodeLamps(theirs,503000);
    const once=mergeLamps(createLamps(),message,9000);
    expect(once.changed).toBe(true);expect(once.state.lamps[0]).toEqual({litAt:6000,by:null});
    const twice=mergeLamps(once.state,message,9200);
    expect(twice.changed).toBe(false);expect(twice.state.lamps[0].litAt).toBe(6000);
  });
  it('lets a late joiner adopt the state, including a relit lighthouse, from the next tick',()=>{
    let state=createLamps();for(const [index,at] of [[0,0],[1,1000],[2,2000]])state=lightLamp(state,index,'Ana',at).state;
    const tick=encodeLamps(state,30000);expect(tick.relit).toBe(28000);
    const late=mergeLamps(createLamps(),tick,700000);
    expect(late.relitNow).toBe(true);expect(isRelit(late.state,700000)).toBe(true);
    expect(mergeLamps(late.state,tick,700100)).toMatchObject({changed:false,relitNow:false});
  });
  it('relights on merge when the third lamp arrives from another phone',()=>{
    let mine=lightLamp(createLamps(),0,'Me',0).state;mine=lightLamp(mine,1,'Me too',1000).state;
    const other=lightLamp(createLamps(),2,'Ben',100).state;
    const merged=mergeLamps(mine,encodeLamps(other,600),1500);
    expect(merged.relitNow).toBe(true);
  });
  it('starts a new round ten minutes after a relight',()=>{
    let state=createLamps();for(const index of [0,1,2])state=lightLamp(state,index,'Ana',0).state;
    expect(expire(state,RELIT_KEEP_MS-1)).toBe(state);
    expect(expire(state,RELIT_KEEP_MS)).toMatchObject({relitAt:null,startedAt:null,round:1});
  });
  it('ticks only with news, after 5 s plus jitter, and stays quiet after hearing someone else',()=>{
    const quiet=createLamps(),busy=lightLamp(quiet,0,'Ana',0).state;
    expect(shouldTick({state:quiet,now:60000})).toBe(false);
    expect(shouldTick({state:busy,now:TICK_MS-1,lastSentAt:0})).toBe(false);
    expect(shouldTick({state:busy,now:TICK_MS,lastSentAt:0})).toBe(true);
    expect(shouldTick({state:busy,now:TICK_MS+1500,lastSentAt:0,lastHeardAt:2000,jitter:500})).toBe(false);
    expect(shouldTick({state:busy,now:TICK_MS+2600,lastSentAt:0,lastHeardAt:2000,jitter:500})).toBe(true);
    expect(hasNews(busy,LAMP_WINDOW_MS)).toBe(false);
  });
  it('lets the host fill missing lamps with NPC partners only after 20 s',()=>{
    const state=lightLamp(createLamps(),1,'Presenter',0).state;
    expect(canNpcFill(state,NPC_FILL_AFTER_MS-1)).toBe(false);expect(npcFill(state,NPC_FILL_AFTER_MS-1).changed).toBe(false);
    const filled=npcFill(state,NPC_FILL_AFTER_MS);
    expect(filled.relitNow).toBe(true);expect(filled.state.lamps.map(lamp=>lamp.by)).toEqual(['NPC partner','NPC partner','NPC partner']);
    expect(canNpcFill(filled.state,NPC_FILL_AFTER_MS+1)).toBe(false);
  });
  it('measures the 2 s hold and words the status',()=>{
    expect(holdProgress(null,5)).toBe(0);expect(holdProgress(0,HOLD_MS/2)).toBe(.5);expect(holdProgress(0,HOLD_MS*3)).toBe(1);
    expect(lampStatusText(createLamps(),0)).toMatch(/Three lamps/);
    expect(lampStatusText(lightLamp(createLamps(),0,'Ana',0).state,5000)).toBe('1 of 3 lamps burn. Light the others within 15 s.');
  });
});
