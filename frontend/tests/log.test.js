import {describe,it,expect} from 'vitest';
import {initialCaseState} from '../src/adapter/fake/state.js';
import {caseLogView} from '../src/adapter/fake/log.js';

describe('fake Captain’s Log projection',()=>{
  it('starts with an empty log and keeps reveal entries hidden before the accepted solve',()=>{
    const state=initialCaseState(),view=caseLogView(state);
    expect(view).toEqual({intro:null,cards:[],deductions:[],partnerReports:[],nights:[],reveal:[]});
    state.revealIndex=4;expect(caseLogView(state).reveal).toEqual([]);
  });

  it('projects accepted intro choices, cards with recorded place and case time, deductions and partner reports',()=>{
    const state=initialCaseState();
    state.profile={ending:'ending_rescue',kitId:'true_keeper',readLog:true,actions:['to_desk','read_log']};
    state.found[1]=['C1'];state.deductions=['D1'];
    state.jobs=[{id:1,order:'search',cardId:'C1',seat:1,spot:'notice_board',readyAt:185,done:true},
      {id:2,order:'fetch',cardId:'C2',seat:2,spot:'ferry_pier',readyAt:360,done:true,orderedBy:1,report:'Fog nights only is in seat 2’s journal.'}];
    state.crew={seats:[{seat:1,name:'Captain Lantern'},{seat:2,name:'Cook partner'}]};
    const before=structuredClone(state),view=caseLogView(state);
    expect(view.intro).toEqual({ending:'Rescue ending',kit:'True Keeper',actions:[{id:'to_desk',label:'Searched the writing desk'},{id:'read_log',label:'Read Elena’s last log entry'}],readLog:true});
    expect(view.cards[0]).toMatchObject({id:'C1',title:'The reward notice',seat:1,where:'Reward notice',place:'saltreach_harbor',caseMinute:3});
    expect(view.deductions).toEqual([{id:'D1',title:'Where',cards:['C1','C2']}]);
    expect(view.partnerReports[0]).toMatchObject({seat:2,name:'Cook partner',report:'Fog nights only is in seat 2’s journal.',done:true,caseMinute:6});
    expect(state).toEqual(before);
  });

  it('shows only placeholder reveal lines after the accepted solve',()=>{
    const state=initialCaseState();state.solved=true;state.profile={kitId:'true_keeper',actions:[]};
    const view=caseLogView(state);
    expect(view.reveal.length).toBeGreaterThan(0);
    expect(view.reveal.every(line=>line.text==='[revealed by the server]')).toBe(true);
    state.solved=false;expect(caseLogView(state).reveal).toEqual([]);
  });
});
