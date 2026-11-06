// Placeholder DTOs prove the real projection without transport, secrets or case answers.
import {describe,it,expect} from 'vitest';
import {composeRealView} from '../src/online/case-adapter/view.js';
import {mapAccount,mapArrival} from '../src/online/case-adapter/account-view.js';
import {mapCrew} from '../src/online/case-adapter/crew-view.js';
import {caseViewKeys} from '../src/adapter/contract.js';
import {kits,kitDisplay,kitArchetype} from '../src/adapter/shared/kits.js';

const me={id:'private-player',displayName:'private-login',captainName:'Captain Example',coins:27,
  kit:'witness',place:'saltreach_harbor',crews:[{id:'private-crew'}]};
const profile={ending:'ending_trapped',decision:'warned',readLog:true,coinsPaid:11,alreadyGranted:false,
  kit:{id:'witness',name:'Witness',startPlace:'saltreach_harbor',coins:11,
    item:{id:'placeholder-item',name:'Supplied item',text:'Supplied description'},cheapCard:'placeholder-card'}};
const signed={accountState:'signed_in',me,profile,nameReply:{captainName:'Captain Example',rerollsLeft:1}};
const deviceSave={data:{kind:'intro',actions:['placeholder_action'],place:'lighthouse_isle'},updatedAt:'device-time'};
const cloudSave={version:2,data:{kind:'world',actions:['placeholder_action'],place:'saltreach_harbor'},
  updatedAt:'cloud-time'};
const crew={id:'private-crew',code:'EXAMPLE',status:'forming',mode:'crew',mySeat:1,startedAt:null,seats:[
  {seatNo:1,holder:'player',name:'Captain Example',kit:'witness',isMe:true,id:'private-player'},
  {seatNo:2,holder:'partner',name:'Partner Example',kit:{id:'informant'},partnerId:'private-partner'},
  {seatNo:3,holder:'open',name:null,kit:null},
  {seatNo:4,holder:'player',name:'Captain Sample',kit:{id:'stranger',name:'Stranger'},isMe:false},
]};

describe('real view projection',()=>{
  it('starts with every schema key and safe empty case sections',()=>{
    const view=composeRealView();
    expect(Object.keys(view).sort()).toEqual([...caseViewKeys].sort());
    expect(view).toMatchObject({schema:1,mode:'online',revision:0,now:0,captain:{coins:null},
      board:{cards:[],deductions:[],suspects:[]},reveal:{available:false,lines:[]},world:{lightsOn:false}});
    expect(view.presence.status).toBe('off');
    expect(view.bulletin.status).toBe('off');
  });
  it('returns owned nested snapshots and never exposes real identifiers',()=>{
    const state={...signed,crew,continuation:{source:'cloud',kind:'intro',actions:['placeholder_action'],
      place:'lighthouse_isle',id:'private-continuation'}};
    const first=composeRealView(state);
    first.crew.seats[0].name='changed';
    first.continuation.actions.push('changed');
    expect(composeRealView(state).crew.seats[0].name).toBe('Captain Example');
    expect(state.continuation.actions).toEqual(['placeholder_action']);
    expect(JSON.stringify(composeRealView(state))).not.toContain('private-');
  });
  it('maps the server intro item as strings and uses the public place label',()=>{
    expect(mapArrival(signed)).toMatchObject({status:'ready',endingLabel:'Tower ending',coins:11,
      kit:{id:'witness',name:'Witness',item:'Supplied item',startLabel:'Saltreach Harbor'},
      items:['Supplied item'],readLog:true,destination:'saltreach_harbor'});
    expect(mapArrival(signed).logCard.message).toBeTruthy();
  });
  it('marks a replay as welcome back and invents no inventory for a known kit',()=>{
    expect(mapArrival({...signed,profile:{...profile,alreadyGranted:true}}).title).toBe('Welcome back');
    expect(mapArrival({...signed,profile:null})).toMatchObject({items:[],kit:{name:'Witness',item:''}});
    expect(mapArrival({})).toMatchObject({status:'pending',items:[]});
  });
  it('maps captain data and the exact reroll availability',()=>{
    expect(composeRealView(signed).captain).toMatchObject({name:'Captain Example',coins:27});
    expect(mapAccount(signed)).toMatchObject({hasKit:true,canReroll:true,captainName:'Captain Example'});
    expect(mapAccount({...signed,nameReply:{rerollsLeft:0}}).canReroll).toBe(false);
    expect(composeRealView({...signed,accountState:'signed_out'}).captain.coins).toBeNull();
    expect(composeRealView({accountState:'signed_in',me:{coins:0}}).captain.coins).toBe(0);
  });
  it('projects save summaries without the saved data or version',()=>{
    const account=mapAccount({...signed,deviceSave,cloudSave,saveState:'saved'});
    expect(account).toMatchObject({canContinue:true,save:{state:'saved',source:'cloud',updatedAt:'cloud-time',
      device:{state:'saved',updatedAt:'device-time'},cloud:{state:'saved',updatedAt:'cloud-time'}}});
    expect(JSON.stringify(account)).not.toContain('placeholder_action');
    expect(JSON.stringify(account)).not.toContain('version');
  });
  it('blocks continue on conflict and retains the local save after expiry',()=>{
    expect(mapAccount({...signed,cloudSave,deviceSave,saveState:'conflict'}))
      .toMatchObject({canContinue:false,save:{state:'conflict',source:null}});
    expect(mapAccount({...signed,cloudSave,deviceSave,accountState:'expired'}))
      .toMatchObject({canContinue:true,save:{source:'device'}});
    expect(mapAccount({...signed,cloudSave,deviceSave,continuation:{source:'local'}}).save.source).toBe('device');
  });
  it('does not offer continuation for empty data or a legacy engine snapshot',()=>{
    const noKit={...signed,me:{...me,kit:null},profile:null};
    expect(mapAccount({...noKit,cloudSave:{data:{}}}).canContinue).toBe(false);
    expect(mapAccount({...noKit,cloudSave:{data:{intro:{scene:'placeholder_scene'}}}}).canContinue).toBe(false);
    expect(mapAccount({...noKit,cloudSave:{data:{kind:'intro',actions:['bad-action']}}}).canContinue).toBe(false);
    expect(mapAccount({...noKit,cloudSave:{data:{kind:'world',actions:[]}}}).canContinue).toBe(true);
    expect(mapAccount(signed).canContinue).toBe(true);
    expect(mapAccount({...signed,saveState:'conflict'}).canContinue).toBe(false);
  });
  it.each(['idle','saving','saved','offline','conflict'])('keeps save state %s readable',saveState=>{
    expect(mapAccount({...signed,deviceSave,saveState}).save.state).toBe(saveState);
    expect(mapAccount({...signed,deviceSave,saveState}).save.label).toBeTruthy();
  });
  it('maps four seats, shared kit art and forming permissions without identity fields',()=>{
    const view=composeRealView({...signed,crew});
    expect(view.crew.seats.map(seat=>seat.kind)).toEqual(['player','npc','open','player']);
    expect(view.crew.seats[0]).toMatchObject({seat:1,isYou:true,kit:{id:'witness',name:'Witness'},cards:[]});
    expect(view.crew.seats[1].archetype).toBe('salvager');
    expect(view.permissions).toEqual({createCrew:false,joinCrew:false,muster:true});
    expect(composeRealView(signed).permissions).toEqual({createCrew:true,joinCrew:true,muster:false});
    expect(composeRealView({...signed,crew:{...crew,status:'finished'}}).permissions.muster).toBe(false);
  });
  it('maps a local join preview and safe open seats before a crew exists',()=>{
    const preview={code:'EXAMPLE',seat:null,replaces:null,message:'Confirm this crew.',id:'private-preview'};
    expect(mapCrew({joinPreview:preview}).seats).toHaveLength(4);
    expect(mapCrew({joinPreview:preview}).joinPreview).toEqual({code:'EXAMPLE',seat:null,replaces:null,
      message:'Confirm this crew.'});
  });
  it('exposes only wallet amount, reason, plain label, time and local row identifiers',()=>{
    const rewardsRows=[{id:'private-row',player_id:'private-player',ref:'private-reference',amount:4,
      reason:'clue_reward',created_at:'row-time',label:'private-label'}];
    const view=composeRealView({...signed,rewardsRows});
    expect(view.rewards).toMatchObject({balance:27,ledger:[{amount:4,reason:'clue_reward',
      label:'clue reward',at:'row-time'}],keepsakes:[],epilogue:[],festivalBadge:false});
    expect(JSON.stringify(view)).not.toContain('private-');
  });
  it('shares display names and art only, with no kit grants or item rules',()=>{
    expect(Object.keys(kits.witness).sort()).toEqual(['archetype','id','name']);
    expect(kitDisplay('witness')).toEqual({id:'witness',name:'Witness'});
    expect(kitArchetype('true_keeper')).toBe('navigator');
    expect(kitArchetype('unknown')).toBeNull();
  });
});
