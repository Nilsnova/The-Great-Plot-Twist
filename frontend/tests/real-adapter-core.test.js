// Recorded server answers exercise the real adapter without opening a socket or using credentials.
import {describe,it,expect,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createApi} from '../src/online/api.js';
import {createRealAdapter} from '../src/online/adapter/index.js';
import {viewKeys} from '../src/adapter/contract.js';

const me={id:'private-player-placeholder',captainName:'Placeholder captain',coins:0,kit:null,place:null,crews:[]};
function serverApi({signedIn=false}={}){
  const session=createSession();
  if(signedIn)session.setToken(`fixture-${Date.now()}`);
  const calls=[];
  const replies=new Map([
    ['GET /api/config',{ok:true,status:200,data:{flags:{sign_in:true},auth:{provider:'github'}}}],
    ['GET /api/me',{ok:true,status:200,data:me}],
    ['POST /api/me/name',{ok:true,status:200,data:{captainName:me.captainName,rerollsLeft:1}}],
  ]);
  const request=async(method,path,body)=>{
    calls.push({method,path,body});
    return structuredClone(replies.get(`${method} ${path}`)??{ok:false,status:404,code:'not_found'});
  };
  const api=Object.fromEntries([['get','GET'],['post','POST'],['put','PUT'],['del','DELETE']]
    .map(([key,method])=>[key,(path,body)=>request(method,path,body)]));
  return {api,session,calls,replies};
}

async function flush(){for(let index=0;index<12;index++)await Promise.resolve();}
describe('real adapter core',()=>{
  it('returns at once with a cloned online view while config is pending',async()=>{
    let finish;
    const request=new Promise(resolve=>{finish=resolve;});
    const deps=serverApi();deps.api.get=()=>request;
    const adapter=createRealAdapter({...deps,publicApi:deps.api});
    const before=adapter.read();
    expect(before.mode).toBe('online');expect(before.schema).toBe(1);
    expect(Object.keys(before)).toEqual(expect.arrayContaining(viewKeys));
    expect(adapter.dev).toBeUndefined();
    const copy=adapter.read();copy.captain.name='caller mutation';
    expect(adapter.read().captain.name).not.toBe('caller mutation');
    adapter.dispose();finish({ok:true,status:200,data:{flags:{}}});await flush();
    expect(adapter.read()).toEqual(before);
  });
  it('refuses account intents while signed out without any write',async()=>{
    const deps=serverApi();const adapter=createRealAdapter({...deps,publicApi:deps.api});
    try{
      expect(await adapter.rerollName()).toMatchObject({accepted:false,reason:'sign_in_required'});
      expect(deps.calls.some(call=>call.method!=='GET')).toBe(false);
      for(const name of ['completeIntro','continueGame','createCrew','pin','accuse','buildLight'])expect(adapter[name]).toBeUndefined();
    }finally{adapter.dispose();}
  });
  it('validates input before sending an intent request and never exposes server identifiers',async()=>{
    const deps=serverApi({signedIn:true});const adapter=createRealAdapter({...deps,publicApi:deps.api});
    try{
      await vi.waitFor(()=>{
        expect(deps.calls.some(call=>call.path==='/api/me/name')).toBe(true);
        expect(adapter.read().account.namePending).toBe(false);
      });
      const before=deps.calls.filter(call=>call.method!=='GET').length;
      expect((await adapter.setEmote('dance')).reason).toBe('invalid_emote');
      expect((await adapter.signIn({provider:'other'})).reason).toBe('invalid_request');
      expect((await adapter.deleteMyData({confirm:false})).reason).toBe('confirmation_required');
      expect(deps.calls.filter(call=>call.method!=='GET')).toHaveLength(before);
      expect(JSON.stringify(adapter.read())).not.toContain('private-player-placeholder');
    }finally{adapter.dispose();}
  });
  it('signs out while bootstrap is pending and ignores the old private response',async()=>{
    const deps=serverApi({signedIn:true});let finish;
    const oldGet=deps.api.get;
    deps.api.get=path=>path==='/api/me'?new Promise(resolve=>{finish=resolve;}):oldGet(path);
    const adapter=createRealAdapter({...deps,publicApi:deps.api});
    try{
      await flush();expect(typeof finish).toBe('function');
      expect((await adapter.signOut()).accepted).toBe(true);
      finish({ok:true,status:200,data:me});await flush();
      expect(adapter.read().account.state).toBe('signed_out');
      expect(adapter.read().account.captainName).toBeNull();
    }finally{adapter.dispose();}
  });
  it('keeps public reads token-free even when the private session is signed in',async()=>{
    const session=createSession();session.setToken(`fixture-${Date.now()}`);const seen=[];
    const fetchImpl=async(path,options)=>{
      seen.push({path,hasAuth:Object.hasOwn(options.headers,'Authorization')});
      const data=path==='/api/config'?{flags:{}}:me;
      return new Response(JSON.stringify(data),{status:200});
    };
    const api=createApi({session,fetchImpl});
    const publicApi=createApi({session:{getToken:()=>null,clearToken(){}},fetchImpl});
    const adapter=createRealAdapter({api,publicApi,session});
    try{await flush();expect(seen.find(call=>call.path==='/api/config')?.hasAuth).toBe(false);}
    finally{adapter.dispose();}
  });
});
