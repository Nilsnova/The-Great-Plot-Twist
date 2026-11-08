// Earned response DTOs only: generated identities, schematic supplied prose and no case content.
import {randomUUID} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {validateCase, validateWorld} from '../src/online/case-adapter/case-shapes.js';
import {projectCase} from '../src/online/case-adapter/case-view.js';
import {createCaseEffects} from '../src/online/case-adapter/case-effects.js';

function world(fields = {}) {
  return {stage:'dark',lightsOn:false,fogBankGone:false,gullsRestOpen:false,extraLights:0,solves:0,
    relitAt:null,wall:[],line:null,...fields};
}
function fixture() {
  return {caseId:`case_${randomUUID()}`,writeRevision:2,now:60,minute:1,
    crew:{id:randomUUID(),status:'active',mode:'crew',mySeat:1,startedAt:'2026-11-08T00:00:00Z'},
    seats:[{seatNo:1,holder:'player',name:'Recorded captain',kit:'navigator',kitName:'Recorded kit',isMe:true}],
    me:{seatNo:1,kit:'navigator',readLog:false,coins:20,timber:2},premise:'Recorded premise.',question:'Recorded question.',
    board:{cards:[{id:'C1',title:'Recorded card',text:'Supplied earned text.',state:'pinned',
      holders:[{seat:1,label:'Recorded captain'}],pinnedBy:[{seat:1,label:'Recorded captain',byPartner:false}],
      foundLine:'Supplied found line.',foundSecond:10,routeId:'C1.recorded',hotspot:'saltreach_harbor.recorded',canPin:false}],
      leads:[{cardId:'C2',title:'Recorded lead',lead:'Supplied lead.'}],logLead:null,
      deductions:[{id:'D1',name:'Recorded deduction',complete:false}],
      suspects:[{id:'recorded_suspect',title:'Recorded suspect',cleared:false,clearedBy:null}],canPair:true,pairWait:0},
    search:{spots:[{hotspot:'saltreach_harbor.recorded',place:'saltreach_harbor',routes:[{id:'C1.recorded',kind:'free',cardId:'C1',
      title:'Recorded card',label:'Supplied route.',timerSeconds:60,price:0,kitName:null,canStart:true,reason:null,statusText:'Ready to search.',waitMinutes:0}]},
      {hotspot:'lighthouse_isle.recorded',place:'lighthouse_isle',closedLine:'Supplied closed line.'}],
      jobs:[{routeId:'C1.recorded',cardId:'C1',title:'Recorded search',total:60,remaining:0,done:true,foundLine:'Supplied completion.'}]},
    accusation:{schoonerFound:false,allowed:false,cooldown:0,status:'Supplied accusation status.',
      suspects:[{id:'recorded_suspect',title:'Recorded suspect',cleared:false}],evidence:[],lastWrong:null},
    reveal:{available:false},credits:[],
    finale:{phase:'waiting',nightNo:0,canCall:false,remaining:0,dawnRemaining:0,status:'Supplied night status.',glow:null,parted:null,
      lights:[{id:'keepers_lamp',name:'Recorded light',x:100,y:100,ready:true,partnersMayMan:true,post:null,lock:null,lastBearing:null,canTake:false,canAim:false}]},
    partners:[{seat:2,name:'Recorded partner',partnerId:randomUUID(),kit:'deckhand',kitName:'Recorded kit',status:'idle',canOrder:true,
      orders:[{id:'fetch',label:'Supplied order.'}],targets:{fetch:[{id:'C2',label:'Recorded target'}],man_light:[]},
      satchel:[{id:'C1',title:'Recorded card',pinned:true}],job:null}]};
}
const valid = value => {const result=validateCase(value);expect(result.ok).toBe(true);return result.value;};

describe('real case serializer validation and graphics projection',()=>{
  it('accepts a null case distinctly from a malformed response',()=>{
    expect(validateCase(null)).toEqual({ok:true,value:null});
    for(const value of [undefined,[],{},false])expect(validateCase(value).ok).toBe(false);
  });
  it('accepts published nullable timber and closed-route copy without making them into grants',()=>{
    const raw=fixture();raw.me.timber=null;raw.search.spots[1].closedLine=null;
    expect(validateCase(raw)).toMatchObject({ok:true,value:{me:{timber:null}}});
    expect(projectCase(valid(raw),{activeSpot:'lighthouse_isle.recorded'}).search.routes).toEqual([]);
  });
  it('accepts the main world schema without branch-only caps or a fabricated timestamp',()=>{
    const raw=world({stage:'relit',lightsOn:true,fogBankGone:true,gullsRestOpen:true,extraLights:20,solves:0,
      relitAt:null,line:'Supplied public coast line.',wall:Array.from({length:201},(_,order)=>({name:'Recorded captain',order}))});
    expect(validateWorld(raw).ok).toBe(true);
    expect(validateWorld({...raw,relitAt:'2026-11-08T00:01:00+00:00'}).ok).toBe(true);
  });
  it('validates every nested record before producing a caller-owned snapshot',()=>{
    const raw=fixture();raw.privateValue='drop this';raw.board.cards[0].privateValue='drop this too';
    const copy=valid(raw);expect(copy).not.toHaveProperty('privateValue');expect(copy.board.cards[0]).not.toHaveProperty('privateValue');
    raw.board.cards[0].text='Changed by response owner';expect(copy.board.cards[0].text).toBe('Supplied earned text.');
    copy.search.spots[0].routes[0].label='Changed by caller';expect(raw.search.spots[0].routes[0].label).toBe('Supplied route.');
  });
  it.each([
    raw=>{raw.board.cards[0].holders[0].seat='1';},
    raw=>{raw.search.spots[0].routes[0].canStart='true';},
    raw=>{raw.search.jobs[0].remaining=NaN;},
    raw=>{raw.finale.lights[0].lock={remaining:5,aimedBySeat:'1'};},
    raw=>{raw.partners[0].satchel[0].pinned=1;},
    raw=>{raw.reveal={available:true,solvedSecond:60,world:'unchanged',lines:[{id:'recorded',kind:'evidence',text:'Supplied line.',cites:[2]}],credits:[]};},
  ])('refuses malformed deep content without returning a partial earned view',mutate=>{
    const raw=fixture();mutate(raw);const answer=validateCase(raw);expect(answer.ok).toBe(false);expect(answer).not.toHaveProperty('value');
  });
  it('maps only supplied earned cards, server availability and the selected local spot',()=>{
    const raw=fixture(),view=projectCase(valid(raw),{activeSpot:'saltreach_harbor.recorded'});
    expect(view.board.cards).toHaveLength(1);expect(view.board.cards[0]).toMatchObject({id:'C1',body:'Supplied earned text.',canPin:false});
    expect(view.board.cards.some(card=>card.id==='C2')).toBe(false);
    expect(view.search.routes[0]).toMatchObject({id:'C1.recorded',seconds:60,price:0,canStart:true});
    expect(view.search.jobs[0]).toMatchObject({report:'Supplied completion.',remaining:0,done:true});
    const elsewhere=projectCase(valid(raw),{activeSpot:'lighthouse_isle.recorded'});expect(elsewhere.search.routes).toEqual([]);
    expect(raw.search.spots[0].routes[0]).not.toHaveProperty('seconds');
  });
  it('preserves supplied complete deduction and evidence without inferring a suspect',()=>{
    const raw=fixture();raw.board.deductions=[{id:'D1',name:'Recorded deduction',complete:true,cards:['C1'],finding:'Supplied finding.',
      clears:'recorded_suspect',clearLine:'Supplied clearing.',opens:['recorded_route'],opensLine:'Supplied opening.'}];
    raw.accusation.evidence=[{id:'D1',name:'Recorded deduction'}];
    const view=projectCase(valid(raw));expect(view.board.deductions[0]).toMatchObject({title:'Recorded deduction',finding:'Supplied finding.'});
    expect(view.board.suspects[0].cleared).toBe(false);expect(view.accusation.allowed).toBe(false);
  });
  it('clears private case sections when the server returns no case while retaining public coast facts',()=>{
    const view=projectCase(null,{world:world()});
    expect(view.board.cards).toEqual([]);expect(view.search.routes).toEqual([]);expect(view.partners).toEqual([]);
    expect(view.accusation.allowed).toBe(false);expect(view.reveal.available).toBe(false);expect(view.world.lightsOn).toBe(false);
  });
  it('uses supplied reveal lines with a bounded presentation cursor and no invented prose',()=>{
    const raw=fixture();raw.reveal={available:true,solvedSecond:60,world:'unchanged',lines:[{id:'recorded',kind:'evidence',text:'Supplied line.',cites:['C1']}],credits:[]};
    const first=projectCase(valid(raw),{revealIndex:0}).reveal;expect(first).toMatchObject({available:true,index:0,total:1,done:false});
    expect(first.line).toMatchObject({text:'Supplied line.',cites:['C1']});
    const end=projectCase(valid(raw),{revealIndex:100}).reveal;expect(end.index).toBe(1);expect(end.done).toBe(true);
  });
  it('keeps partner jobs and public world facts separate from unavailable coordinates or festival rights',()=>{
    const raw=fixture();raw.partners[0].job={orderNo:1,order:'fetch',target:'C2',total:60,remaining:10,done:false,arrived:false,line:'Supplied partner report.'};
    const view=projectCase(valid(raw),{world:validateWorld(world()).value});
    expect(view.partners[0].job).toMatchObject({remaining:10,report:'Supplied partner report.'});
    expect(view.partners[0].life?.actor??null).toBeNull();expect(view.world).toMatchObject({stage:'dark',lightsOn:false,festivalRemaining:0,canClaimLantern:false});
    expect(validateWorld({...world(),wall:[{name:'Recorded public captain',order:'1'}]}).ok).toBe(false);
  });
});

describe('real case cinematic ownership',()=>{
  it('seeds every new account/case without replay and emits unique increasing lifetime IDs',()=>{
    const tracker=createCaseEffects(),raw=fixture(),scope={};
    expect(tracker.update(valid(raw),{scope,world:world()})).toEqual([]);
    raw.finale.parted={second:60,lights:['keepers_lamp','harbor_light','islet_signal_station'],target:{x:120,y:130}};
    const shots=tracker.update(valid(raw),{scope,world:world()});expect(shots.map(effect=>effect.name)).toEqual(['three_lights','fog_lift','schooner_reveal']);
    expect(tracker.update(valid(raw),{scope,world:world()})).toEqual([]);
    const later=tracker.update(valid(raw),{scope,world:world({stage:'relit',lightsOn:true,fogBankGone:true,gullsRestOpen:true,solves:1,relitAt:'2026-11-08T00:01:00Z'})});
    expect(later.map(effect=>effect.name)).toEqual(['relighting']);expect(later[0].id).toBeGreaterThan(shots.at(-1).id);
    raw.reveal={available:true,solvedSecond:60,world:'unchanged',lines:[],credits:[]};
    const unmask=tracker.update(valid(raw),{scope,world:world({stage:'relit',lightsOn:true,fogBankGone:true,gullsRestOpen:true,solves:1,relitAt:'2026-11-08T00:01:00Z'})});
    expect(unmask.map(effect=>effect.name)).toEqual(['unmask']);expect(unmask[0].id).toBeGreaterThan(later[0].id);
    const other=fixture();other.finale.parted=raw.finale.parted;other.reveal=raw.reveal;
    expect(tracker.update(valid(other),{scope,world:world()})).toEqual([]);
    tracker.reset();const nextScope={},next=fixture();expect(tracker.update(valid(next),{scope:nextScope,world:world()})).toEqual([]);
    next.reveal={available:true,solvedSecond:60,world:'unchanged',lines:[],credits:[]};
    const afterReset=tracker.update(valid(next),{scope:nextScope,world:world()});expect(afterReset.map(effect=>effect.name)).toEqual(['unmask']);
    expect(afterReset[0].id).toBeGreaterThan(unmask[0].id);
    tracker.dispose();expect(tracker.update(valid(next),{scope:nextScope,world:world()})).toEqual([]);
  });
  it('copies cinematic parameters and does not replay an already-seen server milestone',()=>{
    const tracker=createCaseEffects(),raw=fixture(),scope='recorded-scope';tracker.update(valid(raw),{scope});
    raw.finale.parted={second:60,lights:['keepers_lamp','harbor_light','islet_signal_station'],target:{x:100,y:110}};
    const effects=tracker.update(valid(raw),{scope});raw.finale.parted.target.x=200;expect(effects[0].params.target.x).toBe(100);
    expect(new Set(effects.map(effect=>effect.id)).size).toBe(3);
    tracker.update(null,{scope});expect(tracker.update(valid(raw),{scope})).toEqual([]);
  });
});

// Elapsed time changes presentation clocks, never server decisions or completion.
it('keeps server outcomes and permission flags while displaying elapsed relative timers',()=>{
  const raw=fixture();raw.board.pairWait=20;raw.board.canPair=false;
  raw.search.jobs[0].remaining=5;raw.search.jobs[0].done=false;
  raw.finale.remaining=7;raw.finale.canCall=false;raw.accusation.cooldown=8;
  raw.finale.lights[0].lock={remaining:3,aimedBySeat:1};
  const view=projectCase(valid(raw),{elapsed:10});
  expect(view.now).toBe(70);expect(view.board.pairWait).toBe(10);expect(view.board.canPair).toBe(false);
  expect(view.search.jobs[0]).toMatchObject({remaining:0,done:false});
  expect(view.finale).toMatchObject({remaining:0,canCall:false,phase:'waiting'});
  expect(view.finale.lights[0].lock).toEqual({remaining:0,aimedBySeat:1});
  expect(view.accusation).toMatchObject({cooldown:0,allowed:false});
  expect(raw.search.jobs[0].remaining).toBe(5);
});
