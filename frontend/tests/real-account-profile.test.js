// Recorded account intents prove naming, intro, deletion and private ledger mapping without a service.
import {describe,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createAdapterStore} from '../src/online/case-adapter/store.js';
import {createAdapterTransport} from '../src/online/case-adapter/transport.js';
import {createProfileHandlers,initializeAccountName} from '../src/online/case-adapter/profile.js';
import {refreshAccountRewards} from '../src/online/case-adapter/rewards.js';

const me={id:'private-player-placeholder',captainName:'Placeholder captain',coins:30,crews:[],kit:null,place:null};
const okay=data=>({ok:true,status:200,data});
const fail=(status,code)=>({ok:false,status,code});
function setup(){
  const session=createSession();session.setToken(String(Math.random()));
  const store=createAdapterStore({session});store.commit({me});
  const calls=[],replies=[],reads=new Map([
    ['/api/me',okay(me)],['/api/save',okay({version:2,data:{}})],
  ]);
  const get=async route=>{calls.push({method:'GET',route});return reads.get(route);};
  const change=method=>async(route,body)=>{calls.push({method,route,body});return replies.shift()??fail(404,'feature_off');};
  const api={get,post:change('POST'),put:change('PUT'),del:change('DELETE')};
  const ctx={store,state:store.state,session,api,publicApi:api,now:()=>0,random:()=>0.5,
    accept:message=>({accepted:true,reason:null,message}),refuse:reason=>({accepted:false,reason,message:'Placeholder account message.'})};
  ctx.transport=createAdapterTransport(ctx);ctx.signOut=vi.fn(async()=>{session.clearToken();});
  return {ctx,handlers:createProfileHandlers(ctx),calls,replies,reads,store};
}
describe('real account profile',()=>{
  it('initializes the generated name with no body and maps its remaining reroll',async()=>{
    const test=setup();test.replies.push(okay({captainName:'Placeholder captain',rerollsLeft:1}));
    expect((await initializeAccountName(test.ctx)).accepted).toBe(true);
    expect(test.calls).toEqual([{method:'POST',route:'/api/me/name',body:undefined}]);
    expect(test.store.read().account).toMatchObject({captainName:'Placeholder captain',canReroll:true});
  });
  it('does not accept malformed name replies or initialize a signed-out account',async()=>{
    const test=setup();test.replies.push(okay({captainName:'Unconfirmed placeholder'}));
    expect((await initializeAccountName(test.ctx)).reason).toBe('invalid_request');
    expect(test.store.state.nameReply).toBeNull();test.ctx.session.clearToken();
    expect((await initializeAccountName(test.ctx)).reason).toBe('sign_in_required');
    expect(test.calls).toHaveLength(1);
  });
  it('disables reroll after a successful change and after its used refusal',async()=>{
    const test=setup();test.replies.push(okay({captainName:'Another placeholder',rerollsLeft:0}));
    expect((await test.handlers.rerollName()).accepted).toBe(true);
    expect(test.store.read().account.canReroll).toBe(false);
    test.replies.push(fail(409,'no_rerolls_left'));
    expect((await test.handlers.rerollName()).reason).toBe('name_reroll_used');
    expect(test.store.read().account.canReroll).toBe(false);
  });
  it('refreshes remaining rerolls after already_applied instead of inventing a new name',async()=>{
    const test=setup();test.replies.push(fail(409,'already_applied'),okay({captainName:'Original placeholder',rerollsLeft:0}));
    expect((await test.handlers.rerollName()).accepted).toBe(true);
    expect(test.store.state.nameReply).toEqual({captainName:'Original placeholder',rerollsLeft:0});
    expect(test.calls.filter(call=>call.method==='POST').map(call=>call.route)).toEqual(['/api/me/name/reroll','/api/me/name']);
  });
  it('sends only accepted action ids and saves the confirmed world arrival replay',async()=>{
    const test=setup();const actions=['to_desk','take_key'];
    const profile={ending:'ending_rescue',decision:'warned',readLog:true,coinsPaid:1000,alreadyGranted:false,
      kit:{id:'true_keeper',name:'Server kit',startPlace:'lighthouse_isle',coins:1000,item:{id:'item',name:'Server item',text:'Server description'}}};
    test.replies.push(okay(profile));test.ctx.saves={stageReplay:vi.fn(async()=>({accepted:true}))};
    expect((await test.handlers.completeIntro({ending:'ending_rescue',actions,coins:99999})).accepted).toBe(true);
    expect(test.calls[0]).toEqual({method:'POST',route:'/api/intro/complete',body:{actions}});
    expect(test.ctx.saves.stageReplay).toHaveBeenCalledWith({kind:'world',actions,place:'lighthouse_isle'},{immediate:true});
    expect(test.store.read().arrival.kit).toMatchObject({item:'Server item',startLabel:'Lighthouse Isle'});
  });
  it('does not save an old account arrival when its follow-up read outlives sign-out',async()=>{
    const test=setup();const profile={ending:'ending_rescue',decision:'warned',readLog:false,coinsPaid:1000,alreadyGranted:false,
      kit:{id:'true_keeper',startPlace:'lighthouse_isle',coins:1000,item:{id:'item',name:'Placeholder item',text:'Placeholder text'}}};
    let finish;test.reads.set('/api/me',new Promise(resolve=>{finish=resolve;}));test.replies.push(okay(profile));
    test.ctx.saves={stageReplay:vi.fn()};const pending=test.handlers.completeIntro({actions:['to_desk']});
    await vi.waitFor(()=>expect(test.calls.some(call=>call.method==='GET')).toBe(true));
    test.store.invalidate();test.ctx.session.clearToken();finish(okay(me));
    expect((await pending).reason).toBe('session_expired');expect(test.ctx.saves.stageReplay).not.toHaveBeenCalled();
  });
  it('requires confirmation before deletion and retries an uncertain deletion only once',async()=>{
    const test=setup();expect((await test.handlers.deleteMyData({confirm:false})).reason).toBe('confirmation_required');
    expect(test.calls).toEqual([]);
    test.replies.push(fail(503,'database_unavailable'),okay({deleted:true}));
    expect((await test.handlers.deleteMyData({confirm:true})).accepted).toBe(true);
    expect(test.calls.map(call=>call.method)).toEqual(['DELETE','GET','DELETE']);
    expect(test.ctx.signOut).toHaveBeenCalledOnce();expect(test.ctx.session.isSignedIn()).toBe(false);
  });
  it('never signs out when a successful delete reply lacks deleted true',async()=>{
    const test=setup();test.replies.push(okay({deleted:false}));
    expect((await test.handlers.deleteMyData({confirm:true})).reason).toBe('invalid_request');
    expect(test.ctx.signOut).not.toHaveBeenCalled();
  });
  it('continues a saved public place only when the server confirms a kit',async()=>{
    const test=setup();test.reads.set('/api/me',okay({...me,kit:'witness',place:'saltreach_harbor'}));
    test.reads.set('/api/save',okay({version:2,data:{kind:'world',actions:['to_desk'],place:'home_islet'}}));
    expect((await test.handlers.continueGame()).accepted).toBe(true);
    expect(test.store.state.continuation).toEqual({source:'cloud',kind:'world',actions:['to_desk'],place:'home_islet'});
    test.reads.set('/api/me',okay(me));await test.handlers.continueGame();
    expect(test.store.state.continuation.kind).toBe('intro');
  });
  it('projects sign-in availability without importing auth into presentation code',()=>{
    const test=setup();test.store.commit({signInAllowed:false,auth:{configured:true,message:'Sign-in opens later.'}});
    expect(test.store.read().account).toMatchObject({canSignIn:false,signInMessage:'Sign-in opens later.'});
    test.store.commit({signInAllowed:true,auth:{configured:false,message:'Sign-in is not configured.'}});
    expect(test.store.read().account.canSignIn).toBe(false);
  });
});

describe('real account ledger privacy',()=>{
  it('keeps only amount, reason and a timestamp from own-row results',async()=>{
    const test=setup();test.ctx.auth={readOwnLedger:vi.fn(async()=>({ok:true,rows:[
      {amount:30,reason:'kit_grant',created_at:'2026-11-06T12:00:00Z',ref:'private-reference',id:'private-id'},
      {amount:-5,reason:'building_purchase'},
    ]}))};
    expect((await refreshAccountRewards(test.ctx)).accepted).toBe(true);
    expect(test.store.state.rewardsRows).toEqual([
      {amount:30,reason:'kit_grant',created_at:'2026-11-06T12:00:00Z'},
      {amount:-5,reason:'building_purchase',created_at:null},
    ]);
    expect(JSON.stringify(test.store.read().rewards)).not.toContain('private-');
  });
  it('drops malformed rows and keeps unavailable ledger data empty',async()=>{
    const test=setup();test.ctx.auth={readOwnLedger:vi.fn(async()=>({ok:true,rows:[{amount:0,reason:'kit_grant'},{amount:2,reason:'<bad>'}]}))};
    await refreshAccountRewards(test.ctx);expect(test.store.state.rewardsRows).toEqual([]);
    test.ctx.auth.readOwnLedger.mockResolvedValue({ok:false});await refreshAccountRewards(test.ctx);
    expect(test.store.state.rewardsRows).toEqual([]);
  });
  it('does not apply a ledger result from a previous account scope',async()=>{
    const test=setup();let finish;test.ctx.auth={readOwnLedger:()=>new Promise(resolve=>{finish=resolve;})};
    const pending=refreshAccountRewards(test.ctx);test.store.invalidate();
    finish({ok:true,rows:[{amount:30,reason:'kit_grant'}]});await pending;
    expect(test.store.state.rewardsRows).toEqual([]);
  });
});
