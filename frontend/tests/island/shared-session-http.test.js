// Canonical session client through the actual private lease and authenticated HTTP transport.
import {it,expect,vi} from 'vitest';
import {createSession} from '../../src/online/session.js';
import {createApi} from '../../src/online/api.js';
import {registerPanelServices} from '../../src/online/panel-services.js';
import {createSharedSessionApi} from '../../src/island/shared-session-api.js';
import {createSharedSessionClient} from '../../src/island/shared-session-client.js';
import {actorId,sessionId,economy,metadata} from './shared-session-fixture.js';
it('attaches and independently reads control through existing authenticated wrappers',async()=>{
 const session=createSession();session.setToken('synthetic-verified-session');
 const fetchImpl=vi.fn(async(_url,options)=>new Response(JSON.stringify(metadata(!String(_url).endsWith('/disconnect'))),{status:200}));
 const http=createApi({session,fetchImpl}),lease=registerPanelServices(session,{api:http,isReady:()=>true,getFlags:()=>({}),getActorId:()=>actorId});
 const rows=new Map(),storage={getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value)};
 const api=createSharedSessionApi({transport:lease.request,getEconomy:economy,getActorId:()=>lease.getActorId()});
 const client=createSharedSessionClient({api,getEconomy:economy,getActorId:()=>lease.getActorId(),getAuthGeneration:session.getScope,
  storage,locks:{request:async(_name,_options,run)=>run({})},makeSessionId:()=>sessionId,makeUid:()=> 'attach_http_001',setTimer:()=>1,clearTimer(){}});
 try{
  expect((await client.open()).ok).toBe(true);expect(client.proof()).not.toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(fetchImpl.mock.calls.map(call=>call[1].headers)).toEqual([
   expect.objectContaining({'X-Island-Economy-Version':'1',Authorization:'Bearer synthetic-verified-session'}),
   expect.objectContaining({'X-Island-Economy-Version':'1',Authorization:'Bearer synthetic-verified-session'}),
  ]);
  const sent=JSON.parse(fetchImpl.mock.calls[0][1].body);
  expect(sent).toEqual({economy:{mode:'island_shared',version:1,islandOwner:actorId,runEpoch:economy().runEpoch},
   sessionId,expectedGeneration:'0',actionUid:'attach_http_001'});
  expect(fetchImpl.mock.calls[1][0]).toContain('/api/island/session?');
  expect(fetchImpl.mock.calls[1][0]).toContain('connectionGeneration=9007199254740993');
 }finally{await client.dispose();lease.dispose();}
});
