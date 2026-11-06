// Recorded server answers exercise the real adapter without opening a socket or using credentials.
import {describe,it,expect} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createApi} from '../src/online/api.js';
import {createRealCaseAdapter} from '../src/online/case-adapter/index.js';
import {caseViewKeys} from '../src/adapter/contract.js';

const me={id:'private-player-placeholder',captainName:'Placeholder captain',coins:0,kit:null,place:null,crews:[]};
function serverApi({signedIn=false}={}){
  const session=createSession();
  if(signedIn)session.setToken(`fixture-${Date.now()}`);
  const calls=[];
  const replies=new Map([
    ['GET /api/config',{ok:true,status:200,data:{flags:{sign_in:true},auth:{provider:'github'}}}],
    ['GET /api/me',{ok:true,status:200,data:me}],
    ['GET /api/save',{ok:true,status:200,data:{version:1,data:{},updatedAt:null}}],
    ['GET /api/crews/me',{ok:true,status:200,data:{crew:null}}],
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
    const adapter=createRealCaseAdapter({...deps,publicApi:deps.api});
    const before=adapter.read();
    expect(before.mode).toBe('online');expect(before.schema).toBe(1);
    expect(Object.keys(before)).toEqual(expect.arrayContaining(caseViewKeys));
    expect(adapter.dev).toBeUndefined();
    const copy=adapter.read();copy.captain.name='caller mutation';
    expect(adapter.read().captain.name).not.toBe('caller mutation');
    adapter.dispose();finish({ok:true,status:200,data:{flags:{}}});await flush();
    expect(adapter.read()).toEqual(before);
  });
  it('keeps signed-out intro continuation local and refuses a kit without any write',async()=>{
    const deps=serverApi();const adapter=createRealCaseAdapter({...deps,publicApi:deps.api});
    try{
      const result=await adapter.completeIntro({ending:'ending_rescue',actions:['to_desk']});
      expect(result).toMatchObject({accepted:false,reason:'sign_in_required'});
      expect(result.view.arrival.status).toBe('pending');
      expect(deps.calls.some(call=>call.method!=='GET')).toBe(false);
      const resumed=await adapter.continueGame();
      expect(resumed).toMatchObject({accepted:true,view:{continuation:{source:'local',kind:'intro'}}});
    }finally{adapter.dispose();}
  });
  it('validates input before sending an intent request and never exposes server identifiers',async()=>{
    const deps=serverApi({signedIn:true});const adapter=createRealCaseAdapter({...deps,publicApi:deps.api});
    try{
      await flush();const before=deps.calls.filter(call=>call.method!=='GET').length;
      for(const receipt of [{actions:[]},{actions:['UPPER']},{actions:Array(301).fill('to_desk')}]){
        expect((await adapter.completeIntro(receipt)).reason).toBe('intro_incomplete');
      }
      expect((await adapter.deleteMyData({confirm:false})).reason).toBe('confirmation_required');
      expect(deps.calls.filter(call=>call.method!=='GET')).toHaveLength(before);
      expect(JSON.stringify(adapter.read())).not.toContain('private-player-placeholder');
    }finally{adapter.dispose();}
  });
  it('continues anonymous progress immediately while the network is pending',async()=>{
    const deps=serverApi();deps.api.get=()=>new Promise(()=>{});
    const adapter=createRealCaseAdapter({...deps,publicApi:deps.api});
    try{expect((await adapter.continueGame()).accepted).toBe(true);}
    finally{adapter.dispose();}
  });
  it('signs out while bootstrap is pending and ignores the old private response',async()=>{
    const deps=serverApi({signedIn:true});let finish;
    const oldGet=deps.api.get;
    deps.api.get=path=>path==='/api/me'?new Promise(resolve=>{finish=resolve;}):oldGet(path);
    const adapter=createRealCaseAdapter({...deps,publicApi:deps.api});
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
      const data=path==='/api/config'?{flags:{}}:path==='/api/me'?me:
        path==='/api/crews/me'?{crew:null}:{version:1,data:{}};
      return new Response(JSON.stringify(data),{status:200});
    };
    const api=createApi({session,fetchImpl});
    const publicApi=createApi({session:{getToken:()=>null,clearToken(){}},fetchImpl});
    const adapter=createRealCaseAdapter({api,publicApi,session});
    try{await flush();expect(seen.find(call=>call.path==='/api/config')?.hasAuth).toBe(false);}
    finally{adapter.dispose();}
  });
});
