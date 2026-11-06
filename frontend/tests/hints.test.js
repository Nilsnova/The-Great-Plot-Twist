import {describe,it,expect} from 'vitest';
import {initialCaseState} from '../src/adapter/fake/state.js';
import {hintsView} from '../src/adapter/fake/hints.js';
import {filterHintActions,normalizeHintPreferences} from '../src/shell/hints/logic.js';

describe('fake guidance and local hint preferences',()=>{
  it('supplies state-appropriate navigation without embedding it in screens',()=>{
    const state=initialCaseState();expect(hintsView(state).actions[0]).toMatchObject({id:'finish-intro',screen:'arrival',available:true});
    state.profile={kitId:'true_keeper'};expect(hintsView(state).actions[0].id).toBe('form-crew');
    state.crew={status:'forming',seats:[]};expect(hintsView(state).actions[0].id).toBe('muster-crew');
    state.crew={status:'active',seats:[{seat:2,kind:'npc'}]};state.deductions=['D1'];
    expect(hintsView(state).actions.map(item=>item.id)).toEqual(['review-board','search-coast','order-partners','night-screen']);
    state.night={phase:'night'};expect(hintsView(state).actions[0].screen).toBe('finale');
    state.schooner=true;expect(hintsView(state).actions[0].screen).toBe('accusation');
    state.solved=true;expect(hintsView(state).actions[0].screen).toBe('reveal');
  });

  it('filters unavailable entries and duplicate destinations without inferring new actions',()=>{
    const actions=[{id:'one',label:'Board',screen:'board',params:{},available:true},{id:'two',label:'More board',screen:'board',params:{},available:true},
      {id:'locked',label:'Locked',screen:'reveal',available:false},{id:'three',label:'Search',screen:'search',params:{spot:'reef'},available:true}];
    expect(filterHintActions(actions).map(item=>item.id)).toEqual(['one','three']);
    expect(filterHintActions([{id:'one',label:'No route',available:true}])).toEqual([]);
  });

  it('keeps hint preferences bounded and local to the supplied preference object',()=>{
    expect(normalizeHintPreferences({hintsEnabled:false,dismissedHints:['intro','intro',7]})).toEqual({hintsEnabled:false,dismissedHints:['intro']});
    expect(normalizeHintPreferences({hintsEnabled:'off',dismissedHints:'intro'})).toEqual({hintsEnabled:true,dismissedHints:[]});
  });
});
