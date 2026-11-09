// G29 C1: the real adapter's guest gating, provider list and demo_closed answers, with recorded replies.
import {describe,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createRealCaseAdapter} from '../src/online/case-adapter/index.js';
import {validateIntent} from '../src/online/case-adapter/validate.js';
import {mapAccount} from '../src/online/case-adapter/account-view.js';
import {mapApiResult} from '../src/online/case-adapter/reasons.js';
import {providerActions,signInProviders} from '../src/screens/account/providers.js';

const me={id:'private-player-placeholder',captainName:'Placeholder captain',coins:0,kit:null,place:null,crews:[]};
function setup(config){
  const session=createSession(),calls=[];
  const replies=new Map([['GET /api/config',{ok:true,status:200,data:config}],['GET /api/me',{ok:true,status:200,data:me}],
    ['GET /api/save',{ok:true,status:200,data:{version:1,data:{},updatedAt:null}}],['GET /api/crews/me',{ok:true,status:200,data:{crew:null}}],
    ['POST /api/me/name',{ok:true,status:200,data:{captainName:me.captainName,rerollsLeft:1}}]]);
  const request=async(method,path,body)=>{calls.push({method,path,body});return structuredClone(replies.get(`${method} ${path}`)??{ok:false,status:404,code:'not_found'});};
  const api=Object.fromEntries([['get','GET'],['post','POST'],['put','PUT'],['del','DELETE']].map(([key,method])=>[key,(path,body)=>request(method,path,body)]));
  let state={state:'signed_out',message:'',configured:true};const listeners=new Set();
  const publish=next=>{state=next;for(const listener of listeners)listener(state);};
  const auth={read:()=>state,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},restore:vi.fn(async()=>({ok:true})),
    signIn:vi.fn(async()=>({ok:true})),upgrade:vi.fn(async()=>({ok:true})),signOut:vi.fn(async()=>({ok:true})),dispose(){},
    signInAnonymously:vi.fn(async()=>{session.setToken(`fixture-${Date.now()}`);publish({state:'signed_in',message:'',configured:true,guest:true});return {ok:true,state:'signed_in'};})};
  const adapter=createRealCaseAdapter({api,publicApi:api,session,auth});
  return {adapter,auth,session,calls};
}
const base={flags:{sign_in:true},auth:{provider:'github',supabaseUrl:''}};

describe('guest sign-in through the adapter',()=>{
  it('signs a visitor in as a guest only while the demo is open',async()=>{
    const f=setup({...base,demo:{open:true}});
    try{
      const result=await f.adapter.signIn({guest:true});
      expect(result).toMatchObject({accepted:true});
      expect(f.auth.signInAnonymously).toHaveBeenCalledOnce();expect(f.auth.signIn).not.toHaveBeenCalled();
      await vi.waitFor(()=>expect(f.adapter.read().account).toMatchObject({state:'signed_in',guest:true}));
    }finally{f.adapter.dispose();}
  });
  it('keeps local play when the demo is closed or the config has no demo',async()=>{
    for(const config of [{...base,demo:{open:false}},base]){
      const f=setup(config);
      try{
        expect(await f.adapter.signIn({guest:true})).toMatchObject({accepted:false,reason:'demo_closed'});
        expect(f.auth.signInAnonymously).not.toHaveBeenCalled();expect(f.auth.signIn).not.toHaveBeenCalled();
        expect(f.adapter.read().account.state).toBe('signed_out');
      }finally{f.adapter.dispose();}
    }
  });
  it('offers each configured provider and refuses one that is not listed',async()=>{
    const f=setup({...base,auth:{provider:'github',providers:['github','google']}});
    try{
      await vi.waitFor(()=>expect(f.adapter.read().account.providers).toEqual(['github','google']));
      expect(await f.adapter.signIn({provider:'google'})).toMatchObject({accepted:true});
      expect(f.auth.signIn).toHaveBeenCalledWith('google');
    }finally{f.adapter.dispose();}
    const g=setup(base);
    try{
      await vi.waitFor(()=>expect(g.adapter.read().account.providers).toEqual(['github']));
      expect(await g.adapter.signIn({provider:'google'})).toMatchObject({accepted:false,reason:'invalid_request'});
      expect(await g.adapter.signIn()).toMatchObject({accepted:true});expect(g.auth.signIn).toHaveBeenCalledWith('github');
    }finally{g.adapter.dispose();}
  });
  it('upgrades only a guest, through the auth upgrade',async()=>{
    const f=setup({...base,demo:{open:true},auth:{providers:['github','google']}});
    try{
      expect(await f.adapter.signIn({upgrade:true})).toMatchObject({accepted:false,reason:'invalid_request'});
      await f.adapter.signIn({guest:true});
      expect(await f.adapter.signIn({provider:'google',upgrade:true})).toMatchObject({accepted:true});
      expect(f.auth.upgrade).toHaveBeenCalledWith('google');
    }finally{f.adapter.dispose();}
  });
});

describe('guest shapes and answers',()=>{
  it('validates sign-in options before any transport',()=>{
    for(const ok of [undefined,{},{provider:'google'},{guest:true},{provider:'github',upgrade:true}])expect(validateIntent('signIn',[ok])).toBeNull();
    for(const bad of [null,'github',[],{provider:'myspace'},{guest:false},{guest:true,provider:'github'},{guest:true,upgrade:true},{extra:1}])
      expect(validateIntent('signIn',[bad])).toMatchObject({accepted:false,reason:'invalid_request'});
  });
  it('shows a plain message for 403 demo_closed and keeps other 403s as forbidden',()=>{
    expect(mapApiResult({ok:false,status:403,code:'demo_closed'},{route:'/api/me'})).toMatchObject({accepted:false,reason:'demo_closed',
      message:expect.stringMatching(/^Guest play is closed right now\./)});
    expect(mapApiResult({ok:false,status:403,code:'not_host'},{route:'/api/me'})).toMatchObject({reason:'forbidden'});
  });
  it('maps guest and provider facts into the account view',()=>{
    expect(mapAccount({accountState:'signed_in',auth:{guest:true,configured:true},config:{auth:{providers:['google','github','google','x']}}}))
      .toMatchObject({guest:true,providers:['google','github']});
    expect(mapAccount({accountState:'signed_out',auth:{guest:true}})).toMatchObject({guest:false,providers:['github']});
  });
  it('turns providers into plain sign-in and upgrade buttons',()=>{
    expect(signInProviders({})).toEqual(['github']);
    expect(providerActions({providers:['github','google']}).map(item=>[item.label,item.args,item.focus])).toEqual([
      ['Sign in with GitHub',[],'account-sign-in'],['Sign in with Google',[{provider:'google'}],'account-sign-in-google']]);
    expect(providerActions({providers:['google']},{prefix:'Keep progress with',upgrade:true,focus:'up'}).map(item=>[item.label,item.args]))
      .toEqual([['Keep progress with Google',[{provider:'google',upgrade:true}]]]);
  });
});
