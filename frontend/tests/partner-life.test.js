import {describe,it,expect} from 'vitest';
import {initialCaseState} from '../src/adapter/fake/state.js';
import {confirmTakeover,partnerLifeView,previewTakeover,recordPartnerEvent} from '../src/adapter/fake/partner-life.js';

function crewState(){
  const state=initialCaseState();state.now=120;state.crew={status:'active',seats:[
    {seat:1,kind:'player',kitId:'true_keeper',name:'Captain Reed'},
    {seat:2,kind:'npc',kitId:'informant',archetype:'salvager',name:'Salvager partner'},
    {seat:3,kind:'npc',kitId:'stranger',archetype:'deckhand',name:'Deckhand partner'},
    {seat:4,kind:'npc',kitId:'witness',archetype:'cook',name:'Cook partner'},
  ]};state.found={1:[],2:['C4'],3:['C5'],4:['C2']};return state;
}

describe('fake partner life projection',()=>{
  it('projects travel, working, return, duty, and reports without changing case state',()=>{
    const state=crewState();state.jobs=[{id:1,seat:2,order:'search',target:'back_room',cardId:'C4',orderedAt:0,readyAt:600,done:false}];
    const before=structuredClone(state),first=partnerLifeView(state),again=partnerLifeView(state),life=first.find(item=>item.seat===2).life;
    expect(first).toEqual(again);expect(state).toEqual(before);expect(life.status).toBe('travelling');expect(life.travel.stage).toBe('outbound');
    expect(life.actor.place).toBe('saltreach_harbor');expect(life.chartLine.active).toBe(true);expect(life.portraitId).toBe('crew-salvager-portrait');
    state.now=300;expect(partnerLifeView(state).find(item=>item.seat===2).life.status).toBe('working');
    state.now=480;expect(partnerLifeView(state).find(item=>item.seat===2).life.travel.stage).toBe('returning');
    state.jobs[0].done=true;state.duties=[{seat:2,lightId:'harbor_light'}];
    const duty=partnerLifeView(state).find(item=>item.seat===2).life;expect(duty.status).toBe('on_duty');expect(duty.post.onDuty).toBe(true);
    expect(duty.actor.place).toBe('saltreach_harbor');
  });
  it('maps refusals to the six neutral line groups and supplies portraits',()=>{
    const state=crewState(),reasons={wrong_kit:'wrong_kit',light_not_for_partners:'wrong_kit',no_coins:'no_coins',locked_window:'locked_window',busy:'busy',already_have:'already_have',no_lead:'not_ready',not_carrying:'not_ready',not_nightfall:'not_ready',light_taken:'not_ready'};
    for(const [reason,group] of Object.entries(reasons)){
      const event=recordPartnerEvent(state,{seat:2,reason});expect(event.group).toBe(group);expect(event.portraitId).toBe('crew-salvager-portrait');expect(event.text.length).toBeGreaterThan(0);
    }
    const life=partnerLifeView(state).find(item=>item.seat===2).life;expect(life.refusal.group).toBe('not_ready');
    expect(life.refusal.text).not.toContain('C4');expect(life.refusal.text).not.toContain('D1');
  });
});

describe('developer takeover rehearsal helper',()=>{
  it('previews exact kit match first, else the last available NPC kit order',()=>{
    const state=crewState();expect(previewTakeover(state,'witness').preview.seat).toBe(4);
    expect(previewTakeover(state,'true_keeper').preview.seat).toBe(4);
    expect(previewTakeover(state,'unknown').accepted).toBe(false);
  });
  it('keeps satchel, pins, and running work, gives friend kit, and releases light duty',()=>{
    const state=crewState();state.found[4]=['C2','C7'];state.pins=[{seat:4,cardId:'C7'}];
    state.jobs=[{id:9,seat:4,order:'man_light',target:'harbor_light',orderedAt:10,readyAt:610,done:false}];
    state.duties=[{seat:4,lightId:'keepers_lamp'}];state.night={posts:[{seat:4,lightId:'keepers_lamp'}],locks:[{seat:4,lightId:'keepers_lamp'}]};
    const choice=previewTakeover(state,'true_keeper').preview,result=confirmTakeover(state,choice);
    expect(result.accepted).toBe(true);expect(state.crew.seats[3]).toMatchObject({kind:'player',kitId:'true_keeper'});
    expect(state.found[4]).toEqual(['C2','C7','C6']);expect(state.pins).toEqual([{seat:4,cardId:'C7'}]);
    expect(state.jobs[0]).toMatchObject({done:false,partnerDeparted:true});expect(state.duties).toEqual([]);expect(state.night.posts).toEqual([]);expect(state.night.locks).toEqual([]);
    expect(partnerLifeView(state).some(item=>item.seat===4)).toBe(false);
  });
  it('does not confirm a stale partner-seat preview',()=>{
    const state=crewState(),preview=previewTakeover(state,'witness').preview;state.crew.seats[3].kind='player';
    expect(confirmTakeover(state,preview).accepted).toBe(false);
  });
});
