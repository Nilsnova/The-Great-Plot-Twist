// The actual factory routes public bulletin reads through its token-free client and private retry capability.
import {afterEach,describe,it,expect,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createApi} from '../src/online/api.js';
import {createRealCaseAdapter} from '../src/online/case-adapter/index.js';
import {createOnlineBulletin} from '../src/online/case-adapter/bulletin.js';
import {findPanelServices} from '../src/online/panel-services.js';
import {recordedBulletin} from './fixtures/server/bulletin.js';
const held=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const owners=[];
afterEach(()=>{for(const owner of owners.splice(0))owner.dispose();});
function setup({flag=true,signedIn=false,readBulletin}={}){
  const session=createSession();if(signedIn)session.setToken('fixture-'+crypto.randomUUID());
  let currentFlag=flag;
  const requests=[],privateApi={get:vi.fn(async()=>({ok:false,status:404,code:'not_found'}))};
  const document=new EventTarget();document.hidden=false;const window=new EventTarget();window.location={search:''};
  const fetchImpl=async(path,options)=>{
    requests.push({path,bearer:Object.hasOwn(options.headers,'Authorization')});
    const data=path==='/api/config'?{flags:{bulletin:currentFlag},auth:{provider:'github'}}
      :await(readBulletin?.()??recordedBulletin({hook:true}));
    return data instanceof Response?data:new Response(JSON.stringify(data),{status:200});
  };
  const publicApi=createApi({session:{getToken:()=>null,clearToken(){}},fetchImpl});
  const auth={read:()=>({state:'signed_out',configured:false}),restore:async()=>{},
    signOut:async()=>{},subscribe:()=>()=>{},dispose(){}};
  const loadBulletin=vi.fn(async()=>({createOnlineBulletin}));
  const adapter=createRealCaseAdapter({session,api:privateApi,publicApi,auth,document,window,
    loadBulletin,readLocalSave:()=>null});owners.push(adapter);
  return {adapter,session,requests,loadBulletin,privateApi,window,setFlag:value=>{currentFlag=value;}};
}
describe('real factory public bulletin composition',()=>{
  it('clears a completed optional read failure when accepted config disables the bulletin',async()=>{
    const item=setup({readBulletin:()=>new Response(JSON.stringify({error:{code:'bulletin_unavailable',message:'Recorded public bulletin unavailable.'}}),{status:503})});
    await vi.waitFor(()=>expect(item.adapter.read().account.connection.state).toBe('error'),{timeout:1000});
    const configReads=item.requests.filter(row=>row.path==='/api/config').length;
    item.setFlag(false);item.window.dispatchEvent(new Event('focus'));
    await vi.waitFor(()=>expect({bulletin:item.adapter.read().bulletin.status,connection:item.adapter.read().account.connection.state}).toEqual({bulletin:'off',connection:'idle'}),{timeout:1000});
    expect(item.requests.filter(row=>row.path==='/api/config')).toHaveLength(configReads+1);
    expect(item.requests.filter(row=>row.path==='/api/config').every(row=>!row.bearer)).toBe(true);
    const count=item.requests.filter(row=>row.path==='/api/bulletin').length;
    expect((await findPanelServices(item.session).retryBulletin()).ok).toBe(false);
    expect(item.requests.filter(row=>row.path==='/api/bulletin')).toHaveLength(count);
  });
  it('treats authoritative feature-off as an optional closed feature without a global outage',async()=>{
    const item=setup({readBulletin:()=>new Response(JSON.stringify({error:{code:'feature_off',message:'Recorded optional feature is closed.'}}),{status:404})});
    await vi.waitFor(()=>expect(item.requests.filter(row=>row.path==='/api/bulletin')).toHaveLength(1));
    await vi.waitFor(()=>expect(item.adapter.read().bulletin.status).toBe('off'));
    expect(item.adapter.read().account.connection.state).toBe('idle');
  });
  it.each([false,'true',1])('keeps non-true flag %s off without loading its reader',async flag=>{
    const item=setup({flag});
    await vi.waitFor(()=>expect(findPanelServices(item.session)?.isReady()).toBe(true));
    await Promise.resolve();expect(item.loadBulletin).not.toHaveBeenCalled();
    expect(item.adapter.read().bulletin.status).toBe('off');
    expect(item.requests.filter(row=>row.path==='/api/bulletin')).toHaveLength(0);
  });
  it.each([false,true])('uses anonymous config/bulletin reads while signedIn=%s',async signedIn=>{
    const item=setup({signedIn});
    await vi.waitFor(()=>expect(item.adapter.read().bulletin.status).toBe('ready'));
    expect(item.loadBulletin).toHaveBeenCalledOnce();
    expect(item.requests.some(row=>row.path==='/api/bulletin')).toBe(true);
    expect(item.requests.every(row=>row.bearer===false)).toBe(true);
    expect(item.adapter.read().log.observations[0].id).toBe('recorded_hook');
    if(!signedIn)expect(item.privateApi.get).not.toHaveBeenCalled();
  });
  it('refreshes from the private public-read capability without adding a case intent or private call',async()=>{
    const item=setup();await vi.waitFor(()=>expect(item.adapter.read().bulletin.status).toBe('ready'));
    const lease=findPanelServices(item.session),before=item.requests.length;
    expect(typeof item.adapter.retryBulletin).toBe('undefined');
    expect((await lease.retryBulletin()).ok).toBe(true);
    expect(item.requests.slice(before)).toEqual([{path:'/api/bulletin',bearer:false}]);
    expect(item.privateApi.get).not.toHaveBeenCalled();
  });
  it('rejects old public hook replies across sign-out and accepts only the fresh scope',async()=>{
    const old=held(),fresh=held();let count=0;
    const item=setup({readBulletin:()=>++count===1?old.promise:fresh.promise});
    await vi.waitFor(()=>expect(count).toBe(1));
    await item.adapter.signOut();await vi.waitFor(()=>expect(count).toBe(2));
    old.resolve(recordedBulletin({hook:true,text:'Old public bulletin.'}));
    await Promise.resolve();await Promise.resolve();
    expect(item.adapter.read().bulletin.status).not.toBe('ready');
    expect(item.adapter.read().log.observations).toEqual([]);
    fresh.resolve(recordedBulletin({text:'Fresh public bulletin.'}));
    await vi.waitFor(()=>expect(item.adapter.read().bulletin.lines[0]?.text).toBe('Fresh public bulletin.'));
    expect(item.adapter.read().log.observations).toEqual([]);
  });
  it('keeps the final public view frozen and detaches private retry after disposal',async()=>{
    const item=setup();await vi.waitFor(()=>expect(item.adapter.read().bulletin.status).toBe('ready'));
    const lease=findPanelServices(item.session),last=item.adapter.read(),count=item.requests.length;
    item.adapter.dispose();expect(findPanelServices(item.session)).toBeNull();
    expect((await lease.retryBulletin()).ok).toBe(false);
    expect(item.requests).toHaveLength(count);expect(item.adapter.read()).toEqual(last);
  });
});


// Additional real-client public/private policy boundaries. The original factory suite above is unchanged.
import * as publicPolicyStores from '../src/online/case-adapter/store.js';
async function settlePublicPolicy(predicate,label){
  for(let turn=0;turn<240&&!predicate();turn++)await Promise.resolve();
  expect(predicate(),label).toBe(true);
}
function setupPublicPolicy(){
  const session=createSession(),credential='fixture-'+crypto.randomUUID();session.setToken(credential);
  const renew=vi.fn(async()=>false);session.setRenewal(renew);
  const journal=JSON.stringify({version:1,actions:['to_desk']});
  const readLocalSave=vi.fn(()=>journal),writeLocalSave=vi.fn(),requests=[],unexpected=[];
  const failures=new Map(),me={id:crypto.randomUUID(),captainName:'Recorded Captain',coins:5,
    kit:'true_keeper',place:'saltreach_harbor',crews:[]};
  const profile={ending:'ending_rescue',decision:'warned',readLog:true,coinsPaid:5,alreadyGranted:false,
    kit:{id:'true_keeper',name:'True Keeper',coins:5,startPlace:'saltreach_harbor',
      item:{id:'recorded_item',name:'Recorded item',text:'Recorded item text.'}}};
  let cloud={version:1,data:{kind:'intro',actions:['to_desk'],place:'lighthouse_isle'},updatedAt:null};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
  const fetchImpl=vi.fn(async(path,options)=>{
    requests.push({path,method:options.method,bearer:Object.hasOwn(options.headers,'Authorization'),body:options.body!==undefined});
    const failure=failures.get(path);
    if(failure&&options.method==='GET')return reply({error:{code:failure.code,message:'UNTRUSTED_PUBLIC_FAILURE_TEXT'}},failure.status);
    if(path==='/api/config')return reply({flags:{sign_in:true,bulletin:true,live_presence:false,case:false}});
    if(path==='/api/bulletin')return reply(recordedBulletin({hook:true}));
    if(path==='/api/me'&&options.method==='GET')return reply(me);
    if(path==='/api/me/name'&&options.method==='POST')return reply({captainName:me.captainName,rerollsLeft:1});
    if(path==='/api/intro/complete'&&options.method==='POST')return reply(profile);
    if(path==='/api/crews/me')return reply({crew:null});
    if(path==='/api/save'&&options.method==='GET')return reply(cloud);
    if(path==='/api/save'&&options.method==='PUT'){
      const body=JSON.parse(options.body);cloud={version:body.version+1,data:body.data,updatedAt:null};return reply(cloud);
    }
    unexpected.push({path,method:options.method});throw new Error('Unexpected injected public policy route');
  });
  // Deliberately share the real private session: actual A2 public-path rules must omit it and never renew/erase it.
  const api=createApi({session,fetchImpl}),publicApi=createApi({session,fetchImpl});
  const authState={state:'signed_in',configured:true};
  const auth={read:()=>({...authState}),restore:vi.fn(async()=>{}),readOwnLedger:vi.fn(async()=>({ok:true,rows:[]})),
    signOut:vi.fn(async()=>{}),subscribe:()=>()=>{},dispose:vi.fn()};
  const document=new EventTarget();document.hidden=false;const window=new EventTarget();window.location={search:''};
  const spy=vi.spyOn(publicPolicyStores,'createAdapterStore');let adapter,store;
  try{
    adapter=createRealCaseAdapter({session,api,publicApi,auth,document,window,clock:()=>Date.now(),random:()=>.5,
      on:()=>()=>{},readLocalSave,writeLocalSave,isCrewVisible:()=>false,loadBulletin:async()=>({createOnlineBulletin})});
    store=spy.mock.results.at(-1)?.value;
  }finally{spy.mockRestore();}
  owners.push(adapter);
  return {adapter,store,session,credential,renew,auth,requests,failures,unexpected,window,readLocalSave,writeLocalSave,journal,
    async ready(){
      await settlePublicPolicy(()=>adapter.read().account.canReroll&&adapter.read().rewards.status==='ready'
        &&adapter.read().bulletin.status==='ready','actual private setup and public bulletin finish');
      expect((await adapter.completeIntro({actions:['to_desk']})).accepted).toBe(true);
      await settlePublicPolicy(()=>adapter.read().account.save.state==='saved','accepted server profile and CAS save finish');
      expect(store.state.profile).toEqual(profile);expect(store.state.me).toEqual(me);
    },
    count:(method,path)=>requests.filter(item=>item.method===method&&(path===undefined||item.path===path)).length,
    privateSnapshot:()=>structuredClone({me:store.state.me,profile:store.state.profile,cloudSave:store.state.cloudSave,
      deviceSave:store.state.deviceSave,nameReply:store.state.nameReply,rewardsRows:store.state.rewardsRows}),
  };
}

describe('actual-client public bulletin and config refusal isolation',()=>{
  it.each([
    ['/api/bulletin',401],['/api/bulletin',409],['/api/config',401],['/api/config',409],
  ])('keeps the current private captain after public %s HTTP%s',async(path,status)=>{
    vi.useFakeTimers();vi.setSystemTime(1000);
    const f=setupPublicPolicy();
    try{
      await f.ready();
      const before=f.privateSnapshot(),accountBefore=f.adapter.read().account,authBefore=f.auth.read();
      const scope=f.session.getScope(),writes=f.requests.filter(item=>item.method!=='GET').length;
      const localWrites=f.writeLocalSave.mock.calls.length;
      f.failures.set(path,{status,code:status===409?'stale_save':'session_expired'});
      if(path==='/api/bulletin')expect((await findPanelServices(f.session).retryBulletin()).ok).toBe(false);
      else f.window.dispatchEvent(new Event('focus'));
      await settlePublicPolicy(()=>f.adapter.read().account.connection.state==='error','public failure commits an ordinary connection error');
      const view=f.adapter.read();expect(view.account.connection).toMatchObject({state:'error',reason:'internal_error'});
      expect(view.account.connection.message).not.toMatch(/expired|sign in|conflict/i);
      if(path==='/api/config'){
        expect(view.notice).toEqual({reason:'internal_error',
          message:'The service could not complete this request. Please try again.'});
        expect(view.notice.message).not.toMatch(/expired|sign in|which copy|conflict/i);
      }
      expect(view.account).toMatchObject({state:'signed_in',captainName:accountBefore.captainName,
        hasKit:true,save:{state:'saved'}});
      expect(f.privateSnapshot()).toEqual(before);expect(f.auth.read()).toEqual(authBefore);
      expect(f.session.isSignedIn()).toBe(true);expect(f.session.getScope()).toBe(scope);
      expect(f.session.getToken()===f.credential).toBe(true);expect(f.renew).not.toHaveBeenCalled();
      expect(f.auth.signOut).not.toHaveBeenCalled();expect(f.writeLocalSave).toHaveBeenCalledTimes(localWrites);
      expect(f.readLocalSave()).toBe(f.journal);
      expect(f.requests.filter(item=>item.method!=='GET')).toHaveLength(writes);
      expect(f.requests.filter(item=>item.path===path).every(item=>!item.bearer&&!item.body)).toBe(true);
      if(path==='/api/bulletin'){
        const request=view.bulletin.request;
        expect(request).toEqual({reason:'internal_error',status,message:'The public bulletin could not be read. Try again or report a problem.'});
        expect(Object.keys(request).sort()).toEqual(['message','reason','status']);
        expect(f.store.state.bulletin.request).toEqual(request);
        request.message='caller mutation';request.status=0;request.retryUntil=0;
        expect(f.adapter.read().bulletin.request).toEqual(f.store.state.bulletin.request);
        expect(f.adapter.read().bulletin.request).toMatchObject({reason:'internal_error',status});
        expect(f.adapter.read().bulletin.request).not.toHaveProperty('retryUntil');
      }
      expect(JSON.stringify(view)).not.toContain('UNTRUSTED_PUBLIC_FAILURE_TEXT');
      expect(f.unexpected).toEqual([]);
    }finally{f.adapter.dispose();vi.useRealTimers();}
  });

  it('still expires the real private session when a private ME read receives401',async()=>{
    const f=setupPublicPolicy();
    try{
      await f.ready();f.failures.set('/api/me',{status:401,code:'session_expired'});
      const writes=f.requests.filter(item=>item.method!=='GET').length;
      const result=await f.adapter.continueGame();
      expect(result).toMatchObject({accepted:false,reason:'session_expired'});
      expect(f.session.isSignedIn()).toBe(false);expect(f.session.getToken()).toBeNull();
      expect(f.renew).toHaveBeenCalledOnce();expect(f.adapter.read().account.state).toBe('expired');
      expect(f.store.state.me).toBeNull();expect(f.store.state.profile).toBeNull();
      expect(f.readLocalSave()).toBe(f.journal);expect(f.writeLocalSave).not.toHaveBeenCalled();
      expect(f.requests.filter(item=>item.method!=='GET')).toHaveLength(writes);expect(f.unexpected).toEqual([]);
    }finally{f.adapter.dispose();}
  });
});
