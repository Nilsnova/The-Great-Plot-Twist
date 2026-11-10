// Recorded account intents prove naming and deletion without a service.
import {describe,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createAdapterStore} from '../src/online/adapter/store.js';
import {createAdapterTransport} from '../src/online/adapter/transport.js';
import {createProfileHandlers,initializeAccountName} from '../src/online/adapter/profile.js';

const me={id:'private-player-placeholder',captainName:'Placeholder captain',coins:30,crews:[],kit:null,place:null};
const okay=data=>({ok:true,status:200,data});
const fail=(status,code)=>({ok:false,status,code});
function setup(){
  const session=createSession();session.setToken(String(Math.random()));
  const store=createAdapterStore({session});store.commit({me});
  const calls=[],replies=[],reads=new Map([
    ['/api/me',okay(me)],
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
  it('offers no intro, save or continue intents any more',()=>{
    const test=setup();
    expect(Object.keys(test.handlers).sort()).toEqual(['deleteMyData','rerollName']);
  });
  it('projects sign-in availability without importing auth into presentation code',()=>{
    const test=setup();test.store.commit({signInAllowed:false,auth:{configured:true,message:'You are signed in.'}});
    expect(test.store.read().account).toMatchObject({canSignIn:false,
      signInMessage:'Sign-in opens later. You can keep playing on this device.'});
    test.store.commit({signInAllowed:true,auth:{configured:false,message:'Sign-in is not configured.'}});
    expect(test.store.read().account).toMatchObject({canSignIn:false,signInMessage:'Sign-in is not configured.'});
  });
});
